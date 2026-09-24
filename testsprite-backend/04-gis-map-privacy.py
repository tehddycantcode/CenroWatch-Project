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


# The single most important privacy contract in this system.
# R.A. 10173: the public map is reachable with no credential at all, so a marker
# must never carry the reporter's identity.
# `endangered` is a deliberate public flag (it drives the coordinate fuzzing
# checked in 05-gis-endangered-obfuscation.py), not personal data.
ALLOWED_MARKER_KEYS = {
    "id", "kind", "category", "status", "priority",
    "barangay", "latitude", "longitude", "endangered",
}

FORBIDDEN_FIELDS = (
    "reporter_name", "reporter_contact", "address_details", "contact_number",
    "email", "first_name", "last_name", "password", "user_id", "resident",
)


def test_public_gis_map_exposes_no_personal_data():
    r = requests.get(API + "/gis/map", timeout=TIMEOUT)
    assert r.status_code == 200, "expected 200, got %s: %s" % (r.status_code, r.text[:300])

    body = r.json()
    assert body["success"] is True, "success should be True, got %r" % body.get("success")

    markers = body["data"]["markers"]
    assert len(markers) > 0, "no markers returned - the public map would be blank"

    kinds = set()
    for m in markers:
        extra = set(m.keys()) - ALLOWED_MARKER_KEYS
        assert not extra, \
            "marker %r exposes unexpected field(s) %r - public markers may only carry %r" % (
                m.get("id"), sorted(extra), sorted(ALLOWED_MARKER_KEYS))

        assert m["kind"] in ("complaint", "wildlife", "request"), \
            "unexpected marker kind %r" % m.get("kind")
        kinds.add(m["kind"])
        assert 14.15 <= float(m["latitude"]) <= 14.40, \
            "marker %r latitude %r is outside Cabuyao" % (m.get("id"), m.get("latitude"))
        assert 121.00 <= float(m["longitude"]) <= 121.25, \
            "marker %r longitude %r is outside Cabuyao" % (m.get("id"), m.get("longitude"))

    assert "complaint" in kinds, "expected at least one complaint marker, saw kinds %r" % sorted(kinds)

    # Belt and braces: scan the raw payload, so a nested field added later is
    # caught even if the per-marker key check above is somehow satisfied.
    raw = json.dumps(body).lower()
    for leaked in FORBIDDEN_FIELDS:
        assert leaked not in raw, \
            "public GIS map payload contains the personal field %r (R.A. 10173 violation)" % leaked


test_public_gis_map_exposes_no_personal_data()
