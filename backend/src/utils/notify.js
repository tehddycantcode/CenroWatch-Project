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
function notifyReportStatus({ to, name, kind, trackingId, status, note, dueDate }) {
  const label = KIND_LABEL[kind] || 'Report';
  const niceStatus = humanize(status);
  const subject = `[CENROWATCH] ${label} ${trackingId} · ${niceStatus}`;
  const url = trackingUrl(trackingId);

  // Only sent when a deadline actually exists, which is the moment the report is
  // approved. Before that there is no commitment to communicate, and quoting a
  // date the office has not committed to would be worse than saying nothing.
  // The working-days sentence is here because a resident who counts calendar
  // days from this email will otherwise think CENRO is late when it is not.
  const dueHtml = dueDate
    ? `<p style="margin:16px 0;padding:12px 14px;background:#f1f7f3;border-radius:8px;color:#0f3d1f">
         <strong>Target response by:</strong> ${escapeHtml(formatDateTime(dueDate))}<br/>
         <span style="color:#66756e;font-size:13px">Requests are processed on working days. Saturdays, Sundays and holidays are not counted.</span>
       </p>`
    : '';
  const dueText = dueDate
    ? `\nTarget response by: ${formatDateTime(dueDate)}\nRequests are processed on working days. Saturdays, Sundays and holidays are not counted.\n`
    : '';

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
      ${dueHtml}
      ${noteHtml}
      <p><a href="${url}" style="display:inline-block;background:#22a050;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">View your report</a></p>
      <p style="color:#66756e;font-size:12px;margin-top:24px">
        This is an automated message from CENROWATCH. Please do not reply.
      </p>
    </div>`;

  const text = `CENROWATCH\n\nHi ${name || 'there'},\n\nYour ${label.toLowerCase()} ${trackingId} has been updated to: ${niceStatus}.\n${dueText}${
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
        If you did not request a password reset, you can safely ignore this email. Your password will not change.
      </p>
    </div>`;

  const text = `CENROWATCH Password reset\n\nHi ${name || 'there'},\n\nWe received a request to reset your password. Open this link to choose a new one (expires in 1 hour, single use):\n${url}\n\nIf you did not request this, ignore this email. Your password will not change.`;

  return sendMail({ to, subject, html, text });
}

/**
 * Email someone whose reset request could NOT produce a link, so they stop
 * waiting for one. Never throws.
 *
 * This is how the "your email is not registered" answer is delivered. It is
 * deliberately NOT in the API response: the endpoint is public and anonymous,
 * so answering there would let anyone test which addresses have accounts.
 * Sent to the typed address, only the mailbox owner learns the answer.
 *
 * @param {Object} p
 * @param {string} p.to      the address that was typed into the form
 * @param {'no_account'|'inactive'|'unverified'} p.reason
 */
function notifyPasswordResetUnavailable({ to, reason }) {
  const base = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const inactive = reason === 'inactive';
  const unverified = reason === 'unverified';

  const subject = unverified
    ? '[CENROWATCH] Confirm your email before resetting your password'
    : inactive
      ? '[CENROWATCH] We could not reset your password'
      : '[CENROWATCH] No CENROWATCH account uses this email';

  const body = unverified
    ? `<p>We received a request to reset the CENROWATCH password for this email address.</p>
       <p>This address has not been confirmed yet, so we cannot send a reset link to it. Sign in and enter the confirmation code we emailed you, then try again.</p>
       <p>If you cannot sign in, contact CENRO Cabuyao and we will confirm your address for you.</p>
       <p><a href="${base}/login" style="display:inline-block;background:#22a050;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Sign in</a></p>`
    : inactive
      ? `<p>We received a request to reset the CENROWATCH password for this email address.</p>
         <p>The account is registered, but it is currently inactive, so its password cannot be reset here. Please contact CENRO Cabuyao to have the account restored.</p>`
      : `<p>We received a request to reset a CENROWATCH password for this email address.</p>
         <p><strong>There is no CENROWATCH account registered with it</strong>, so there is nothing to reset. You may have signed up with a different email address.</p>
         <p><a href="${base}/register" style="display:inline-block;background:#22a050;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Create an account</a></p>`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f3d1f">
      <h2 style="color:#22a050;margin-bottom:4px">CENROWATCH</h2>
      <p style="color:#66756e;margin-top:0">CENRO Cabuyao · Environmental Monitoring</p>
      ${body}
      <p style="color:#66756e;font-size:12px;margin-top:24px">
        If you did not request a password reset, you can safely ignore this email. No account was created or changed.
      </p>
    </div>`;

  const text = unverified
    ? `CENROWATCH Password reset\n\nWe received a request to reset the CENROWATCH password for this email address.\n\nThis address has not been confirmed yet, so we cannot send a reset link to it. Sign in and enter the confirmation code we emailed you, then try again.\n\nIf you cannot sign in, contact CENRO Cabuyao and we will confirm your address for you.\n\nSign in: ${base}/login\n\nIf you did not request this, ignore this email. No account was created or changed.`
    : inactive
      ? `CENROWATCH Password reset\n\nWe received a request to reset the CENROWATCH password for this email address.\n\nThe account is registered, but it is currently inactive, so its password cannot be reset here. Please contact CENRO Cabuyao to have the account restored.\n\nIf you did not request this, ignore this email. No account was created or changed.`
      : `CENROWATCH Password reset\n\nWe received a request to reset a CENROWATCH password for this email address.\n\nThere is no CENROWATCH account registered with it, so there is nothing to reset. You may have signed up with a different email address.\n\nCreate an account: ${base}/register\n\nIf you did not request this, ignore this email. No account was created or changed.`;

  return sendMail({ to, subject, html, text });
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Report timestamps are stored in UTC; residents read them in local time.
const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Manila',
      })
    : '';

/**
 * Email a resident a receipt for the report they just filed. Never throws.
 * Anonymous complaints store no user_id (R.A. 10173 / whistleblower
 * protection) so they have no registered address — callers skip those.
 * @param {Object} p
 * @param {string} p.to        resident email
 * @param {string} p.name      resident first name
 * @param {'complaint'|'wildlife'|'request'} p.kind
 * @param {string} p.trackingId  tracking_id (complaint/request) or reference_id (wildlife)
 * @param {string} [p.type]      complaint_type / request_type / species_name
 * @param {string} [p.barangay]  barangay name
 * @param {Date}   [p.submittedAt]
 * @param {Date}   [p.slaDeadline]
 */
function notifyReportSubmitted({ to, name, kind, trackingId, type, barangay, submittedAt, slaDeadline }) {
  const label = KIND_LABEL[kind] || 'Report';
  const subject = `[CENROWATCH] ${label} received · ${trackingId}`;
  const url = trackingUrl(trackingId);

  // Wildlife turnovers are identified by species; the other kinds by category.
  const rows = [
    ['Reference number', trackingId],
    [kind === 'wildlife' ? 'Species' : 'Type', kind === 'wildlife' ? type : humanize(type)],
    ['Barangay', barangay],
    ['Date filed', formatDateTime(submittedAt)],
    ['Target response by', formatDateTime(slaDeadline)],
  ].filter(([, value]) => value);

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr>
           <td style="padding:6px 12px 6px 0;color:#66756e;white-space:nowrap">${escapeHtml(k)}</td>
           <td style="padding:6px 0;color:#0f3d1f;font-weight:bold">${escapeHtml(String(v))}</td>
         </tr>`
    )
    .join('');
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f3d1f">
      <h2 style="color:#22a050;margin-bottom:4px">CENROWATCH</h2>
      <p style="color:#66756e;margin-top:0">CENRO Cabuyao · Environmental Monitoring</p>
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>We received your ${label.toLowerCase()}. Keep the reference number below — you will need it to track your report.</p>
      <table style="margin:16px 0;border-collapse:collapse;font-size:14px">${rowsHtml}</table>
      <p><a href="${url}" style="display:inline-block;background:#22a050;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Track your report</a></p>
      <p style="color:#66756e;font-size:13px">We will email you again whenever the status changes.</p>
      <p style="color:#66756e;font-size:12px;margin-top:24px">
        This is an automated message from CENROWATCH. Please do not reply.
      </p>
    </div>`;

  const text = `CENROWATCH\n\nHi ${name || 'there'},\n\nWe received your ${label.toLowerCase()}.\n\n${rows
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n\nTrack your report: ${url}\n\nWe will email you again whenever the status changes.\nThis is an automated message. Please do not reply.`;

  return sendMail({ to, subject, html, text });
}

/**
 * Email a six-digit confirmation code. Never throws. The code is only ever
 * sent here - the DB stores its hash - and it expires in 10 minutes.
 * @param {Object} p
 * @param {string} p.to    recipient email
 * @param {string} p.name  recipient first name
 * @param {string} p.code  the six-digit code
 */
function notifyEmailVerification({ to, name, code }) {
  const subject = '[CENROWATCH] Your confirmation code';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f3d1f">
      <h2 style="color:#22a050;margin-bottom:4px">CENROWATCH</h2>
      <p style="color:#66756e;margin-top:0">CENRO Cabuyao &middot; Environmental Monitoring</p>
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>Use this code to confirm your email address:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#0f3d1f">${escapeHtml(code)}</p>
      <p>The code expires in 10 minutes. CENRO sends your report updates to this
         address, so confirming it is what lets us reach you.</p>
      <p style="color:#66756e;font-size:12px;margin-top:24px">
        If you did not create a CENROWATCH account, you can ignore this email.
      </p>
    </div>`;

  const text = `CENROWATCH\n\nHi ${name || 'there'},\n\nYour confirmation code is: ${code}\n\nThe code expires in 10 minutes.\n\nIf you did not create a CENROWATCH account, you can ignore this email.`;

  return sendMail({ to, subject, html, text });
}

module.exports = {
  notifyReportStatus,
  notifyReportSubmitted,
  notifyPasswordReset,
  notifyPasswordResetUnavailable,
  notifyEmailVerification,
};
