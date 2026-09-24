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


# Every admin route sits behind authenticate + authorize('Admin'). An anonymous
# or forged caller must be refused BEFORE any data is assembled.
ADMIN_ROUTES = (
    "/admin/analytics",
    "/admin/users",
    "/admin/audit-logs",
    "/admin/settings",
    "/admin/categories",
    "/admin/barangays",
)

STAFF_ROUTES = (
    "/staff/overview",
    "/staff/complaints",
    "/staff/wildlife",
    "/staff/requests",
)


def test_admin_and_staff_routes_refuse_anonymous_callers():
    for path in ADMIN_ROUTES + STAFF_ROUTES:
        r = requests.get(API + path, timeout=TIMEOUT)
        assert r.status_code == 401, \
            "%s must refuse an anonymous caller with 401, got %s: %s" % (path, r.status_code, r.text[:200])
        body = r.json()
        assert body["success"] is False, "%s: success should be False" % path
        # The refusal must not carry data with it.
        assert "data" not in body or not body["data"], \
            "%s returned a data payload alongside its 401: %s" % (path, r.text[:200])


def test_admin_and_staff_routes_refuse_a_forged_token():
    forged = {"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwicm9sZSI6IkFkbWluIn0.not_a_real_signature"}
    for path in ADMIN_ROUTES + STAFF_ROUTES:
        r = requests.get(API + path, headers=forged, timeout=TIMEOUT)
        assert r.status_code == 401, \
            "%s must refuse a forged token with 401, got %s: %s" % (path, r.status_code, r.text[:200])
        assert r.json()["message"] == "Invalid or expired token.", \
            "%s: expected 'Invalid or expired token.', got %r" % (path, r.json().get("message"))


test_admin_and_staff_routes_refuse_anonymous_callers()
test_admin_and_staff_routes_refuse_a_forged_token()
