// Tiny fetch wrapper around the CENROWATCH API. Attaches the JWT, parses JSON,
// and throws a normalized Error (with .status and .errors) on non-2xx.
// Supports FormData bodies (multipart) for photo/document uploads.

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
const TOKEN_KEY = 'cenrowatch_token';

// Origin that serves uploaded files (e.g. http://localhost:5000) — BASE without /api/v1.
export const FILE_BASE = BASE.replace(/\/api\/v1\/?$/, '');

// Resolve a stored photo_path/document_path ("/uploads/...") to a full URL.
export function fileUrl(path) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${FILE_BASE}${path}`;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const finalHeaders = { ...headers };
  // Let the browser set multipart boundaries; only set JSON header otherwise.
  if (!isForm && body) finalHeaders['Content-Type'] = 'application/json';

  const token = getToken();
  if (auth && token) finalHeaders.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: finalHeaders,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
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
    const err = new Error(data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.errors = data?.errors; // express-validator field errors, when present
    throw err;
  }
  return data;
}

// Download an authenticated binary response (e.g. a PDF) and save it as a file.
export async function downloadFile(path, filename) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  if (!res.ok) {
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
  me: () => apiFetch('/auth/me'),
};

export const barangayApi = {
  list: () => apiFetch('/barangays', { auth: false }),
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

// Staff APIs (CENRO_Staff + Admin) — queues, detail, status workflow, dashboard.
function staffResource(name) {
  return {
    list: (params) => apiFetch(`/staff/${name}${qs(params)}`),
    get: (id) => apiFetch(`/staff/${name}/${id}`),
    updateStatus: (id, body) => apiFetch(`/staff/${name}/${id}/status`, { method: 'PATCH', body }),
    update: (id, body) => apiFetch(`/staff/${name}/${id}`, { method: 'PATCH', body }),
  };
}

export const staffApi = {
  overview: () => apiFetch('/staff/overview'),
  complaints: staffResource('complaints'),
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
  analytics: () => apiFetch('/admin/analytics'),
  downloadReport: () => downloadFile('/admin/analytics/report', `cenrowatch-analytics-${new Date().toISOString().slice(0, 10)}.pdf`),
  users: {
    list: (params) => apiFetch(`/admin/users${qs(params)}`),
    create: (body) => apiFetch('/admin/users', { method: 'POST', body }),
    update: (id, body) => apiFetch(`/admin/users/${id}`, { method: 'PATCH', body }),
  },
  auditLogs: (params) => apiFetch(`/admin/audit-logs${qs(params)}`),
  settings: {
    list: () => apiFetch('/admin/settings'),
    update: (key, value) => apiFetch(`/admin/settings/${key}`, { method: 'PATCH', body: { setting_value: value } }),
  },
};
