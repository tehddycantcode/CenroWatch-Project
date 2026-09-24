// Mints the Bearer token TestSprite injects into the backend tests.
//
// Logs in against a running CENROWATCH API and writes ONLY the JWT to a file,
// so the token never lands in a terminal, a shell history, or a transcript.
// Feed that file to `testsprite project credential --credential-file <path>`,
// then delete it.
//
//   node scripts/mint-testsprite-token.mjs <base-url> <out-file> <email> <password>
//
// Example (tunnel URL from `cloudflared tunnel --url http://localhost:5000`):
//   node scripts/mint-testsprite-token.mjs https://x.trycloudflare.com ./admin.token admin@cenrowatch.local '<password>'
//   testsprite project credential <projectId> --type "Bearer token" --credential-file ./admin.token
//   rm ./admin.token
//
// The account must be an Admin: the suite's admin tests read admin-only routes.
// JWT_EXPIRES_IN is 7d, so this needs re-running about weekly.

import { writeFileSync } from 'node:fs';

const [base, out, email, password] = process.argv.slice(2);

if (!base || !out || !email || !password) {
  console.error('usage: node scripts/mint-testsprite-token.mjs <base-url> <out-file> <email> <password>');
  process.exit(2);
}

const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`login failed: HTTP ${res.status} — ${body.message || 'no message'}`);
  process.exit(1);
}

const user = body.data?.user;
const token = body.data?.token ?? body.token;

if (!token) {
  console.error('login succeeded but no token was returned; response keys:', Object.keys(body));
  process.exit(1);
}

if (user && user.role !== 'Admin') {
  console.error(`warning: ${user.email} has role ${user.role}, not Admin — the admin tests will 401.`);
}

writeFileSync(out, token, 'utf8');
console.log(`signed in as ${user?.email ?? email} (role ${user?.role ?? 'unknown'})`);
console.log(`token written to ${out} — pass it with --credential-file, then delete it.`);
