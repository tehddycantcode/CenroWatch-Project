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


# STEP 4 - TEARDOWN. Needs: testsprite_complaint_tracking_id
# Created with --category teardown so the wave planner runs it last.
#
# Archiving is this system's soft delete: GIS, analytics, the staff queues and
# public tracking all filter archived rows, so this hands the map, the dashboard
# and the SLA figures back exactly as the run found them.
#
# It cleans up EVERY live complaint carrying the marker, not just this run's, so
# a run that died half way does not leave test data behind for good. Each
# candidate is confirmed to carry the marker in its own description before it is
# touched: cleanup is scoped to these rows, never to a broad predicate.
ARCHIVE_REASON = "TestSprite integration test cleanup"


def _confirm_is_ours(cid):
    r = requests.get(API + "/staff/complaints/%d" % cid, headers=_auth_headers(), timeout=TIMEOUT)
    assert r.status_code == 200, "could not read complaint %d before archiving it: %s" % (cid, r.status_code)
    c = r.json()["data"]["complaint"]
    return MARKER in (c["description"] or "")


def test_the_lifecycle_records_are_archived_and_vanish_from_every_public_surface():
    leftovers = find_marked_complaints()
    assert leftovers, (
        "no live complaint carrying %s was found to clean up - the create test "
        "must run before this one (wave ordering handles that)." % MARKER
    )

    archived = []
    for item in leftovers:
        cid = item["complaint_id"]
        tracking = item["tracking_id"]

        assert _confirm_is_ours(cid), \
            "refusing to archive %s: its description does not carry %s" % (tracking, MARKER)

        r = requests.patch(
            API + "/admin/archive/complaints/%s" % tracking,
            json={"reason": ARCHIVE_REASON},
            headers=_auth_headers(),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, \
            "archiving %s should return 200, got %s: %s" % (tracking, r.status_code, r.text[:250])
        report = r.json()["data"]["report"]
        assert report["archived_at"], "%s came back with no archived_at" % tracking
        assert report["archive_reason"] == ARCHIVE_REASON, \
            "%s recorded the reason as %r" % (tracking, report.get("archive_reason"))
        archived.append(tracking)

    # Gone from the queue staff work from.
    still_live = [i["tracking_id"] for i in find_marked_complaints()]
    assert not still_live, "these test complaints are still live after teardown: %r" % still_live

    # Gone from the resident's tracking page.
    for tracking in archived:
        pub = requests.get(API + "/complaints/track/" + tracking, timeout=TIMEOUT)
        assert pub.status_code == 404, \
            "%s is archived but public tracking still answers %s" % (tracking, pub.status_code)

    # Gone from the public map.
    markers = requests.get(API + "/gis/map", timeout=TIMEOUT).json()["data"]["markers"]
    ids_on_map = {m["id"] for m in markers}
    leaked = [t for t in archived if t in ids_on_map]
    assert not leaked, "archived complaints are still plotted on the public map: %r" % leaked


def test_archiving_the_same_report_twice_is_refused():
    # The teardown above archived everything; re-archiving must not silently
    # overwrite the original reason and timestamp.
    r = requests.get(API + "/admin/archive", headers=_auth_headers(), timeout=TIMEOUT)
    assert r.status_code == 200, "the archive listing should be 200, got %s" % r.status_code

    entries = r.json()["data"]
    items = entries.get("items") if isinstance(entries, dict) else entries
    ours = [e for e in (items or []) if e.get("archive_reason") == ARCHIVE_REASON]
    if not ours:
        return  # nothing of ours in the archive to re-check

    # The archive listing names the reference "reference", not "tracking_id".
    tracking = ours[0].get("reference") or ours[0].get("tracking_id")
    assert tracking, "an archive entry carries no reference: %r" % ours[0]
    again = requests.patch(
        API + "/admin/archive/complaints/%s" % tracking,
        json={"reason": "second attempt"},
        headers=_auth_headers(),
        timeout=TIMEOUT,
    )
    assert again.status_code == 409, \
        "archiving %s twice should be refused with 409, got %s: %s" % (tracking, again.status_code, again.text[:200])


test_the_lifecycle_records_are_archived_and_vanish_from_every_public_surface()
test_archiving_the_same_report_twice_is_refused()
