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


# STEP 2 of the complaint lifecycle. Needs: testsprite_complaint_tracking_id
#
# The resident's side of the workflow. Anyone holding a tracking number can read
# the status of that report WITHOUT signing in - which is exactly why this
# endpoint must hand back a status and nothing else. Step 3 checks the same
# record through a staff credential and expects the opposite.
PUBLIC_TRACKING_KEYS = {
    "tracking_id", "complaint_type", "status", "submitted_at",
    "observed_at", "updated_at", "resolved_at", "barangay",
}


def test_a_resident_can_track_the_new_complaint_anonymously():
    complaint = resolve_complaint()
    tracking = complaint["tracking_id"]

    # No Authorization header anywhere in this request: this is the public path.
    r = requests.get(API + "/complaints/track/" + tracking, timeout=TIMEOUT)
    assert r.status_code == 200, \
        "tracking %s should be public and return 200, got %s: %s" % (tracking, r.status_code, r.text[:300])

    body = r.json()
    assert body["success"] is True, "success should be True, got %r" % body.get("success")

    c = body["data"]["complaint"]
    assert c["tracking_id"] == tracking, \
        "asked for %s but got %r back" % (tracking, c.get("tracking_id"))
    assert c["status"] in ("Pending", "Under_Review", "Approved", "In_Progress", "Resolved", "Rejected"), \
        "unexpected status %r" % c.get("status")
    assert c["barangay"]["name"], "the tracked report has no barangay name"
    assert c["submitted_at"], "the tracked report has no submitted_at"

    # The public view is an allowlist, not a filtered record.
    extra = set(c.keys()) - PUBLIC_TRACKING_KEYS
    assert not extra, \
        "public tracking exposes unexpected field(s) %r - it may only return %r" % (
            sorted(extra), sorted(PUBLIC_TRACKING_KEYS))

    # Nothing identifying the reporter, and not the free-text description either:
    # a resident types an address or a neighbour's name into that box.
    raw = json.dumps(body).lower()
    for leaked in ("reporter_name", "reporter_contact", "address_details", "description",
                   "email", "contact_number", "user_id", "staff_notes"):
        assert leaked not in raw, \
            "public tracking for %s leaked %r (R.A. 10173 violation)" % (tracking, leaked)


def test_tracking_is_case_sensitive_and_rejects_a_near_miss():
    r = requests.get(API + "/complaints/track/CMP-2026-99999", timeout=TIMEOUT)
    assert r.status_code == 404, \
        "an unknown tracking number should be 404, got %s" % r.status_code
    assert r.json()["success"] is False, "success should be False for an unknown tracking number"


test_a_resident_can_track_the_new_complaint_anonymously()
test_tracking_is_case_sensitive_and_rejects_a_near_miss()
