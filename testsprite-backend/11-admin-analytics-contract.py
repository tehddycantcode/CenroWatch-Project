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


def test_admin_analytics_returns_an_internally_consistent_dashboard():
    r = requests.get(API + "/admin/analytics", headers=_auth_headers(), timeout=TIMEOUT)
    assert r.status_code == 200, "expected 200, got %s: %s" % (r.status_code, r.text[:300])

    a = r.json()["data"]["analytics"]
    for section in ("users", "reports", "status", "by_type", "by_barangay", "trend", "sla", "resolution"):
        assert section in a, "analytics is missing the %r section; got %r" % (section, sorted(a.keys()))

    users = a["users"]
    assert users["total"] >= users["active"], \
        "active users (%d) cannot exceed total users (%d)" % (users["active"], users["total"])
    assert sum(users["by_role"].values()) == users["total"], \
        "by_role %r does not sum to the total of %d" % (users["by_role"], users["total"])
    for role in users["by_role"]:
        assert role in ("Admin", "CENRO_Staff", "Resident"), "unexpected role bucket %r" % role

    reports = a["reports"]
    assert reports["complaints"] + reports["wildlife"] + reports["requests"] == reports["total"], \
        "report totals do not add up: %r" % reports

    # One row per barangay of Cabuyao, each carrying the coordinates the GIS
    # analytics page plots.
    assert len(a["by_barangay"]) == 18, "expected 18 barangays, got %d" % len(a["by_barangay"])
    for b in a["by_barangay"]:
        assert b["complaints"] + b["wildlife"] + b["requests"] == b["total"], \
            "barangay %r counts do not add up: %r" % (b.get("name"), b)
        assert b["latitude"] is not None and b["longitude"] is not None, \
            "barangay %r has no coordinates and cannot be plotted" % b.get("name")

    assert len(a["trend"]) == 6, "the trend chart expects 6 months, got %d" % len(a["trend"])

    for kind, sla in a["sla"].items():
        assert sla["on_time"] + sla["late"] == sla["closed"], \
            "%s SLA: on_time+late (%d) != closed (%d)" % (kind, sla["on_time"] + sla["late"], sla["closed"])
        assert 0 <= sla["rate"] <= 100, "%s SLA rate %r is not a percentage" % (kind, sla["rate"])

    assert isinstance(a["wildlife_endangered"], int) and a["wildlife_endangered"] >= 0, \
        "wildlife_endangered should be a non-negative int, got %r" % a.get("wildlife_endangered")


test_admin_analytics_returns_an_internally_consistent_dashboard()
