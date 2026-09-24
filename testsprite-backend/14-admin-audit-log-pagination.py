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


def test_audit_log_is_paginated_and_records_who_did_what():
    r = requests.get(API + "/admin/audit-logs?page=1&limit=5", headers=_auth_headers(), timeout=TIMEOUT)
    assert r.status_code == 200, "expected 200, got %s: %s" % (r.status_code, r.text[:300])

    data = r.json()["data"]
    assert data["page"] == 1, "expected page 1, got %r" % data.get("page")
    assert data["limit"] == 5, "expected limit 5, got %r" % data.get("limit")

    items = data["items"]
    assert len(items) > 0, "no audit entries - every data mutation is supposed to write one"
    assert len(items) <= 5, "asked for 5 entries, got %d" % len(items)
    assert data["total"] >= len(items), \
        "total (%d) is smaller than the page returned (%d)" % (data["total"], len(items))

    for e in items:
        assert isinstance(e["log_id"], int), "log_id should be an int, got %r" % e.get("log_id")
        assert isinstance(e["action"], str) and e["action"].strip(), \
            "audit entry %r has an empty action" % e.get("log_id")
        assert e["performed_at"], "audit entry %r has no timestamp" % e.get("log_id")

    # Page 2 must be a different slice, not the same rows again.
    if data["total"] > 5:
        p2 = requests.get(API + "/admin/audit-logs?page=2&limit=5", headers=_auth_headers(), timeout=TIMEOUT)
        assert p2.status_code == 200, "page 2: expected 200, got %s" % p2.status_code
        second = p2.json()["data"]
        assert second["page"] == 2, "expected page 2, got %r" % second.get("page")
        first_ids = {e["log_id"] for e in items}
        second_ids = {e["log_id"] for e in second["items"]}
        assert not (first_ids & second_ids), \
            "page 2 repeats rows from page 1 (%r) - pagination is not advancing" % sorted(first_ids & second_ids)


test_audit_log_is_paginated_and_records_who_did_what()
