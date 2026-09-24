// Email sender. TWO TRANSPORTS, and which one runs is decided by what is
// configured, not by an environment name.
//
// WHY NOT JUST SMTP: the deployed host blocks outbound SMTP. Measured from
// inside the container on 2026-09-24 - ports 25, 465 and 587 to
// smtp.gmail.com all time out after 6s with no response, while
// api.github.com:443 connects in 44ms from the same process. DNS resolves
// smtp.gmail.com correctly and the Gmail credentials are present and valid.
// Nothing was ever reaching Gmail to be authenticated, so every resident
// notification, every status update and every verification code was silently
// dropped.
//
// That is not a configuration problem and no nodemailer setting fixes it. An
// earlier attempt added `family: 4` on the theory that an IPv6 AAAA record was
// the cause. Two things were wrong with that: nodemailer 9 has no `family`
// option at all (not one reference in its lib/), and it resolves both families
// and tries "IPv4 first, then IPv6" anyway - so the ENETUNREACH on IPv6 only
// ever meant the IPv4 attempt had already failed. Both ports are blocked on
// both families.
//
// So mail goes over HTTPS instead, on 443, which demonstrably works. Brevo's
// transactional API is a plain POST; no SDK is needed.
//
// SMTP is KEPT for local development: a laptop reaches Gmail fine (measured at
// ~40ms), and the Docker and native setups documented in CLAUDE.md already have
// EMAIL_USER/EMAIL_PASS working. Setting BREVO_API_KEY switches to HTTP;
// leaving it unset keeps the old behaviour exactly.
//
// A send NEVER throws and never reports delivery - it resolves { sent } and
// logs. A status update must not fail because email is down.

const nodemailer = require('nodemailer');

const PLACEHOLDER = 'your.cenrowatch.email@gmail.com';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
// The whole point is to stop a mail outage from holding a request. HTTPS to a
// working host answers in well under a second.
const HTTP_TIMEOUT_MS = 10000;

function hasBrevo() {
  return Boolean(process.env.BREVO_API_KEY);
}

function hasSmtp() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  return Boolean(user && pass && user.includes('@') && user !== PLACEHOLDER);
}

function isConfigured() {
  return hasBrevo() || hasSmtp();
}

// EMAIL_FROM may be a bare address or "Name <address>"; Brevo wants them apart.
// The address must be a VERIFIED SENDER in the Brevo account or the API answers
// 400 - that is the one setup step this cannot do for you.
function parseFrom() {
  const raw = (process.env.EMAIL_FROM || process.env.EMAIL_USER || '').trim();
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || 'CENROWATCH', email: match[2] };
  return { name: 'CENROWATCH', email: raw };
}

let cachedTransport = null;
function getTransport() {
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },

    // Nodemailer's defaults are 2 minutes to connect and 10 on the socket.
    // Against an unreachable mail server that turned registration into a
    // 120-second request - the resident watches a button spin for two minutes
    // and then succeed, because the send is swallowed and the account was
    // created either way. A mail outage should cost seconds, not minutes.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return cachedTransport;
}

async function sendViaBrevo({ to, subject, html, text }) {
  const sender = parseFrom();
  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      ...(html ? { htmlContent: html } : {}),
      ...(text ? { textContent: text } : {}),
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });

  if (!res.ok) {
    // Brevo explains refusals in the body - an unverified sender and a bad key
    // look identical from the status code alone, and that distinction is the
    // whole difference between "finish the setup" and "rotate the key".
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`Brevo responded ${res.status} ${detail}`);
  }
  return { sent: true };
}

/**
 * Send an email. Resolves to { sent: boolean }. Never rejects.
 * With no credentials at all it logs a summary and resolves { sent: false }.
 */
async function sendMail({ to, subject, html, text }) {
  if (!to) return { sent: false };

  if (!isConfigured()) {
    // Dev fallback: don't send, just record what would have gone out.
    console.log(`[mailer] (disabled) would email ${to} — "${subject}"`);
    return { sent: false };
  }

  try {
    if (hasBrevo()) return await sendViaBrevo({ to, subject, html, text });
    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    await getTransport().sendMail({ from, to, subject, html, text });
    return { sent: true };
  } catch (err) {
    console.error(`[mailer] failed to email ${to}: ${err.message}`);
    return { sent: false };
  }
}

module.exports = { sendMail, isConfigured };
