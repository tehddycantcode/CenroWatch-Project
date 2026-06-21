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

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { notifyReportStatus };
