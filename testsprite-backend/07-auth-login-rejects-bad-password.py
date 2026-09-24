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


def test_login_rejects_a_wrong_password_without_leaking_which_part_failed():
    # A deliberately unknown account: this must not touch a real user's record,
    # and the reply must not reveal whether the address exists.
    r = requests.post(
        API + "/auth/login",
        json={"email": "testsprite-no-such-user@example.com", "password": "DefinitelyWrong123"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 401, "expected 401 for bad credentials, got %s: %s" % (r.status_code, r.text[:300])

    body = r.json()
    assert body["success"] is False, "success should be False, got %r" % body.get("success")
    assert body["message"] == "Invalid email or password.", \
        "expected the generic credential message, got %r" % body.get("message")

    # No session may be minted on a failed login.
    assert "token" not in json.dumps(body), "a token was returned for a failed login: %s" % r.text[:300]
    assert "cenrowatch_token" not in r.headers.get("set-cookie", ""), \
        "a session cookie was set on a failed login: %r" % r.headers.get("set-cookie")


test_login_rejects_a_wrong_password_without_leaking_which_part_failed()
