import { API_URL } from '../config';

// Origin that serves uploaded files (e.g. http://192.168.1.10:5000) — API_URL minus /api/v1.
export const FILE_BASE = API_URL.replace(/\/api\/v1\/?$/, '');

// Resolve a stored photo_path/document_path ("/uploads/...") to a full URL.
export function fileUrl(path) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${FILE_BASE}${path}`;
}

// Is this attachment a PDF? Must be asked of the PATH, not the whole URL: the
// API now returns "/uploads/requests/x.pdf?e=...&s=..." (a signed, expiring
// link) and a GCS signed URL carries an even longer query string, so a bare
// /\.pdf$/ test silently stops matching and every PDF is handed to <Image>
// instead of being offered as a document. Strip the query first.
export function isPdfPath(path) {
  return /\.pdf$/i.test(String(path || '').split('?')[0]);
}

// The app registers a callback here so an expired session (401 on a call
// that carried a token) can sign the user out globally. See AuthContext.
let onSessionExpired = null;
export function setSessionExpiredHandler(fn) {
  onSessionExpired = fn;
}

// `fetch` rejects for any transport-level failure, not only an unreachable
// host - a photo uri the OS won't read, a body over the size cap, or a dropped
// connection all land here too. The old message blamed Wi-Fi unconditionally,
// which sent people to check their router when the real cause was elsewhere.
// Keep the hint, but always carry the underlying reason so it can be acted on.
function netErrorMessage(err) {
  const detail = err && err.message ? ` (${err.message})` : '';
  return `Could not reach the server. Check your Wi-Fi and the API URL in src/config.js.${detail}`;
}

// Shared non-2xx path for request/requestForm: notify on expired sessions,
// then throw the normalized Error (.status, .errors) callers already expect.
function throwApiError(res, data, token) {
  if (res.status === 401 && token && onSessionExpired) onSessionExpired();
  const err = new Error(data?.message || `Request failed (${res.status})`);
  err.status = res.status;
  err.errors = data?.errors;
  throw err;
}

// Parse a JSON body, tolerating one that isn't there or isn't JSON: a 204 with
// no content, or an HTML error page from a proxy that never reached the API.
// The body stream can only be read ONCE, so call this at most once per response.
async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// Thin fetch wrapper for the CENROWATCH API. Attaches the JWT when given,
// parses JSON, and throws a normalized Error (.status, .errors) on non-2xx.
//
// The `res.ok` check comes BEFORE the body is read, and that order is the point.
// `fetch` resolves for 404 and 500 exactly as happily as for 200 - it rejects
// only when the request never completed - so this check is the only thing
// separating a failure from a success. Reading the body first and checking
// afterwards worked, but it made that safety depend on a later statement
// staying where it was: move or drop it and an error payload silently becomes
// the value handed back to a screen.
async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(netErrorMessage(err));
  }

  // On failure the body is still read, deliberately - it carries the API's own
  // message and field errors, which is what throwApiError surfaces to the user.
  if (!res.ok) throwApiError(res, await readJson(res), token);
  return readJson(res);
}

// Multipart variant for report submissions (optional photo/document attaches).
// IMPORTANT: do NOT set Content-Type — let fetch add the multipart boundary itself.
async function requestForm(path, form, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: form });
  } catch (err) {
    // Uploads fail here for reasons that have nothing to do with the network
    // (an unreadable photo uri, a file over the 5 MB cap). Keep the cause.
    throw new Error(netErrorMessage(err));
  }

  // Status first, same as request() above - see the note there.
  if (!res.ok) throwApiError(res, await readJson(res), token);
  return readJson(res);
}

// Barangays and report categories are small reference lists: cache the in-flight
// promise so the register screen and the report forms share one fetch per app
// session. A failed fetch clears the cache before rethrowing, so a rejection is
// never cached and the next mount retries cleanly.
// Consumers get the SAME resolved object: treat the result as read-only
// (never sort/splice the array in place; copy first).
//
// Report categories used to be a hardcoded array in lib/reports.js, hand-synced
// with a Prisma enum. They are admin-managed rows now, so the app picks up a new
// category on its next launch with no rebuild and no store release - which is
// the whole point on mobile, where shipping an update is slowest.
let barangaysPromise = null;
let categoriesPromise = null;

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  // Clears the SERVER-SET session cookie. The app authenticates with Bearer and
  // never reads this cookie, but React Native's Android networking is OkHttp,
  // which keeps a cookie jar and stores the Set-Cookie that login returns - for
  // the full JWT_EXPIRES_IN, across app restarts. Only the server can clear it
  // (it is HttpOnly), and this endpoint does exactly that and nothing else, so
  // calling it never disturbs the Bearer session.
  logout: () => request('/auth/logout', { method: 'POST' }),
  // Asks for a reset LINK, which the server emails. The app never sees the
  // token and cannot complete the reset: the link opens /reset-password in the
  // browser. The answer is deliberately the same whether or not the address has
  // an account, so never treat a 200 here as "this email exists".
  forgotPassword: (payload) => request('/auth/forgot-password', { method: 'POST', body: payload }),
  me: (token) => request('/auth/me', { token }),
  updateProfile: (payload, token) => request('/auth/me', { method: 'PATCH', body: payload, token }),
  changePassword: (payload, token) => request('/auth/change-password', { method: 'POST', body: payload, token }),
  barangays: () => {
    if (!barangaysPromise) {
      barangaysPromise = request('/barangays').catch((err) => {
        barangaysPromise = null;
        throw err;
      });
    }
    return barangaysPromise;
  },
  categories: () => {
    if (!categoriesPromise) {
      categoriesPromise = request('/categories').catch((err) => {
        categoriesPromise = null;
        throw err;
      });
    }
    return categoriesPromise;
  },

  // Resident report APIs — create() takes a FormData so an optional photo attaches.
  complaints: {
    create: (form, token) => requestForm('/complaints', form, token),
    mine: (token) => request('/complaints/mine', { token }),
    get: (trackingId, token) => request(`/complaints/${trackingId}`, { token }),
  },
  wildlife: {
    create: (form, token) => requestForm('/wildlife', form, token),
    mine: (token) => request('/wildlife/mine', { token }),
    get: (referenceId, token) => request(`/wildlife/${referenceId}`, { token }),
  },
  requests: {
    create: (form, token) => requestForm('/requests', form, token),
    mine: (token) => request('/requests/mine', { token }),
    get: (trackingId, token) => request(`/requests/${trackingId}`, { token }),
  },

  // In-app notifications. A user only ever sees and mutates their own — the
  // backend scopes every one of these by the token's user_id, so there is no
  // id to pass beyond the notification's own.
  notifications: {
    list: (token, limit = 20) => request(`/notifications?limit=${limit}`, { token }),
    markRead: (id, token) => request(`/notifications/${id}/read`, { method: 'PATCH', token }),
    markAllRead: (token) => request('/notifications/read-all', { method: 'PATCH', token }),
  },

  // Email confirmation. All three require the token: the soft gate means the
  // resident is signed in while their address is still unconfirmed.
  verifyEmail: (code, token) => request('/auth/verify-email', { method: 'POST', body: { code }, token }),
  resendVerification: (token) => request('/auth/resend-verification', { method: 'POST', token }),
  changeEmail: (email, token) => request('/auth/email', { method: 'PATCH', body: { email }, token }),
};
