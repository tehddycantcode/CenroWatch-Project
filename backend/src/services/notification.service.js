// In-app notifications (manuscript Notification Panel). Generated when a
// report's status changes and read by the owner via the notification bell.
//
// This is also the one place a report update fans out to the resident, so it is
// where push belongs: the row below is the record, and push is a delivery
// channel over it, exactly as the status email is. Adding a channel here means
// the three staff services keep calling one function and cannot forget one.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { notifyReportUpdate } = require('./push.service');

const KIND_LABEL = { complaint: 'Complaint', wildlife: 'Wildlife Turnover', request: 'Service Request' };
const humanize = (v) => (v ? String(v).replace(/_/g, ' ') : '');

// Create a status-change notification for the report owner. No-op when there
// is no owner (e.g. an anonymous complaint). Never throws — a failed
// notification must not break a status update.
async function notifyStatusChange({ userId, kind, trackingId, status, note }) {
  if (!userId) return null;
  try {
    const created = await prisma.notification.create({
      data: {
        user_id: userId,
        type: 'STATUS_UPDATE',
        title: `${KIND_LABEL[kind] || 'Report'} ${trackingId}`,
        body: `Status updated to "${humanize(status)}".${note ? ` Note: ${note}` : ''}`,
        link: `/resident/track/${trackingId}`,
      },
    });

    // NOT awaited, for the same reason the verification email is not: a status
    // update must not wait on - or fail because of - an unreachable phone.
    // notifyReportUpdate never rejects, and Promise.resolve() guards the case
    // where a test replaces it with a plain jest.fn() returning undefined,
    // where calling .catch() on the return value would throw synchronously.
    //
    // The status and the note are deliberately NOT passed: the banner is
    // readable on a locked phone, so it says only that there is an update. See
    // push.service.js.
    Promise.resolve(notifyReportUpdate(userId, { trackingId, kind })).catch((err) => {
      console.error(`[notify] push for ${trackingId} failed: ${err.message}`);
    });

    return created;
  } catch (err) {
    console.error(`[notify] failed to create notification: ${err.message}`);
    return null;
  }
}

async function listForUser(userId, { limit } = {}) {
  const take = Number(limit) > 0 ? Number(limit) : 20;
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' }, take }),
    prisma.notification.count({ where: { user_id: userId, is_read: false } }),
  ]);
  return { items, unread };
}

async function markRead(userId, id) {
  const existing = await prisma.notification.findFirst({
    where: { notification_id: Number(id), user_id: userId },
  });
  if (!existing) throw new HttpError(404, 'Notification not found.');
  if (!existing.is_read) {
    await prisma.notification.update({ where: { notification_id: existing.notification_id }, data: { is_read: true } });
  }
  return { ...existing, is_read: true };
}

async function markAllRead(userId) {
  const res = await prisma.notification.updateMany({
    where: { user_id: userId, is_read: false },
    data: { is_read: true },
  });
  return { updated: res.count };
}

module.exports = { notifyStatusChange, listForUser, markRead, markAllRead };
