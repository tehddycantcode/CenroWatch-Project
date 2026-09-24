// TEMPORARY DIAGNOSTIC — delete this file, its controller and its route once the
// mail question below is settled. It exists to answer ONE question that cannot
// be answered from outside the deployed container.
//
// The symptom: every send fails, logging either "Connection timeout" or
// "connect ENETUNREACH 2607:f8b0:...::465". The IPv6 half is a red herring —
// nodemailer resolves both families and tries "IPv4 first, then IPv6"
// (lib/shared/index.js), so an IPv6 error means the IPv4 attempt ALREADY
// failed. The 10-second request durations in the Railway log match
// connectionTimeout exactly, so the IPv4 connection is being silently dropped
// rather than refused.
//
// That is the signature of a host blocking outbound SMTP, but "blocked" and
// "Gmail-specific" need different fixes, so this measures instead of assuming:
// raw TCP connects, no TLS, no credentials, nothing sent.
//
// 443 is the control. If it connects and the mail ports do not, egress works
// and SMTP specifically is blocked.

const net = require('net');
const dns = require('dns').promises;

const PROBE_TIMEOUT_MS = 6000;

const TARGETS = [
  { host: 'smtp.gmail.com', port: 465, note: 'SMTPS - what the mailer uses today' },
  { host: 'smtp.gmail.com', port: 587, note: 'STARTTLS - commonly open where 465 is not' },
  { host: 'smtp.gmail.com', port: 25, note: 'plain SMTP - blocked almost everywhere' },
  { host: 'api.github.com', port: 443, note: 'CONTROL - proves outbound egress works at all' },
];

// One TCP connect. Resolves — never rejects — so one dead target cannot hide
// the others' results.
function probe({ host, port, note }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const socket = new net.Socket();

    const done = (outcome, detail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ target: `${host}:${port}`, note, outcome, detail, ms: Date.now() - started });
    };

    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once('connect', () => done('connected', null));
    socket.once('timeout', () => done('timeout', `no response within ${PROBE_TIMEOUT_MS}ms`));
    socket.once('error', (err) => done('error', `${err.code || 'ERR'}: ${err.message}`));

    // family 4 explicitly: the question is whether IPv4 works, and leaving it
    // to the resolver is what made the original failure ambiguous.
    socket.connect({ host, port, family: 4 });
  });
}

async function probeEgress() {
  const [results, a, aaaa] = await Promise.all([
    Promise.all(TARGETS.map(probe)),
    dns.resolve4('smtp.gmail.com').catch((e) => [`resolve4 failed: ${e.code || e.message}`]),
    dns.resolve6('smtp.gmail.com').catch((e) => [`resolve6 failed: ${e.code || e.message}`]),
  ]);

  return {
    probes: results,
    dns: { 'smtp.gmail.com A': a, 'smtp.gmail.com AAAA': aaaa },
    // Whether credentials exist at all, without ever revealing them. A send
    // cannot succeed without this being true, so it rules one cause in or out.
    mail_credentials_present: Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    email_user_domain: (process.env.EMAIL_USER || '').split('@')[1] || null,
    node: process.version,
  };
}

module.exports = { probeEgress };
