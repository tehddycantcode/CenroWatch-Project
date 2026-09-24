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


# The SLA clock for every report type is read from these settings, so a missing
# or non-numeric value silently breaks every deadline the system computes.
REQUIRED_SLA_KEYS = (
    "complaint_sla_minutes",
    "wildlife_sla_minutes",
    "request_seedling_sla_minutes",
    "request_env_education_sla_minutes",
)


def test_admin_settings_expose_usable_sla_windows():
    r = requests.get(API + "/admin/settings", headers=_auth_headers(), timeout=TIMEOUT)
    assert r.status_code == 200, "expected 200, got %s: %s" % (r.status_code, r.text[:300])

    settings = r.json()["data"]["settings"]
    assert len(settings) > 0, "no settings returned - the System Settings page would be empty"

    by_key = {s["setting_key"]: s for s in settings}

    for key in REQUIRED_SLA_KEYS:
        assert key in by_key, "required setting %r is missing; present keys: %r" % (key, sorted(by_key))
        value = by_key[key]["setting_value"]
        assert str(value).strip().isdigit(), \
            "%s must be a whole number of minutes, got %r" % (key, value)
        assert int(value) > 0, "%s must be greater than zero, got %r" % (key, value)

    # The office pin the staff routing screen draws from.
    for key in ("cenro_office_lat", "cenro_office_lng"):
        assert key in by_key, "required setting %r is missing; present keys: %r" % (key, sorted(by_key))
        float(by_key[key]["setting_value"])  # raises ValueError if unparseable

    assert 14.15 <= float(by_key["cenro_office_lat"]["setting_value"]) <= 14.40, \
        "the CENRO office latitude is outside Cabuyao: %r" % by_key["cenro_office_lat"]["setting_value"]
    assert 121.00 <= float(by_key["cenro_office_lng"]["setting_value"]) <= 121.25, \
        "the CENRO office longitude is outside Cabuyao: %r" % by_key["cenro_office_lng"]["setting_value"]

    for s in settings:
        assert isinstance(s["setting_id"], int), "setting %r has a non-integer id" % s.get("setting_key")


test_admin_settings_expose_usable_sla_windows()
