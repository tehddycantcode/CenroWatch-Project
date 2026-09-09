#!/usr/bin/env node
// CENROWATCH - pre-demo preflight check.
//
//   node scripts/preflight.mjs          # standard run
//   node scripts/preflight.mjs --full   # also logs in as all three roles
//
// Why this exists: a feature can be "done" in the repo and still be dead in the
// running system. That has actually happened here - migrations that never
// applied, email silently disabled by a placeholder credential, and a backend
// container built from a different folder than the one being edited. Green
// checkmarks in a sprint plan do not prove any of that. This does.
//
// Run it before every demo and before the defense. Non-zero exit = do not demo.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';

const API = 'http://localhost:5000';
const API_CONTAINER = 'cenrowatch_api';
const DB_CONTAINER = 'cenrowatch_db';
const DB_URL = 'mysql://cenro:cenrowatch_pass@db:3306/cenrowatch_db';
const FULL = process.argv.includes('--full');

const results = [];
const record = (level, name, detail) => results.push({ level, name, detail });
const pass = (n, d) => record('PASS', n, d);
const warn = (n, d) => record('WARN', n, d);
const fail = (n, d) => record('FAIL', n, d);

// Run a command, never throw - return { ok, out } so one dead check cannot
// abort the rest of the sweep.
function run(cmd, args) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`.trim();
    return { ok: false, out: out || e.message };
  }
}

async function http(path) {
  try {
    const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch (e) {
    return { ok: false, status: 0, body: e.message };
  }
}

// -- 1. Docker + containers -------------------------------------------------
const ps = run('docker', ['ps', '--format', '{{.Names}}|{{.Status}}']);
if (!ps.ok) {
  fail('Docker daemon', 'not reachable - start Docker Desktop');
} else {
  pass('Docker daemon', 'reachable');
  for (const c of [DB_CONTAINER, API_CONTAINER]) {
    const line = ps.out.split('\n').find((l) => l.startsWith(`${c}|`));
    if (!line) fail(`Container ${c}`, 'NOT running');
    else if (/unhealthy|Restarting/.test(line)) fail(`Container ${c}`, line.split('|')[1]);
    else pass(`Container ${c}`, line.split('|')[1]);
  }
}

// -- 2. API health ----------------------------------------------------------
const health = await http('/api/health');
if (health.ok) pass('API /api/health', `HTTP ${health.status}`);
else fail('API /api/health', `HTTP ${health.status} ${health.body.slice(0, 120)}`);

// -- 3. Migrations applied, and schema matches schema.prisma ----------------
// The killer check: `migrate status` can look fine while the live schema has
// silently drifted, so diff the real database against the datamodel too.
const status = run('docker', ['exec', API_CONTAINER, 'npx', 'prisma', 'migrate', 'status']);
if (/not yet been applied|failed migration/i.test(status.out)) {
  const tail = status.out.split('\n').filter((l) => l.trim()).slice(-3).join(' | ');
  fail('Migrations applied', tail);
} else if (/up to date/i.test(status.out)) {
  pass('Migrations applied', 'database schema is up to date');
} else {
  warn('Migrations applied', status.out.split('\n').slice(-2).join(' | ') || 'unexpected output');
}

const drift = run('docker', [
  'exec', API_CONTAINER, 'npx', 'prisma', 'migrate', 'diff',
  '--from-url', DB_URL,
  '--to-schema-datamodel', 'prisma/schema.prisma',
  '--script',
]);
if (!drift.ok) {
  fail('Schema drift', drift.out.split('\n').slice(0, 2).join(' | '));
} else if (/empty migration/i.test(drift.out)) {
  pass('Schema drift', 'live database matches schema.prisma exactly');
} else {
  const sql = drift.out
    .split('\n')
    .filter((l) => l.trim() && !/^[|)-]/.test(l.trim()) && !l.includes('Update available'))
    .slice(0, 6)
    .join('\n                                    ');
  fail('Schema drift', `database is OUT OF SYNC:\n                                    ${sql}`);
}

// -- 4. Email: prove SMTP auth without sending anything ---------------------
const mailScript = [
  "require('dotenv').config();",
  "const {isConfigured}=require('/app/src/utils/mailer');",
  "if(!isConfigured()){console.log('NOT_CONFIGURED');process.exit(0)}",
  "const t=require('nodemailer').createTransport({service:'gmail',auth:{user:process.env.EMAIL_USER,pass:process.env.EMAIL_PASS}});",
  "t.verify().then(()=>console.log('SMTP_OK')).catch(e=>console.log('SMTP_FAIL '+e.message));",
].join('');
const mail = run('docker', ['exec', API_CONTAINER, 'node', '-e', mailScript]);
if (/SMTP_OK/.test(mail.out)) {
  pass('Email (SMTP auth)', 'Gmail accepted the app password - notifications will send');
} else if (/NOT_CONFIGURED/.test(mail.out)) {
  fail('Email (SMTP auth)', 'EMAIL_USER/EMAIL_PASS missing or still the placeholder - mail is silently disabled');
} else {
  const msg = (mail.out.split('SMTP_FAIL ')[1] || mail.out).split('\n')[0];
  fail('Email (SMTP auth)', msg.slice(0, 160));
}

// -- 5. Uploads: locked down AND still reachable -----------------------------
// TWO checks, and the first one INVERTED the old test. /uploads used to be
// express.static, so this section asserted that a bare path returned 200 - which
// is now precisely the symptom of the hole being open again. A 200 here means
// every complaint photo in the system is readable by anyone with the URL.
const ls = run('docker', ['exec', API_CONTAINER, 'sh', '-c', 'find /app/uploads -type f ! -name .gitkeep | head -1']);
const sample = (ls.out.split('\n')[0] || '').replace('/app', '');
if (!sample) {
  warn('Uploads', 'no uploaded files found - fine on a clean install, wrong if you have demo reports');
} else {
  const bare = await http(sample);
  if (bare.status === 200) {
    fail('Uploads locked down', `${sample} was served with NO token - every report photo is public`);
  } else if (bare.status === 403) {
    pass('Uploads locked down', 'an unsigned request is refused (403)');
  } else {
    warn('Uploads locked down', `unsigned request returned HTTP ${bare.status}; expected 403`);
  }

  // Signed inside the container, so this tests the key the RUNNING server holds
  // rather than whatever happens to be in the local .env.
  const rel = sample.replace(/^\/uploads\//, '');
  const signScript = [
    "require('dotenv').config();",
    "const {signPath}=require('/app/src/utils/fileToken');",
    `console.log('SIGNED '+signPath(${JSON.stringify(rel)}));`,
  ].join('');
  const signed = run('docker', ['exec', API_CONTAINER, 'node', '-e', signScript]);
  const token = (signed.out.match(/SIGNED (\S+)/) || [])[1];

  if (!token) {
    fail('Uploads served', `could not mint a signed link: ${signed.out.split('\n').pop().slice(0, 120)}`);
  } else {
    const img = await http(`/uploads/${token}`);
    if (img.ok) pass('Uploads served', `signed link -> HTTP ${img.status}`);
    else fail('Uploads served', `signed link -> HTTP ${img.status} (report photos will not render)`);
  }
}

// -- 5b. Encryption at rest is actually switched on -------------------------
// Without the key the app still boots and still works; it just writes personal
// fields in plaintext. That is invisible from the outside, which is exactly why
// it belongs in the preflight rather than in a code review.
const cryptoScript = [
  "require('dotenv').config();",
  "const {isConfigured}=require('/app/src/utils/crypto.util');",
  "console.log(isConfigured()?'KEY_OK':'KEY_MISSING');",
].join('');
const cryptoCheck = run('docker', ['exec', API_CONTAINER, 'node', '-e', cryptoScript]);
if (/KEY_OK/.test(cryptoCheck.out)) {
  pass('Encryption at rest', 'FIELD_ENCRYPTION_KEY is set - personal fields are encrypted');
} else if (/KEY_MISSING/.test(cryptoCheck.out)) {
  fail('Encryption at rest', 'FIELD_ENCRYPTION_KEY is NOT set - contact numbers and addresses are stored in PLAINTEXT');
} else {
  fail('Encryption at rest', cryptoCheck.out.split('\n').pop().slice(0, 160));
}

// -- 6. Mobile APK target still matches this machine's LAN IP ---------------
// The APK bakes API_URL in at build time. If DHCP hands this PC a new address,
// the installed app silently stops reaching the server and needs a REBUILD -
// roughly 15 minutes. Catch it here, not during the defense.
try {
  const cfg = readFileSync(new URL('../mobile/src/config.js', import.meta.url), 'utf8');
  const baked = cfg.match(/export const API_URL\s*=\s*'https?:\/\/([^:/']+)/)?.[1];
  const localIps = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  if (!baked) {
    warn('Mobile API target', 'could not parse API_URL from mobile/src/config.js');
  } else if (localIps.includes(baked)) {
    pass('Mobile API target', `${baked} is still this machine`);
  } else {
    fail(
      'Mobile API target',
      `config.js points at ${baked}, but this PC is ${localIps.join(', ') || 'offline'}\n` +
        '                                    -> update mobile/src/config.js and REBUILD the APK, or the installed app cannot connect'
    );
  }
} catch (e) {
  warn('Mobile API target', e.message);
}

// -- 7. Logins (rate-limited endpoint - kept minimal on purpose) ------------
// /auth allows AUTH_RATE_LIMIT_MAX (default 10) attempts per 15 min per IP, so
// the standard run checks one account; --full checks all three.
const accounts = [
  ['Admin', 'admin@cenrowatch.local', 'Admin@1234'],
  ['CENRO_Staff', 'staff@cenrowatch.local', 'Staff@1234'],
];
for (const [role, email, password] of FULL ? accounts : accounts.slice(0, 1)) {
  try {
    const res = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(8000),
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 429) warn(`Login (${role})`, 'rate limited (429) - wait 15 min, not necessarily broken');
    else if (j?.data?.token) pass(`Login (${role})`, email);
    else fail(`Login (${role})`, `HTTP ${res.status} ${j?.message || ''}`);
  } catch (e) {
    fail(`Login (${role})`, e.message);
  }
}
if (!FULL) record('INFO', 'Login (other roles)', 'skipped to save the auth rate limit - use --full to check all');

// -- Report -----------------------------------------------------------------
const ICON = { PASS: '  OK  ', FAIL: ' FAIL ', WARN: ' WARN ', INFO: ' ---- ' };
console.log('\nCENROWATCH preflight\n' + '='.repeat(72));
for (const r of results) console.log(`[${ICON[r.level]}] ${r.name.padEnd(22)} ${r.detail}`);
const failed = results.filter((r) => r.level === 'FAIL');
const warned = results.filter((r) => r.level === 'WARN');
const passed = results.filter((r) => r.level === 'PASS');
console.log('='.repeat(72));
console.log(`${passed.length} passed, ${warned.length} warnings, ${failed.length} failed`);
if (failed.length) {
  console.log('\nNOT READY TO DEMO - fix the FAIL items above.');
  process.exit(1);
}
console.log(warned.length ? '\nUsable, but review the warnings.' : '\nAll clear.');
