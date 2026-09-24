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


QUEUES = ("complaints", "wildlife", "requests")


def test_staff_overview_counts_reconcile_across_every_queue():
    r = requests.get(API + "/staff/overview", headers=_auth_headers(), timeout=TIMEOUT)
    assert r.status_code == 200, "expected 200, got %s: %s" % (r.status_code, r.text[:300])

    o = r.json()["data"]["overview"]
    for section in QUEUES + ("totals", "recent"):
        assert section in o, "the overview is missing %r; got %r" % (section, sorted(o.keys()))

    for queue in QUEUES:
        q = o[queue]
        for field in ("total", "open", "breached", "by_status"):
            assert field in q, "%s summary is missing %r; got %r" % (queue, field, sorted(q.keys()))

        assert isinstance(q["total"], int) and q["total"] >= 0, \
            "%s.total should be a non-negative int, got %r" % (queue, q["total"])
        assert q["open"] <= q["total"], \
            "%s: open (%d) cannot exceed total (%d)" % (queue, q["open"], q["total"])
        assert q["breached"] <= q["total"], \
            "%s: breached (%d) cannot exceed total (%d)" % (queue, q["breached"], q["total"])

        # A status value that is not accounted for silently disappears from the
        # breakdown, so the per-status counts must add back up to the total.
        by_status = q["by_status"]
        assert isinstance(by_status, dict) and by_status, "%s.by_status is empty" % queue
        for status, count in by_status.items():
            assert isinstance(count, int) and count >= 0, \
                "%s.by_status.%s should be a non-negative int, got %r" % (queue, status, count)
        assert sum(by_status.values()) == q["total"], \
            "%s: by_status sums to %d but total is %d - a status is unaccounted for (%r)" % (
                queue, sum(by_status.values()), q["total"], by_status)

    # The dashboard cards must equal the sum of the three queues, or staff are
    # shown a workload that does not match the queues they open.
    totals = o["totals"]
    expected_open = sum(o[q]["open"] for q in QUEUES)
    expected_breached = sum(o[q]["breached"] for q in QUEUES)
    assert totals["open"] == expected_open, \
        "totals.open is %d but the queues add up to %d" % (totals["open"], expected_open)
    assert totals["breached"] == expected_breached, \
        "totals.breached is %d but the queues add up to %d" % (totals["breached"], expected_breached)

    for item in o["recent"]:
        assert item["kind"] in ("complaint", "wildlife", "request"), \
            "recent item %r has an unexpected kind %r" % (item.get("id"), item.get("kind"))
        assert item["id"] and item["status"] and item["date"], \
            "recent item is missing id/status/date: %r" % item


test_staff_overview_counts_reconcile_across_every_queue()
