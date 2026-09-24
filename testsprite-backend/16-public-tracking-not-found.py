import os
import json
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


BASE = _base_url()
API = BASE + "/api/v1"
TIMEOUT = 30


def test_tracking_an_unknown_reference_is_a_clean_404():
    r = requests.get(API + "/complaints/track/CMP-0000-00000", timeout=TIMEOUT)
    assert r.status_code == 404, "expected 404 for an unknown tracking id, got %s: %s" % (r.status_code, r.text[:300])

    body = r.json()
    assert body["success"] is False, "success should be False, got %r" % body.get("success")
    assert isinstance(body["message"], str) and body["message"].strip(), "the 404 carries no message"

    # A miss must not hand back a record, nor hint at one.
    assert "data" not in body or not body["data"], \
        "a 404 returned a data payload: %s" % r.text[:300]
    raw = json.dumps(body).lower()
    for leaked in ("reporter_name", "reporter_contact", "email", "contact_number", "address_details"):
        assert leaked not in raw, "the tracking 404 leaked %r" % leaked


def test_an_unknown_route_is_a_clean_404():
    r = requests.get(API + "/this-route-does-not-exist", timeout=TIMEOUT)
    assert r.status_code == 404, "expected 404 for an unknown route, got %s" % r.status_code
    assert r.json()["success"] is False, "success should be False for an unknown route"


test_tracking_an_unknown_reference_is_a_clean_404()
test_an_unknown_route_is_a_clean_404()
