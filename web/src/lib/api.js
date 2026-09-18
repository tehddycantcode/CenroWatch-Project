// Tiny fetch wrapper around the CENROWATCH API. Parses JSON and throws a
// normalized Error (with .status and .errors) on non-2xx. Supports FormData
// bodies (multipart) for photo/document uploads.
//
// THE SESSION IS A COOKIE, NOT A VARIABLE. The server issues the JWT as an
// HttpOnly `cenrowatch_token` cookie, so this file never sees, stores, or
// attaches the token — `credentials: 'include'` is what authenticates a call.
// That is deliberate: a token in localStorage is readable by any script on the
// page, so one XSS anywhere in the app could lift a signed-in Admin's session.
// HttpOnly puts it out of JavaScript's reach entirely.
//
// The consequence to remember: the client cannot inspect the cookie, so there
// is no synchronous "am I signed in?" answer. Only the server knows, and
// AuthContext asks it once at boot via authApi.session().

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

// Fired (on window) when an authenticated call comes back 401, i.e. the JWT
// expired or was revoked. AuthContext listens and signs the user out once.
export const SESSION_EXPIRED_EVENT = 'cenrowatch:session-expired';

// Origin that serves uploaded files (e.g. http://localhost:5000) — BASE without /api/v1.
export const FILE_BASE = BASE.replace(/\/api\/v1\/?$/, '');

// Resolve a stored photo_path/document_path ("/uploads/...") to a full URL.
export function fileUrl(path) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${FILE_BASE}${path}`;
}

// Is this attachment a PDF? Must be asked of the PATH, not the whole URL: the
// API now returns "/uploads/requests/x.pdf?e=...&s=..." (a signed, expiring
// link) and a GCS signed URL carries an even longer query string, so a bare
// /\.pdf$/ test silently stops matching and every PDF renders as a broken
// <img> instead of a link. Strip the query first.
export function isPdfPath(path) {
  return /\.pdf$/i.test(String(path || '').split('?')[0]);
}

// `notifyOnExpiry: false` suppresses the session-expired broadcast for calls
// where a 401 is an expected answer rather than a lost session — the boot
// probe (nobody is signed in yet) and sign-out.
export async function apiFetch(
  path,
  { method = 'GET', body, auth = true, headers = {}, notifyOnExpiry = true } = {}
) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const finalHeaders = { ...headers };
  // Let the browser set multipart boundaries; only set JSON header otherwise.
  if (!isForm && body) finalHeaders['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: finalHeaders,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      // Sends the HttpOnly session cookie. The API is a different origin than
      // the web app (:5000 vs :5173), so without this the cookie is omitted and
      // every authenticated call 401s. The server's CORS allowlist is exact
      // (CLIENT_URL / MOBILE_URL) with credentials:true, which is what makes
      // sending credentials cross-origin safe.
      credentials: 'include',
    });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no/invalid JSON body */
  }

  if (!res.ok) {
    // Expired/invalid session: tell the app so it can sign out once, then
    // throw as usual so callers' own error handling still runs. Requests
    // with auth:false (login, register, public GIS) can never trigger this.
    if (res.status === 401 && auth && notifyOnExpiry) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    const err = new Error(data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.errors = data?.errors; // express-validator field errors, when present
    throw err;
  }
  return data;
}

// Download an authenticated binary response (e.g. a PDF) and save it as a file.
export async function downloadFile(path, filename) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { credentials: 'include' });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    let msg = `Download failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j.message || msg;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const authApi = {
  register: (payload) => apiFetch('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => apiFetch('/auth/login', { method: 'POST', body: payload, auth: false }),
  // Clears the HttpOnly cookie server-side — the browser will not let us do it.
  logout: () => apiFetch('/auth/logout', { method: 'POST', auth: false }),
  me: () => apiFetch('/auth/me'),
  // Boot probe: "is there a session cookie, and is it still good?". A 401 is
  // the ordinary answer for a signed-out visitor, so it must not be broadcast
  // as an expired session (that would redirect people browsing the public map).
  session: () => apiFetch('/auth/me', { notifyOnExpiry: false }),
  updateProfile: (payload) => apiFetch('/auth/me', { method: 'PATCH', body: payload }),
  changePassword: (payload) => apiFetch('/auth/change-password', { method: 'POST', body: payload }),
  forgotPassword: (email) => apiFetch('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token, password) => apiFetch('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false }),
  verifyEmail: (code) => apiFetch('/auth/verify-email', { method: 'POST', body: { code } }),
  resendVerification: () => apiFetch('/auth/resend-verification', { method: 'POST' }),
  changeEmail: (email) => apiFetch('/auth/email', { method: 'PATCH', body: { email } }),
};

// Barangays and report categories are small, rarely-changing reference lists, so
// the in-flight promise is cached and every consumer shares one fetch per
// session (this also dedups concurrent callers). A failed fetch clears the cache
// before rethrowing, so a rejection is never cached and the next mount retries.
// Consumers get the SAME resolved object: treat the result as read-only
// (never sort/splice the array in place; copy first).
//
// These are NO LONGER immutable seed data - an Admin can add or retire a
// barangay or a category from the UI. `invalidate()` is what stops the admin
// screen from showing a stale list right after a change it just made, and what
// stops a retired category lingering in the report dropdowns for the rest of the
// session. Every admin mutation below calls it.
let barangaysPromise = null;
let categoriesPromise = null;

export const barangayApi = {
  list: () => {
    if (!barangaysPromise) {
      barangaysPromise = apiFetch('/barangays', { auth: false }).catch((err) => {
        barangaysPromise = null;
        throw err;
      });
    }
    return barangaysPromise;
  },
  invalidate: () => { barangaysPromise = null; },
};

// Active complaint / request categories for the report forms. Public: the
// response carries zero personal data (R.A. 10173).
export const categoryApi = {
  list: () => {
    if (!categoriesPromise) {
      categoriesPromise = apiFetch('/categories', { auth: false }).catch((err) => {
        categoriesPromise = null;
        throw err;
      });
    }
    return categoriesPromise;
  },
  invalidate: () => { categoriesPromise = null; },
};

// Report APIs — create() takes a FormData (so an optional photo/document attaches).
export const complaintApi = {
  create: (form) => apiFetch('/complaints', { method: 'POST', body: form }),
  listMine: () => apiFetch('/complaints/mine'),
  get: (trackingId) => apiFetch(`/complaints/${trackingId}`),
  // Public anonymous/whistleblower submission + status lookup (no auth).
  createAnonymous: (form) => apiFetch('/complaints/anonymous', { method: 'POST', body: form, auth: false }),
  track: (trackingId) => apiFetch(`/complaints/track/${trackingId}`, { auth: false }),
};

export const wildlifeApi = {
  create: (form) => apiFetch('/wildlife', { method: 'POST', body: form }),
  listMine: () => apiFetch('/wildlife/mine'),
  get: (referenceId) => apiFetch(`/wildlife/${referenceId}`),
};

export const requestApi = {
  create: (form) => apiFetch('/requests', { method: 'POST', body: form }),
  listMine: () => apiFetch('/requests/mine'),
  get: (trackingId) => apiFetch(`/requests/${trackingId}`),
};

// Public GIS / feed / stats (no auth, zero personal data).
export const gisApi = {
  map: () => apiFetch('/gis/map', { auth: false }),
  stats: () => apiFetch('/gis/stats', { auth: false }),
  feed: () => apiFetch('/gis/feed', { auth: false }),
};

// Build a query string from a params object, skipping empty values.
function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.append(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// In-app notifications (any authenticated user, scoped to self).
export const notificationApi = {
  list: (params) => apiFetch(`/notifications${qs(params)}`),
  markRead: (id) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => apiFetch('/notifications/read-all', { method: 'PATCH' }),
};

// Staff APIs (CENRO_Staff + Admin) — queues, detail, status workflow, dashboard.
function staffResource(name) {
  return {
    list: (params) => apiFetch(`/staff/${name}${qs(params)}`),
    get: (id) => apiFetch(`/staff/${name}/${id}`),
    updateStatus: (id, body) => apiFetch(`/staff/${name}/${id}/status`, { method: 'PATCH', body }),
    update: (id, body) => apiFetch(`/staff/${name}/${id}`, { method: 'PATCH', body }),
    // Printable copy of one report for CENRO hardcopy files.
    downloadReport: (id) => downloadFile(`/staff/${name}/${id}/report`, `cenrowatch-${id}.pdf`),
  };
}

export const staffApi = {
  overview: () => apiFetch('/staff/overview'),
  complaints: {
    ...staffResource('complaints'),
    // Log a walk-in complaint on behalf of a resident. `form` is a FormData
    // (optional `photo` field alongside the text fields).
    createWalkIn: (form) => apiFetch('/staff/complaints', { method: 'POST', body: form }),
  },
  wildlife: {
    ...staffResource('wildlife'),
    // Chain-of-custody photos — form is a FormData with one or more `photos` fields.
    addCustodyPhotos: (id, form) => apiFetch(`/staff/wildlife/${id}/custody-photos`, { method: 'POST', body: form }),
    removeCustodyPhoto: (id, path) => apiFetch(`/staff/wildlife/${id}/custody-photos`, { method: 'DELETE', body: { path } }),
  },
  requests: staffResource('requests'),
};

// Admin APIs (Admin only) — analytics, user management, audit log, settings.
export const adminApi = {
  // params: { range } or { startDate, endDate }. The PDF takes the SAME params
  // so an export always matches the window on screen - exporting a six-month
  // report from a one-month view would be worse than no export at all.
  analytics: (params) => apiFetch(`/admin/analytics${qs(params)}`),
  downloadReport: (params) =>
    downloadFile(
      `/admin/analytics/report${qs(params)}`,
      `cenrowatch-analytics-${new Date().toISOString().slice(0, 10)}.pdf`
    ),
  users: {
    list: (params) => apiFetch(`/admin/users${qs(params)}`),
    create: (body) => apiFetch('/admin/users', { method: 'POST', body }),
    update: (id, body) => apiFetch(`/admin/users/${id}`, { method: 'PATCH', body }),
    // Vouch for an address CENRO confirmed off-system (in person, by phone).
    // Separate from update() on purpose - see markEmailVerified on the server.
    verifyEmail: (id) => apiFetch(`/admin/users/${id}/verify-email`, { method: 'PATCH' }),
  },

  // Report categories. Every mutation invalidates the PUBLIC category cache, or
  // a category the Admin just retired would keep appearing in the report forms
  // for the rest of the session - including in this same browser tab.
  categories: {
    list: () => apiFetch('/admin/categories'),
    create: (kind, body) =>
      apiFetch(`/admin/categories/${kind}`, { method: 'POST', body }).then((r) => {
        categoryApi.invalidate();
        return r;
      }),
    update: (kind, id, body) =>
      apiFetch(`/admin/categories/${kind}/${id}`, { method: 'PATCH', body }).then((r) => {
        categoryApi.invalidate();
        return r;
      }),
  },

  // Barangays. Same reasoning, plus these mutations re-derive every Voronoi
  // boundary server-side, so the cached list is stale in more than one way.
  barangays: {
    list: () => apiFetch('/admin/barangays'),
    create: (body) =>
      apiFetch('/admin/barangays', { method: 'POST', body }).then((r) => {
        barangayApi.invalidate();
        return r;
      }),
    update: (id, body) =>
      apiFetch(`/admin/barangays/${id}`, { method: 'PATCH', body }).then((r) => {
        barangayApi.invalidate();
        return r;
      }),
  },
  // Soft delete: archived reports leave the working system but stay on record.
  archive: {
    list: () => apiFetch('/admin/archive'),
    archive: (kind, id, reason) => apiFetch(`/admin/archive/${kind}/${id}`, { method: 'PATCH', body: { reason } }),
    restore: (kind, id) => apiFetch(`/admin/archive/${kind}/${id}/restore`, { method: 'PATCH' }),
  },
  auditLogs: (params) => apiFetch(`/admin/audit-logs${qs(params)}`),
  settings: {
    list: () => apiFetch('/admin/settings'),
    update: (key, value) => apiFetch(`/admin/settings/${key}`, { method: 'PATCH', body: { setting_value: value } }),
  },
};
