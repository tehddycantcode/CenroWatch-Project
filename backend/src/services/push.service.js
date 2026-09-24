// Push notifications to residents' phones, via Expo's push service.
//
// WHY EXPO AND NOT FCM DIRECTLY: the app is an Expo build, so the device
// already has an ExpoPushToken. Sending through Expo is one HTTPS POST to
// exp.host - no firebase-admin dependency on the API, no service-account secret
// on the host, nothing to rotate. Expo relays to FCM using credentials that
// live in EAS rather than in this repo. Port 443, which is the only outbound
// port the deployed host allows (see utils/mailer.js for how we learned that).
//
// WHAT THE BANNER SAYS, AND WHY SO LITTLE: a push banner is readable on a
// LOCKED phone by whoever is holding it. This system takes whistleblower
// reports and encrypts reporter identity at rest, so putting a tracking
// reference or a staff note on a lock screen would give away at a glance what
// the rest of the system works to protect. The banner says only that there is
// an update; the reference travels in `data`, which is invisible until the app
// opens it.
//
// Every function here is best-effort and NEVER throws. A status update must not
// fail because a phone is unreachable - the same contract notifyStatusChange
// and sendMail already keep.

const prisma = require('../utils/prisma');

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const HTTP_TIMEOUT_MS = 10000;

// Expo's own format. Rejecting anything else keeps obvious rubbish out of the
// table; Expo itself is the real authority and tells us via DeviceNotRegistered.
const TOKEN_SHAPE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

function isExpoPushToken(token) {
  return typeof token === 'string' && TOKEN_SHAPE.test(token.trim());
}

/**
 * Remember a device for this user. Idempotent, and re-points an existing token
 * at whoever registered it most recently - a phone that changes hands must not
 * keep delivering the previous person's report updates.
 */
async function registerDevice(userId, token, platform) {
  if (!isExpoPushToken(token)) return null;
  try {
    return await prisma.pushToken.upsert({
      where: { token: token.trim() },
      update: { user_id: userId, platform: platform || null },
      create: { user_id: userId, token: token.trim(), platform: platform || null },
    });
  } catch (err) {
    console.error(`[push] could not register device: ${err.message}`);
    return null;
  }
}

/** Forget a device. Called on sign-out. */
async function unregisterDevice(token) {
  if (!token) return 0;
  try {
    const { count } = await prisma.pushToken.deleteMany({ where: { token: String(token).trim() } });
    return count;
  } catch (err) {
    console.error(`[push] could not unregister device: ${err.message}`);
    return 0;
  }
}

// Expo answers 200 with a per-message ticket even when a message failed, so the
// status has to be read out of the body rather than off the response code.
// DeviceNotRegistered means the app was uninstalled or the token rotated: that
// token is dead forever, so delete it instead of retrying it every status
// change until the table is mostly corpses.
async function pruneDeadTokens(tickets, tokens) {
  const dead = [];
  tickets.forEach((ticket, i) => {
    if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
      dead.push(tokens[i]);
    }
  });
  if (!dead.length) return 0;
  try {
    const { count } = await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
    return count;
  } catch (err) {
    console.error(`[push] could not prune dead tokens: ${err.message}`);
    return 0;
  }
}

/**
 * Tell a user's devices that one of their reports moved. Resolves to the number
 * of devices Expo accepted. Never rejects.
 *
 * @param {number} userId
 * @param {{ trackingId: string, kind: string }} report - carried in `data` only
 */
async function notifyReportUpdate(userId, { trackingId, kind } = {}) {
  if (!userId) return 0; // anonymous reports have no owner and no device
  try {
    const rows = await prisma.pushToken.findMany({ where: { user_id: userId } });
    if (!rows.length) return 0;

    const tokens = rows.map((r) => r.token);
    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      // Deliberately says nothing identifying - see the note at the top.
      title: 'Your report has an update',
      body: 'Tap to view.',
      data: { trackingId, kind },
    }));

    const res = await fetch(EXPO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[push] Expo responded ${res.status}`);
      return 0;
    }

    const body = await res.json();
    const tickets = Array.isArray(body?.data) ? body.data : [];
    await pruneDeadTokens(tickets, tokens);
    return tickets.filter((t) => t?.status === 'ok').length;
  } catch (err) {
    console.error(`[push] could not notify user ${userId}: ${err.message}`);
    return 0;
  }
}

module.exports = { registerDevice, unregisterDevice, notifyReportUpdate, isExpoPushToken };
