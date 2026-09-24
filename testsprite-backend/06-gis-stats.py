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


def test_public_gis_stats_returns_consistent_counters():
    r = requests.get(API + "/gis/stats", timeout=TIMEOUT)
    assert r.status_code == 200, "expected 200, got %s: %s" % (r.status_code, r.text[:300])

    body = r.json()
    assert body["success"] is True, "success should be True, got %r" % body.get("success")

    stats = body["data"]["stats"]
    for field in ("total_reports", "resolved", "wildlife_cases", "barangays_covered"):
        assert field in stats, "stats is missing %r; got keys %r" % (field, sorted(stats.keys()))
        assert isinstance(stats[field], int), "%s should be an int, got %r" % (field, stats[field])
        assert stats[field] >= 0, "%s should never be negative, got %d" % (field, stats[field])

    assert stats["resolved"] <= stats["total_reports"], \
        "resolved (%d) cannot exceed total_reports (%d)" % (stats["resolved"], stats["total_reports"])
    assert stats["wildlife_cases"] <= stats["total_reports"], \
        "wildlife_cases (%d) cannot exceed total_reports (%d)" % (stats["wildlife_cases"], stats["total_reports"])
    assert stats["barangays_covered"] <= 18, \
        "barangays_covered (%d) exceeds the 18 barangays of Cabuyao" % stats["barangays_covered"]

    # A public counter endpoint must not carry identities.
    raw = json.dumps(body).lower()
    for leaked in ("email", "reporter_name", "contact_number", "password"):
        assert leaked not in raw, "public stats leaked a personal field: %s" % leaked


test_public_gis_stats_returns_consistent_counters()
