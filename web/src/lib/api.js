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
