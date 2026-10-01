// Road routing from the CENRO office to a report pin (OpenRouteService).
//
// This is the first outbound HTTP call in this backend, and it is to a free
// third party that can be slow, rate-limited or simply down. Every one of those
// has to end as `null` and a straight line on the map, never as a failed page
// or a hung request - the staff member is standing outside with a phone.

const svc = require('../src/services/routing.service');

const OFFICE = { lat: 14.271764542862766, lng: 121.12434099651512 };
const REPORT = { lat: 14.277946, lng: 121.132677 };

// A trimmed copy of the real ORS geojson response shape.
const orsBody = {
  features: [
    {
      geometry: {
        type: 'LineString',
        coordinates: [[121.1243, 14.2717], [121.1280, 14.2750], [121.1326, 14.2779]],
      },
      properties: { summary: { distance: 2610.4, duration: 486.2 } },
    },
  ],
};

const okResponse = (body = orsBody) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  process.env.ORS_API_KEY = 'test-key';
  svc.__clearCache();
  global.fetch = jest.fn().mockResolvedValue(okResponse());
});

afterEach(() => {
  delete process.env.ORS_API_KEY;
  jest.restoreAllMocks();
});

describe('isConfigured', () => {
  test('false without a key, true with one', () => {
    delete process.env.ORS_API_KEY;
    expect(svc.isConfigured()).toBe(false);
    process.env.ORS_API_KEY = 'test-key';
    expect(svc.isConfigured()).toBe(true);
  });
});

describe('getRoute', () => {
  test('returns the road geometry, distance and duration', async () => {
    const route = await svc.getRoute(OFFICE, REPORT);
    expect(route).toEqual({
      geometry: [[121.1243, 14.2717], [121.128, 14.275], [121.1326, 14.2779]],
      distance_m: 2610.4,
      duration_s: 486.2,
    });
  });

  test('sends the key in the header and the coordinates as [lng, lat]', async () => {
    await svc.getRoute(OFFICE, REPORT);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toContain('driving-car');
    expect(init.headers.Authorization).toBe('test-key');
    // ORS takes longitude first. Swapped, every route in Cabuyao would be
    // computed somewhere off the coast of Somalia - and still return a 200.
    expect(JSON.parse(init.body).coordinates).toEqual([
      [OFFICE.lng, OFFICE.lat],
      [REPORT.lng, REPORT.lat],
    ]);
  });

  // The whole point of the fallback: none of these may throw.
  test('returns null without a key, and does not call out', async () => {
    delete process.env.ORS_API_KEY;
    expect(await svc.getRoute(OFFICE, REPORT)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns null on a non-200 (quota exhausted, bad key)', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    expect(await svc.getRoute(OFFICE, REPORT)).toBeNull();
  });

  test('returns null when the request fails or times out', async () => {
    global.fetch.mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
    expect(await svc.getRoute(OFFICE, REPORT)).toBeNull();
  });

  test('returns null on a 200 whose body is not a route', async () => {
    global.fetch.mockResolvedValue(okResponse({ features: [] }));
    expect(await svc.getRoute(OFFICE, REPORT)).toBeNull();
  });

  test('passes a timeout signal so a hung provider cannot hold the request', async () => {
    await svc.getRoute(OFFICE, REPORT);
    expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
  });

  // Neither end moves: the office is a setting and a report's pin is fixed at
  // submission. Re-routing the same pair on every page view would burn the free
  // tier for nothing.
  test('caches a route and does not call out twice for the same pair', async () => {
    await svc.getRoute(OFFICE, REPORT);
    const second = await svc.getRoute(OFFICE, REPORT);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(second.distance_m).toBe(2610.4);
  });

  test('a different destination is a different route', async () => {
    await svc.getRoute(OFFICE, REPORT);
    await svc.getRoute(OFFICE, { lat: 14.3, lng: 121.15 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  // A failure must not be cached as if it were an answer, or one blip would
  // leave that report with no route until the next restart.
  test('does not cache a failure', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    expect(await svc.getRoute(OFFICE, REPORT)).toBeNull();
    global.fetch.mockResolvedValue(okResponse());
    expect(await svc.getRoute(OFFICE, REPORT)).not.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('isWithinServiceArea', () => {
  test('accepts points in Cabuyao', () => {
    expect(svc.isWithinServiceArea(REPORT)).toBe(true);
    expect(svc.isWithinServiceArea(OFFICE)).toBe(true);
  });

  // Without this the endpoint is an open routing proxy for anyone with a staff
  // account, on our quota and our key.
  test('rejects points outside the city', () => {
    expect(svc.isWithinServiceArea({ lat: 14.6, lng: 121.0 })).toBe(false); // Manila
    expect(svc.isWithinServiceArea({ lat: 0, lng: 0 })).toBe(false);
  });

  test('rejects malformed points', () => {
    expect(svc.isWithinServiceArea(null)).toBe(false);
    expect(svc.isWithinServiceArea({ lat: 'x', lng: 121.12 })).toBe(false);
    expect(svc.isWithinServiceArea({ lat: NaN, lng: NaN })).toBe(false);
  });
});
