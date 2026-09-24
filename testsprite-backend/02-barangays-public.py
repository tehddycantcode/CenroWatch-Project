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


def test_public_barangay_list_is_complete_and_carries_no_personal_data():
    r = requests.get(API + "/barangays", timeout=TIMEOUT)
    assert r.status_code == 200, "expected 200, got %s: %s" % (r.status_code, r.text[:300])

    body = r.json()
    assert body["success"] is True, "success should be True, got %r" % body.get("success")

    barangays = body["data"]["barangays"]
    assert len(barangays) == 18, "Cabuyao has 18 barangays seeded; got %d" % len(barangays)

    for b in barangays:
        assert isinstance(b["barangay_id"], int), "barangay_id must be an int, got %r" % b.get("barangay_id")
        assert isinstance(b["name"], str) and b["name"].strip(), "name must be a non-empty string"
        # Cabuyao City, Laguna sits near 14.27 N, 121.12 E. A coordinate outside
        # this box means the seed data or the serializer is wrong.
        assert 14.15 <= float(b["latitude"]) <= 14.40, \
            "%s latitude %r is outside Cabuyao" % (b["name"], b["latitude"])
        assert 121.00 <= float(b["longitude"]) <= 121.25, \
            "%s longitude %r is outside Cabuyao" % (b["name"], b["longitude"])

    names = [b["name"] for b in barangays]
    assert len(set(names)) == 18, "barangay names must be unique, got %d distinct" % len(set(names))
    assert "Baclaran" in names, "expected seeded barangay 'Baclaran' in %r" % names[:5]

    # R.A. 10173: a public endpoint must return zero personal data.
    raw = json.dumps(body).lower()
    for leaked in ("email", "contact_number", "reporter_name", "reporter_contact", "password"):
        assert leaked not in raw, "public barangay list leaked a personal field: %s" % leaked


test_public_barangay_list_is_complete_and_carries_no_personal_data()
