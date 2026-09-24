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


def test_admin_user_list_never_returns_a_password():
    r = requests.get(API + "/admin/users", headers=_auth_headers(), timeout=TIMEOUT)
    assert r.status_code == 200, "expected 200, got %s: %s" % (r.status_code, r.text[:300])

    data = r.json()["data"]
    for field in ("items", "total", "page", "limit"):
        assert field in data, "the paginated payload is missing %r; got %r" % (field, sorted(data.keys()))

    items = data["items"]
    assert len(items) > 0, "no users returned - the admin Users page would be empty"
    assert len(items) <= data["limit"], \
        "returned %d items, more than the stated limit of %d" % (len(items), data["limit"])
    assert data["total"] >= len(items), \
        "total (%d) is smaller than the number of items returned (%d)" % (data["total"], len(items))

    roles_seen = set()
    for u in items:
        assert isinstance(u["user_id"], int), "user_id should be an int, got %r" % u.get("user_id")
        assert "@" in u["email"], "user %r has a malformed email %r" % (u.get("user_id"), u.get("email"))
        assert u["role"] in ("Admin", "CENRO_Staff", "Resident"), \
            "user %r has an unexpected role %r" % (u.get("user_id"), u.get("role"))
        assert isinstance(u["is_active"], bool), "is_active should be a bool, got %r" % u.get("is_active")
        roles_seen.add(u["role"])

        for secret in ("password", "password_hash", "passwordHash"):
            assert secret not in u, \
                "user %r exposes %r in the admin list - password material must never be serialised" % (
                    u.get("user_id"), secret)

    assert "Admin" in roles_seen, "expected at least one Admin in the user list, saw %r" % sorted(roles_seen)

    raw = json.dumps(r.json()).lower()
    assert "password" not in raw, "the admin user list payload mentions a password field"
    assert "$2a$" not in raw and "$2b$" not in raw, "a bcrypt hash was serialised into the admin user list"


test_admin_user_list_never_returns_a_password()
