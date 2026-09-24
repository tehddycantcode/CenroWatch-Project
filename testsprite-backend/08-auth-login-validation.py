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


def test_login_validation_rejects_a_malformed_payload():
    r = requests.post(
        API + "/auth/login",
        json={"email": "not-an-email", "password": ""},
        timeout=TIMEOUT,
    )
    # This API answers validation failures with 422, not 400.
    assert r.status_code == 422, "expected 422 for a malformed payload, got %s: %s" % (r.status_code, r.text[:300])

    body = r.json()
    assert body["success"] is False, "success should be False, got %r" % body.get("success")
    assert body["message"] == "Validation failed.", "expected 'Validation failed.', got %r" % body.get("message")

    errors = body["errors"]
    assert isinstance(errors, list) and len(errors) >= 2, \
        "expected an error entry per invalid field, got %r" % errors

    fields = {e["field"] for e in errors}
    assert "email" in fields, "no validation error reported for 'email'; got %r" % sorted(fields)
    assert "password" in fields, "no validation error reported for 'password'; got %r" % sorted(fields)
    for e in errors:
        assert isinstance(e["message"], str) and e["message"].strip(), \
            "validation error for %r has an empty message" % e.get("field")


def test_login_validation_rejects_a_missing_body():
    r = requests.post(API + "/auth/login", json={}, timeout=TIMEOUT)
    assert r.status_code == 422, "expected 422 for an empty body, got %s: %s" % (r.status_code, r.text[:300])
    assert r.json()["success"] is False, "success should be False for an empty body"


test_login_validation_rejects_a_malformed_payload()
test_login_validation_rejects_a_missing_body()
