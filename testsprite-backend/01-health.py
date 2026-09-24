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


def test_health_endpoint_reports_service_up():
    r = requests.get(BASE + "/api/health", timeout=TIMEOUT)
    assert r.status_code == 200, "expected 200, got %s: %s" % (r.status_code, r.text[:300])

    body = r.json()
    assert body["status"] == "ok", "status should be 'ok', got %r" % body.get("status")
    assert body["service"] == "CENROWATCH", "service should be 'CENROWATCH', got %r" % body.get("service")
    assert body["office"] == "CENRO Cabuyao", "office should be 'CENRO Cabuyao', got %r" % body.get("office")
    assert isinstance(body["uptime"], (int, float)) and body["uptime"] > 0,         "uptime should be a positive number, got %r" % body.get("uptime")
    assert "timestamp" in body and len(body["timestamp"]) > 0, "timestamp missing"


test_health_endpoint_reports_service_up()
