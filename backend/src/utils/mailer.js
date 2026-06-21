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
