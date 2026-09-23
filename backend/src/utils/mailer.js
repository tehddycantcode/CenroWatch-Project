// Email sender (Nodemailer via Gmail SMTP). Designed to be SAFE in development:
// if no real credentials are configured it logs the message instead of sending,
// and a send failure NEVER throws — a status update must not fail because email
// is down. Configure EMAIL_USER + EMAIL_PASS (a Gmail App Password) in .env.

const nodemailer = require('nodemailer');

const PLACEHOLDER = 'your.cenrowatch.email@gmail.com';

function isConfigured() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  return Boolean(user && pass && user.includes('@') && user !== PLACEHOLDER);
}

let cachedTransport = null;
function getTransport() {
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },

    // IPv4 ONLY, and this is not a preference. On the deployed host DNS returns
    // an AAAA record for smtp.gmail.com and the container has no outbound IPv6
    // route, so every send died with:
    //   connect ENETUNREACH 2607:f8b0:4023:c0b::6d:465
    // Nothing about that message points at IPv6 unless you recognise the
    // address shape. Forcing family 4 skips the AAAA answer entirely.
    family: 4,

    // Nodemailer's defaults are 2 minutes to connect and 10 on the socket.
    // With the failure above that turned an unreachable mail server into a
    // 120-second registration request - the resident sees a button spinning
    // for two minutes and then succeeding, because the send is deliberately
    // swallowed and the account was created either way. A mail outage should
    // cost seconds, not minutes.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return cachedTransport;
}

/**
 * Send an email. Resolves to { sent: boolean }. Never rejects.
 * In dev (no creds) it logs a summary and resolves { sent: false }.
 */
async function sendMail({ to, subject, html, text }) {
  if (!to) return { sent: false };

  if (!isConfigured()) {
    // Dev fallback: don't send, just record what would have gone out.
    console.log(`[mailer] (disabled) would email ${to} — "${subject}"`);
    return { sent: false };
  }

  try {
    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    await getTransport().sendMail({ from, to, subject, html, text });
    return { sent: true };
  } catch (err) {
    console.error(`[mailer] failed to email ${to}: ${err.message}`);
    return { sent: false };
  }
}

module.exports = { sendMail, isConfigured };
