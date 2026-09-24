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

