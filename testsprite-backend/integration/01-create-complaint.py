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


# STEP 1 of the complaint lifecycle. Produces: testsprite_complaint_tracking_id
#
# Files a real complaint through the resident endpoint, photo and all. Everything
# downstream in this chain works on the record this test creates, and the
# teardown archives it again so the map, the stats and the dashboard return to
# the numbers they had before the run.
def test_a_complaint_can_be_filed_end_to_end():
    fields = {
        "complaint_type": "Illegal_Dumping",
        "barangay_id": "1",
        "description": "%s automated lifecycle test - safe to archive" % MARKER,
        "latitude": "14.2561",
        "longitude": "121.1189",
    }
    files = {"photo": ("testsprite.png", PNG_1X1, "image/png")}

    r = requests.post(
        API + "/complaints",
        data=fields,
        files=files,
        headers=_auth_headers(),
        timeout=TIMEOUT,
    )
    assert r.status_code == 201, \
        "filing a complaint should return 201, got %s: %s" % (r.status_code, r.text[:400])

    body = r.json()
    assert body["success"] is True, "success should be True, got %r" % body.get("success")

    c = body["data"]["complaint"]
    assert isinstance(c["complaint_id"], int), "complaint_id should be an int, got %r" % c.get("complaint_id")

    tracking = c["tracking_id"]
    assert tracking.startswith("CMP-"), "tracking id should look like CMP-YYYY-NNNNN, got %r" % tracking
    parts = tracking.split("-")
    assert len(parts) == 3 and parts[1].isdigit() and parts[2].isdigit(), \
        "malformed tracking id %r" % tracking

    # A new report always starts unreviewed.
    assert c["status"] == "Pending", "a new complaint should start as Pending, got %r" % c.get("status")
    assert c["complaint_type"] == "Illegal_Dumping", "complaint_type came back as %r" % c.get("complaint_type")
    assert MARKER in c["description"], "the marker is missing from the stored description: %r" % c.get("description")

    # The photo is stored behind a signed link, not a bare public path.
    photo = c["photo_path"]
    assert photo and "/uploads/" in photo, "no photo path was stored: %r" % photo
    assert "s=" in photo and "e=" in photo, \
        "the photo link is not signed (expected an expiry and a signature): %r" % photo

    # And that link must actually work, or the resident sees a broken image.
    img = requests.get(BASE + photo if photo.startswith("/") else photo, timeout=TIMEOUT)
    assert img.status_code == 200, \
        "the signed photo link did not resolve: %s %s" % (img.status_code, img.text[:150])

    # It is immediately findable by the queue the staff actually work from.
    live = [i for i in find_marked_complaints() if i["tracking_id"] == tracking]
    assert live, "the new complaint %s is not in the staff queue" % tracking

    print("produced testsprite_complaint_tracking_id=%s" % tracking)


test_a_complaint_can_be_filed_end_to_end()
