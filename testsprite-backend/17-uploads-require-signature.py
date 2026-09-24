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


# /uploads used to be bare express.static: no auth, no expiry, and the stored
# photo_path WAS the public URL. It is now a signed route. An unsigned or
# tampered link must be refused, and a traversal attempt must be refused before
# the signature is even considered.
def test_an_unsigned_upload_link_is_refused():
    r = requests.get(BASE + "/uploads/complaints/any-photo.jpg", timeout=TIMEOUT)
    assert r.status_code == 403, \
        "an unsigned /uploads link must be refused with 403, got %s: %s" % (r.status_code, r.text[:200])

    body = r.json()
    assert body["success"] is False, "success should be False, got %r" % body.get("success")
    assert "token" in body["message"].lower(), \
        "the refusal should explain the link is missing its access token, got %r" % body.get("message")


def test_a_tampered_signature_is_refused():
    r = requests.get(
        BASE + "/uploads/complaints/any-photo.jpg?e=99999999999&s=deadbeefdeadbeefdeadbeefdeadbeef",
        timeout=TIMEOUT,
    )
    assert r.status_code == 403, \
        "a forged signature must be refused with 403, got %s: %s" % (r.status_code, r.text[:200])
    assert r.json()["success"] is False, "success should be False for a forged signature"


def test_path_traversal_is_refused():
    for attempt in ("/uploads/../.env", "/uploads/..%2f..%2f.env"):
        r = requests.get(BASE + attempt, timeout=TIMEOUT, allow_redirects=False)
        assert r.status_code in (400, 403, 404), \
            "%s should be refused, got %s: %s" % (attempt, r.status_code, r.text[:200])
        assert "JWT_SECRET" not in r.text and "DATABASE_URL" not in r.text, \
            "%s returned environment file contents" % attempt


test_an_unsigned_upload_link_is_refused()
test_a_tampered_signature_is_refused()
test_path_traversal_is_refused()
