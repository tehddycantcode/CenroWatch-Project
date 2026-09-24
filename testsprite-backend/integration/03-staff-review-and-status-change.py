import os
import json
import base64
import requests


def _base_url():
    """Prefer the URL TestSprite injects; fall back to env, then the tunnel."""
    v = globals().get("TARGET_URL") or os.environ.get("TARGET_URL")
    if not v:
        v = "https://exports-framing-spirits-portland.trycloudflare.com"
    return v.rstrip("/")


def _auth_headers():
    """Credential injected from the project settings. Never hardcoded."""
    h = globals().get("__AUTH_HEADERS__")
    if isinstance(h, dict):
        return dict(h)
    return {}


def _shared(name):
    """A variable produced by an upstream test in the chain.

    TestSprite orders these tests into waves from --produces/--needs. Whether the
    captured VALUE is injected is not something a test should depend on, so every
    consumer here falls back to discovering the record by its marker instead.
    """
    v = globals().get(name) or os.environ.get(name)
    return v or None


BASE = _base_url()
API = BASE + "/api/v1"
TIMEOUT = 30

# Every record this chain creates carries this marker in its description. It is
# the only thing the teardown will archive, and nothing else in the system writes
# it - cleanup is scoped to these rows and never to a broad predicate.
MARKER = "[TESTSPRITE]"

# A real 1x1 PNG. A complaint requires a photo, and uploads are magic-byte
# sniffed, so arbitrary bytes with an image/png content-type are rejected.
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def find_marked_complaints():
    """Every live (non-archived) complaint this chain created, newest first.

    The staff queue already filters archived rows, so anything returned here is
    still visible in the app and still counted by analytics.
    """
    r = requests.get(
        API + "/staff/complaints",
        params={"search": MARKER, "limit": 50},
        headers=_auth_headers(),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, \
        "staff queue lookup failed: %s %s" % (r.status_code, r.text[:200])
    return r.json()["data"]["items"]


def resolve_complaint():
    """The complaint under test: the id produced upstream, else the newest marked one."""
    tracking = _shared("testsprite_complaint_tracking_id")
    items = find_marked_complaints()

    if tracking:
        for it in items:
            if it["tracking_id"] == tracking:
                return it
    assert items, (
        "no live complaint carrying %s was found - the producer test "
        "(create) must run before this one; wave ordering does that automatically "
        "on `test run --all` and `test rerun`." % MARKER
    )
    return items[0]


# STEP 3 of the complaint lifecycle.
# Needs: testsprite_complaint_tracking_id   Produces: testsprite_complaint_reviewed
#
# The staff side of the workflow, and the part no single-endpoint test can reach:
# that staff see the reporter the public view withholds, that a status change
# reaches the resident's tracking page, and that the SLA clock behaves the way
# the office needs it to - it starts on APPROVAL, not at intake, and a status
# round trip must not silently hand the office a fresh deadline.
def _detail(cid):
    r = requests.get(API + "/staff/complaints/%d" % cid, headers=_auth_headers(), timeout=TIMEOUT)
    assert r.status_code == 200, "staff detail for %d: expected 200, got %s: %s" % (cid, r.status_code, r.text[:250])
    return r.json()["data"]["complaint"]


def _set_status(cid, status, note="TestSprite lifecycle check"):
    r = requests.patch(
        API + "/staff/complaints/%d/status" % cid,
        json={"status": status, "note": note},
        headers=_auth_headers(),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, \
        "moving %d to %s should return 200, got %s: %s" % (cid, status, r.status_code, r.text[:250])
    return r.json()["data"]["complaint"]


def test_staff_see_the_reporter_that_the_public_view_withholds():
    complaint = resolve_complaint()
    c = _detail(complaint["complaint_id"])

    assert MARKER in (c["description"] or ""), \
        "resolved the wrong complaint - %r does not carry %s" % (c.get("tracking_id"), MARKER)

    # Exactly the fields the public tracking endpoint refuses to hand out.
    for field in ("description", "latitude", "longitude", "status_history"):
        assert field in c, "staff detail is missing %r; got %r" % (field, sorted(c.keys()))
    assert c["user"], "staff detail has no reporter attached, so nobody can be contacted"


def test_the_sla_clock_starts_on_approval_and_survives_a_round_trip():
    complaint = resolve_complaint()
    cid = complaint["complaint_id"]

    # Intake does not start the clock: a report nobody has approved yet cannot
    # be late. Both fields stay null until someone approves it.
    fresh = _detail(cid)
    if fresh["status"] == "Pending":
        assert fresh["sla_deadline"] is None, \
            "a Pending complaint should have no SLA deadline yet, got %r" % fresh["sla_deadline"]

    # Under_Review is still not approval.
    _set_status(cid, "Under_Review")
    reviewing = _detail(cid)
    assert reviewing["status"] == "Under_Review", "expected Under_Review, got %r" % reviewing["status"]
    assert reviewing["sla_deadline"] is None, \
        "Under_Review must not start the SLA clock, got %r" % reviewing["sla_deadline"]

    # Approval starts it.
    _set_status(cid, "Approved")
    approved = _detail(cid)
    assert approved["status"] == "Approved", "expected Approved, got %r" % approved["status"]
    deadline = approved["sla_deadline"]
    assert deadline, "approving the complaint did not start an SLA clock"

    # The round trip guard: going back and approving again must NOT mint a new
    # deadline, or a breach could be erased by toggling the status.
    _set_status(cid, "Pending", note="TestSprite round-trip check")
    _set_status(cid, "Approved", note="TestSprite round-trip check")
    again = _detail(cid)
    assert again["sla_deadline"] == deadline, \
        "a status round trip reset the SLA deadline (%r -> %r); a breach could be erased this way" % (
            deadline, again["sla_deadline"])


def test_every_transition_is_journalled_and_reaches_the_public_page():
    complaint = resolve_complaint()
    cid = complaint["complaint_id"]
    tracking = complaint["tracking_id"]

    before = len(_detail(cid)["status_history"])
    _set_status(cid, "In_Progress", note="TestSprite journal check")
    history = _detail(cid)["status_history"]

    assert len(history) > before, \
        "status_history did not grow (%d -> %d) - the transition was not recorded" % (before, len(history))

    last = history[-1]
    assert last["new_status"] == "In_Progress", \
        "the newest history entry records %r, not the change just made" % last.get("new_status")
    assert last["old_status"], "the history entry does not record what the status was before"
    assert last["changed_at"], "the history entry has no timestamp"
    assert last["changed_by"], "the history entry does not record who made the change"

    # The resident, holding only a tracking number, sees the same status.
    public = requests.get(API + "/complaints/track/" + tracking, timeout=TIMEOUT)
    assert public.status_code == 200, "public tracking failed after the update: %s" % public.status_code
    assert public.json()["data"]["complaint"]["status"] == "In_Progress", \
        "staff moved %s to In_Progress but the public page shows %r" % (
            tracking, public.json()["data"]["complaint"].get("status"))


def test_an_invalid_status_is_refused():
    complaint = resolve_complaint()
    r = requests.patch(
        API + "/staff/complaints/%d/status" % complaint["complaint_id"],
        json={"status": "Teleported"},
        headers=_auth_headers(),
        timeout=TIMEOUT,
    )
    assert r.status_code == 422, "an invalid status should be refused with 422, got %s" % r.status_code
    assert r.json()["success"] is False, "success should be False for an invalid status"


test_staff_see_the_reporter_that_the_public_view_withholds()
test_the_sla_clock_starts_on_approval_and_survives_a_round_trip()
test_every_transition_is_journalled_and_reaches_the_public_page()
test_an_invalid_status_is_refused()
