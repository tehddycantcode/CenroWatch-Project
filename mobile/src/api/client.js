import { API_URL } from '../config';

// Origin that serves uploaded files (e.g. http://192.168.1.10:5000) — API_URL minus /api/v1.
export const FILE_BASE = API_URL.replace(/\/api\/v1\/?$/, '');

// Resolve a stored photo_path/document_path ("/uploads/...") to a full URL.
export function fileUrl(path) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${FILE_BASE}${path}`;
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

// Thin fetch wrapper for the CENROWATCH API. Attaches the JWT when given,
// parses JSON, and throws a normalized Error (.status, .errors) on non-2xx.
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

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no/invalid JSON */
  }

  if (!res.ok) throwApiError(res, data, token);
  return data;
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

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no/invalid JSON */
  }

  if (!res.ok) throwApiError(res, data, token);
  return data;
}

// The barangay list is immutable seed data (18 rows): cache the in-flight
// promise so the register screen and the report forms share one fetch per
// app session. A failed fetch clears the cache before rethrowing, so a
// rejection is never cached and the next mount retries cleanly.
// Consumers get the SAME resolved object: treat the result as read-only
// (never sort/splice res.data.barangays in place; copy first).
let barangaysPromise = null;

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
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
};
