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


def test_public_category_lists_are_populated_for_report_forms():
    r = requests.get(API + "/categories", timeout=TIMEOUT)
    assert r.status_code == 200, "expected 200, got %s: %s" % (r.status_code, r.text[:300])

    body = r.json()
    assert body["success"] is True, "success should be True, got %r" % body.get("success")

    data = body["data"]
    complaint_types = data["complaint_types"]
    request_types = data["request_types"]

    # Both clients build their report dropdowns from these two lists; an empty
    # list ships a form nobody can submit.
    assert len(complaint_types) >= 1, "complaint_types is empty - the report form would have no options"
    assert len(request_types) >= 1, "request_types is empty - the request form would have no options"

    for group_name, group in (("complaint_types", complaint_types), ("request_types", request_types)):
        for item in group:
            assert isinstance(item["name"], str) and item["name"].strip(), \
                "%s entry has an empty name: %r" % (group_name, item)
            assert isinstance(item["sort_order"], int), \
                "%s entry %r has a non-integer sort_order" % (group_name, item["name"])

    complaint_names = [c["name"] for c in complaint_types]
    assert "Illegal_Dumping" in complaint_names, \
        "expected seeded complaint type 'Illegal_Dumping' in %r" % complaint_names


test_public_category_lists_are_populated_for_report_forms()
