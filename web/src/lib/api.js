// Tiny fetch wrapper around the CENROWATCH API. Attaches the JWT, parses JSON,
// and throws a normalized Error (with .status and .errors) on non-2xx.

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
const TOKEN_KEY = 'cenrowatch_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const finalHeaders = { 'Content-Type': 'application/json', ...headers };
  const token = getToken();
  if (auth && token) finalHeaders.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: finalHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Network failure (server down, CORS, no connection)
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
