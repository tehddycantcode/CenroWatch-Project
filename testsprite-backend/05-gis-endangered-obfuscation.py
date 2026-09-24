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


# Project rule: endangered-species coordinates are obfuscated by ~0.001 deg on
# PUBLIC endpoints so a poacher cannot read an exact nest location off the map,
# while staff keep the true location. The shift is derived from the record id,
# so it is stable across requests rather than jittering on every call.
OFFSET_DEG = 0.001
TOLERANCE = 0.0002  # rounding to 6 decimals, plus float slack


def test_endangered_wildlife_coordinates_are_fuzzed_for_the_public():
    public = requests.get(API + "/gis/map", timeout=TIMEOUT)
    assert public.status_code == 200, "public map: expected 200, got %s" % public.status_code
    markers = public.json()["data"]["markers"]

    wildlife = {m["id"]: m for m in markers if m["kind"] == "wildlife"}
    assert len(wildlife) > 0, "no wildlife markers on the public map to check"

    staff = requests.get(API + "/staff/wildlife?limit=100", headers=_auth_headers(), timeout=TIMEOUT)
    assert staff.status_code == 200, \
        "staff wildlife list: expected 200, got %s: %s" % (staff.status_code, staff.text[:200])
    true_coords = {
        i["reference_id"]: (float(i["latitude"]), float(i["longitude"]))
        for i in staff.json()["data"]["items"]
        if i.get("latitude") is not None and i.get("longitude") is not None
    }

    checked_endangered = 0
    checked_plain = 0

    for ref, marker in wildlife.items():
        if ref not in true_coords:
            continue
        true_lat, true_lng = true_coords[ref]
        pub_lat, pub_lng = float(marker["latitude"]), float(marker["longitude"])
        shift = ((pub_lat - true_lat) ** 2 + (pub_lng - true_lng) ** 2) ** 0.5

        if marker.get("endangered"):
            assert (pub_lat, pub_lng) != (true_lat, true_lng), \
                "endangered %s publishes its TRUE location (%s, %s) - coordinates must be obfuscated" % (
                    ref, true_lat, true_lng)
            assert abs(shift - OFFSET_DEG) <= TOLERANCE, \
                "endangered %s shifted by %.6f deg, expected ~%.4f deg" % (ref, shift, OFFSET_DEG)
            checked_endangered += 1
        else:
            assert shift <= 1e-5, \
                "non-endangered %s was shifted by %.6f deg; only endangered records are fuzzed" % (ref, shift)
            checked_plain += 1

    assert checked_endangered > 0, \
        "no endangered wildlife matched between the public map and the staff list - nothing was verified"

    # The shift must be deterministic: a fresh request returns the same point.
    again = requests.get(API + "/gis/map", timeout=TIMEOUT)
    assert again.status_code == 200, "second public map call: got %s" % again.status_code
    repeat = {m["id"]: m for m in again.json()["data"]["markers"] if m["kind"] == "wildlife"}
    for ref, marker in wildlife.items():
        if marker.get("endangered") and ref in repeat:
            assert (repeat[ref]["latitude"], repeat[ref]["longitude"]) == (marker["latitude"], marker["longitude"]), \
                "endangered %s moved between two requests (%s,%s -> %s,%s); the offset must be stable" % (
                    ref, marker["latitude"], marker["longitude"],
                    repeat[ref]["latitude"], repeat[ref]["longitude"])


test_endangered_wildlife_coordinates_are_fuzzed_for_the_public()
