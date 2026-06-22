// High-level email notifications for residents, built on the graceful mailer.
// Used by the staff services when a report's status changes.

const { sendMail } = require('./mailer');

const KIND_LABEL = { complaint: 'Complaint', wildlife: 'Wildlife Turnover', request: 'Service Request' };

const humanize = (v) => (v ? String(v).replace(/_/g, ' ') : '');

// Where the resident can view their report (web tracking page, login-gated).
function trackingUrl(trackingId) {
  const base = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/resident/track/${trackingId}`;
}

/**
 * Email a resident that their report's status changed. Never throws.
 * @param {Object} p
 * @param {string} p.to        resident email
 * @param {string} p.name      resident first name
 * @param {'complaint'|'wildlife'|'request'} p.kind
 * @param {string} p.trackingId
 * @param {string} p.status    new status (enum value)
 * @param {string} [p.note]    optional staff note shown to the resident
 */
function notifyReportStatus({ to, name, kind, trackingId, status, note }) {
  const label = KIND_LABEL[kind] || 'Report';
  const niceStatus = humanize(status);
  const subject = `[CENROWATCH] ${label} ${trackingId} — ${niceStatus}`;
  const url = trackingUrl(trackingId);

  const noteHtml = note
    ? `<p style="margin:16px 0;padding:12px 14px;background:#f1f7f3;border-radius:8px;color:#0f3d1f">
         <strong>Note from CENRO:</strong><br/>${escapeHtml(note)}
       </p>`
    : '';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f3d1f">
      <h2 style="color:#22a050;margin-bottom:4px">CENROWATCH</h2>
      <p style="color:#66756e;margin-top:0">CENRO Cabuyao · Environmental Monitoring</p>
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>Your ${label.toLowerCase()} <strong>${trackingId}</strong> has been updated to:</p>
      <p style="font-size:18px;font-weight:bold;color:#0f3d1f">${niceStatus}</p>
      ${noteHtml}
      <p><a href="${url}" style="display:inline-block;background:#22a050;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">View your report</a></p>
      <p style="color:#66756e;font-size:12px;margin-top:24px">
        This is an automated message from CENROWATCH. Please do not reply.
      </p>
    </div>`;

  const text = `CENROWATCH\n\nHi ${name || 'there'},\n\nYour ${label.toLowerCase()} ${trackingId} has been updated to: ${niceStatus}.\n${
    note ? `\nNote from CENRO: ${note}\n` : ''
  }\nView your report: ${url}\n\nThis is an automated message. Please do not reply.`;

  return sendMail({ to, subject, html, text });
}

// Where the user completes a password reset (web app; works for mobile via browser).
function resetUrl(token) {
  const base = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Email a password-reset link. Never throws. The raw token is only ever sent
 * here (the DB stores its hash). The link is single-use and expires in ~1 hour.
 * @param {Object} p
 * @param {string} p.to     recipient email
 * @param {string} p.name   recipient first name
 * @param {string} p.token  raw reset token
 */
function notifyPasswordReset({ to, name, token }) {
  const url = resetUrl(token);
  const subject = '[CENROWATCH] Reset your password';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f3d1f">
      <h2 style="color:#22a050;margin-bottom:4px">CENROWATCH</h2>
      <p style="color:#66756e;margin-top:0">CENRO Cabuyao · Environmental Monitoring</p>
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>We received a request to reset your CENROWATCH password. Click the button below to choose a new one. This link expires in 1 hour and can be used once.</p>
      <p><a href="${url}" style="display:inline-block;background:#22a050;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Reset my password</a></p>
      <p style="color:#66756e;font-size:13px">If the button doesn't work, copy this link into your browser:<br/>${escapeHtml(url)}</p>
      <p style="color:#66756e;font-size:12px;margin-top:24px">
        If you did not request a password reset, you can safely ignore this email — your password will not change.
      </p>
    </div>`;

  const text = `CENROWATCH — Password reset\n\nHi ${name || 'there'},\n\nWe received a request to reset your password. Open this link to choose a new one (expires in 1 hour, single use):\n${url}\n\nIf you did not request this, ignore this email — your password will not change.`;

  return sendMail({ to, subject, html, text });
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { notifyReportStatus, notifyPasswordReset };
