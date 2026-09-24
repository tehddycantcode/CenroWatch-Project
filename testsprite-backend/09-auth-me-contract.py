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


def test_me_requires_a_credential():
    anon = requests.get(API + "/auth/me", timeout=TIMEOUT)
    assert anon.status_code == 401, "an anonymous /auth/me must be 401, got %s" % anon.status_code
    assert anon.json()["message"] == "Not signed in.", \
        "expected 'Not signed in.', got %r" % anon.json().get("message")

    bogus = requests.get(
        API + "/auth/me",
        headers={"Authorization": "Bearer not.a.real.jwt"},
        timeout=TIMEOUT,
    )
    assert bogus.status_code == 401, "a malformed token must be 401, got %s" % bogus.status_code
    assert bogus.json()["message"] == "Invalid or expired token.", \
        "expected 'Invalid or expired token.', got %r" % bogus.json().get("message")


def test_me_returns_the_signed_in_profile_without_the_password():
    r = requests.get(API + "/auth/me", headers=_auth_headers(), timeout=TIMEOUT)
    assert r.status_code == 200, "expected 200 with a valid token, got %s: %s" % (r.status_code, r.text[:300])

    user = r.json()["data"]["user"]
    assert isinstance(user["user_id"], int), "user_id should be an int, got %r" % user.get("user_id")
    assert "@" in user["email"], "email looks wrong: %r" % user.get("email")
    assert user["role"] in ("Admin", "CENRO_Staff", "Resident"), "unexpected role %r" % user.get("role")
    assert user["is_active"] is True, "the test credential's account is not active"

    # A credential must never travel back in a profile response.
    raw = json.dumps(r.json()).lower()
    for leaked in ("password", "password_hash", "token"):
        assert leaked not in raw, "/auth/me leaked %r in its response" % leaked


test_me_requires_a_credential()
test_me_returns_the_signed_in_profile_without_the_password()
