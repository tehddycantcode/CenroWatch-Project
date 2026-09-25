// Push notifications to residents' phones.
//
// Two properties are load-bearing here and both are easy to break by accident.
//
// PRIVACY: a push banner is readable on a LOCKED phone by whoever is holding
// it. This system encrypts reporter identity at rest and accepts whistleblower
// reports, so the banner must not carry the tracking reference, the status or
// the staff note - the very things the in-app notification does carry, because
// that one is behind a sign-in. The reference travels in `data`, which stays
// invisible until the app opens it. A later "make the notification more
// useful" is exactly how that protection gets undone, so it is asserted.
//
// RESILIENCE: a status update must never fail because a phone is unreachable.
// The same contract sendMail and notifyStatusChange already keep.

jest.mock('../src/utils/prisma', () => ({
  pushToken: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

const prisma = require('../src/utils/prisma');
const push = require('../src/services/push.service');

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

const okTickets = (n) => ({
  ok: true,
  status: 200,
  json: async () => ({ data: Array.from({ length: n }, () => ({ status: 'ok', id: 'x' })) }),
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.pushToken.deleteMany.mockResolvedValue({ count: 0 });
});

describe('what the phone is allowed to show on a lock screen', () => {
  test('the banner carries no reference, no status and no staff note', async () => {
    prisma.pushToken.findMany.mockResolvedValue([{ token: TOKEN_A }]);
    global.fetch = jest.fn(async () => okTickets(1));

    await push.notifyReportUpdate(7, { trackingId: 'CMP-2026-00055', kind: 'complaint' });

    const [message] = JSON.parse(global.fetch.mock.calls[0][1].body);
    const visible = `${message.title} ${message.body}`;
    expect(visible).not.toMatch(/CMP-2026-00055/);
    expect(visible).not.toMatch(/under.?review/i);
    expect(visible).not.toMatch(/note/i);
    expect(message.title).toBe('Your report has an update');
  });

  test('the reference still reaches the app, invisibly, so the tap can open it', async () => {
    prisma.pushToken.findMany.mockResolvedValue([{ token: TOKEN_A }]);
    global.fetch = jest.fn(async () => okTickets(1));

    await push.notifyReportUpdate(7, { trackingId: 'CMP-2026-00055', kind: 'complaint' });

    const [message] = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(message.data).toEqual({ trackingId: 'CMP-2026-00055', kind: 'complaint' });
  });

  // The app creates an Android channel called "Report updates" so a resident
  // can mute or tune exactly these notifications in system settings. Android
  // routes by the message's channelId, and a message that names none is
  // delivered on Expo's generic fallback channel instead - which would leave
  // the named channel sitting there doing nothing, so turning it off would not
  // stop the notifications and turning it up would not make them louder.
  test('the message names the app channel, so system settings can control it', async () => {
    prisma.pushToken.findMany.mockResolvedValue([{ token: TOKEN_A }]);
    global.fetch = jest.fn(async () => okTickets(1));

    await push.notifyReportUpdate(7, { trackingId: 'CMP-2026-00055', kind: 'complaint' });

    const [message] = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(message.channelId).toBe('default');
  });
});

describe('delivery', () => {
  test('every registered device for that user is messaged', async () => {
    prisma.pushToken.findMany.mockResolvedValue([{ token: TOKEN_A }, { token: TOKEN_B }]);
    global.fetch = jest.fn(async () => okTickets(2));

    const sent = await push.notifyReportUpdate(7, { trackingId: 'CMP-2026-00001', kind: 'complaint' });

    expect(sent).toBe(2);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).map((m) => m.to)).toEqual([TOKEN_A, TOKEN_B]);
  });

  // Anonymous reports have no owner, so there is nobody to notify and no device
  // to notify them on. Reaching Expo at all here would be a bug.
  test('an anonymous report sends nothing', async () => {
    global.fetch = jest.fn();
    expect(await push.notifyReportUpdate(null, { trackingId: 'CMP-2026-00002' })).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a user with no registered device sends nothing', async () => {
    prisma.pushToken.findMany.mockResolvedValue([]);
    global.fetch = jest.fn();
    expect(await push.notifyReportUpdate(7, { trackingId: 'CMP-2026-00003' })).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('a failure must never reach the caller', () => {
  test('a network error resolves 0 rather than rejecting', async () => {
    prisma.pushToken.findMany.mockResolvedValue([{ token: TOKEN_A }]);
    global.fetch = jest.fn(async () => {
      throw new Error('ETIMEDOUT');
    });
    await expect(push.notifyReportUpdate(7, { trackingId: 'X' })).resolves.toBe(0);
  });

  test('an Expo error status resolves 0 rather than rejecting', async () => {
    prisma.pushToken.findMany.mockResolvedValue([{ token: TOKEN_A }]);
    global.fetch = jest.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }));
    await expect(push.notifyReportUpdate(7, { trackingId: 'X' })).resolves.toBe(0);
  });

  test('a database failure resolves 0 rather than rejecting', async () => {
    prisma.pushToken.findMany.mockRejectedValue(new Error('db down'));
    await expect(push.notifyReportUpdate(7, { trackingId: 'X' })).resolves.toBe(0);
  });
});

describe('dead tokens', () => {
  // Expo answers 200 with a per-message ticket even when a message failed, so
  // the outcome has to be read out of the body rather than off the status code.
  // DeviceNotRegistered means the app was uninstalled or the token rotated -
  // that token is dead permanently, so it is deleted rather than retried on
  // every future status change.
  test('DeviceNotRegistered deletes exactly that token, not the healthy one', async () => {
    prisma.pushToken.findMany.mockResolvedValue([{ token: TOKEN_A }, { token: TOKEN_B }]);
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { status: 'ok', id: 'x' },
          { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    }));

    const sent = await push.notifyReportUpdate(7, { trackingId: 'X' });

    expect(sent).toBe(1);
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: [TOKEN_B] } } });
  });

  test('a different error is not treated as a dead device', async () => {
    prisma.pushToken.findMany.mockResolvedValue([{ token: TOKEN_A }]);
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ status: 'error', message: 'rate limited', details: { error: 'MessageRateExceeded' } }],
      }),
    }));

    await push.notifyReportUpdate(7, { trackingId: 'X' });

    expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled();
  });
});

describe('registering a device', () => {
  test('a token is re-pointed at whoever registered it last', async () => {
    prisma.pushToken.upsert.mockResolvedValue({});
    await push.registerDevice(9, TOKEN_A, 'android');

    // A phone that changes hands must not keep delivering the previous
    // person's report updates, so the row moves rather than duplicating.
    expect(prisma.pushToken.upsert).toHaveBeenCalledWith({
      where: { token: TOKEN_A },
      update: { user_id: 9, platform: 'android' },
      create: { user_id: 9, token: TOKEN_A, platform: 'android' },
    });
  });

  test('rubbish is refused before it reaches the table', async () => {
    for (const bad of ['', null, 'abc123', 'Bearer xyz', '<script>alert(1)</script>']) {
      expect(push.isExpoPushToken(bad)).toBe(false);
      expect(await push.registerDevice(9, bad, 'android')).toBeNull();
    }
    expect(prisma.pushToken.upsert).not.toHaveBeenCalled();
  });

  test('both Expo token spellings are accepted', () => {
    expect(push.isExpoPushToken(TOKEN_A)).toBe(true);
    expect(push.isExpoPushToken('ExpoPushToken[cccccccccccccccccccccc]')).toBe(true);
  });
});
