// Human-readable tracking IDs: CMP-2026-00001 / WLD-2026-00001 / REQ-2026-00001.
// The numeric part is the row's own auto-increment id (zero-padded) — unique and
// race-free (no counting), generated right after insert.

const PREFIX = { complaint: 'CMP', wildlife: 'WLD', request: 'REQ' };

function formatTrackingId(type, id, date = new Date()) {
  const prefix = PREFIX[type];
  if (!prefix) throw new Error(`Unknown tracking type: ${type}`);
  return `${prefix}-${date.getFullYear()}-${String(id).padStart(5, '0')}`;
}

module.exports = { formatTrackingId, PREFIX };
