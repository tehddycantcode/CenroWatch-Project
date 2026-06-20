import { API_URL } from '../config';

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
  } catch {
    throw new Error('Cannot reach the server. Check the API URL in src/config.js and your Wi-Fi.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no/invalid JSON */
  }

  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.errors = data?.errors;
    throw err;
  }
  return data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: (token) => request('/auth/me', { token }),
  barangays: () => request('/barangays'),
};
