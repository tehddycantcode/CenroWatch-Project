// In-app notifications (manuscript Notification Panel). Generated when a
// report's status changes and read by the owner via the notification bell.
// Push (FCM) is intentionally out of scope — see README/limitations.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');

const KIND_LABEL = { complaint: 'Complaint', wildlife: 'Wildlife Turnover', request: 'Service Request' };
const humanize = (v) => (v ? String(v).replace(/_/g, ' ') : '');

// Create a status-change notification for the report owner. No-op when there
// is no owner (e.g. an anonymous complaint). Never throws — a failed
// notification must not break a status update.
async function notifyStatusChange({ userId, kind, trackingId, status, note }) {
  if (!userId) return null;
  try {
    return await prisma.notification.create({
      data: {
        user_id: userId,
        type: 'STATUS_UPDATE',
        title: `${KIND_LABEL[kind] || 'Report'} ${trackingId}`,
        body: `Status updated to "${humanize(status)}".${note ? ` Note: ${note}` : ''}`,
        link: `/resident/track/${trackingId}`,
      },
    });
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
