// The signed closure document: the wet-signed certification or chain-of-custody
// form that comes back on paper, scanned and filed against the case, and shown
// to the resident.
//
// ONE MODULE FOR ALL THREE KINDS. The rule being enforced - who may attach one,
// when, and what gets audited - is identical for a complaint, a turnover and a
// request, and three copies of it would drift.
//
// THIS IS NOT THE WORK PROOF. `resolution_proof_path` / `completion_proof_path`
// are CENRO's own evidence that the job was done, they are REQUIRED to close a
// case, and they stay internal. This column is the counter-signed paperwork
// handed back, it is OPTIONAL, and it is the one upload a resident can see.
// Requiring it would make staff either hold cases open for a week waiting on a
// signature from another office, or attach something arbitrary to get past the
// gate - which pollutes the very evidence the field exists to create.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { assertNotArchived } = require('../utils/archive');
const storage = require('./storage');

const complaintService = require('./staff.complaint.service');
const wildlifeService = require('./staff.wildlife.service');
const requestService = require('./staff.request.service');

const KINDS = {
  complaint: {
    label: 'complaint',
    table: 'Complaint',
    idField: 'complaint_id',
    refField: 'tracking_id',
    delegate: () => prisma.complaint,
    where: (v) => (/^\d+$/.test(String(v)) ? { complaint_id: Number(v) } : { tracking_id: String(v) }),
    reload: (id) => complaintService.getComplaint(id),
    // The states in which there is something to certify. Rejected is excluded:
    // nothing was carried out, so there is nothing to sign for.
    terminal: new Set(['Resolved']),
    closedWord: 'resolved',
  },
  wildlife: {
    label: 'wildlife record',
    table: 'WildlifeTurnover',
    idField: 'turnover_id',
    refField: 'reference_id',
    delegate: () => prisma.wildlifeTurnover,
    where: (v) => (/^\d+$/.test(String(v)) ? { turnover_id: Number(v) } : { reference_id: String(v) }),
    reload: (id) => wildlifeService.getTurnover(id),
    terminal: new Set(['Released', 'Transferred']),
    closedWord: 'released or transferred',
  },
  request: {
    label: 'service request',
    table: 'EnvironmentalRequest',
    idField: 'request_id',
    refField: 'tracking_id',
    delegate: () => prisma.environmentalRequest,
    where: (v) => (/^\d+$/.test(String(v)) ? { request_id: Number(v) } : { tracking_id: String(v) }),
    reload: (id) => requestService.getRequest(id),
    terminal: new Set(['Completed']),
    closedWord: 'completed',
  },
};

function kindOrThrow(kind) {
  const cfg = KINDS[kind];
  if (!cfg) throw new Error(`Unknown report kind: ${kind}`);
  return cfg;
}

async function load(cfg, idOrRef) {
  const row = await cfg.delegate().findFirst({
    where: cfg.where(idOrRef),
    select: {
      [cfg.idField]: true,
      [cfg.refField]: true,
      status: true,
      archived_at: true,
      closure_certificate_path: true,
    },
  });
  if (!row) throw new HttpError(404, 'Record not found.');
  assertNotArchived(row, cfg.label);
  return row;
}

/**
 * Attach a signed closure document.
 *
 * Refused on an open case, for the same reason the PDF withholds its signature
 * lines there: a certification of work that has not finished is a document
 * asserting something untrue. The check reads the record's CURRENT status, so
 * every case already sitting in a terminal state can take one.
 */
async function setCertificate(kind, staffId, idOrRef, storedPath, ctx = {}) {
  const cfg = kindOrThrow(kind);
  if (!storedPath) throw new HttpError(422, 'No document was uploaded.');
  const row = await load(cfg, idOrRef);

  if (!cfg.terminal.has(row.status)) {
    throw new HttpError(
      409,
      `A signed closure document can only be attached once this case is ${cfg.closedWord}. It is currently ${String(row.status).replace(/_/g, ' ')}.`,
    );
  }

  // Replacing one: drop the old file so a superseded scan is not left servable
  // behind a signed URL. Best-effort - remove() swallows a missing file, and a
  // failure to delete must not fail the upload that already succeeded.
  const previous = row.closure_certificate_path;

  await cfg.delegate().update({
    where: { [cfg.idField]: row[cfg.idField] },
    data: { closure_certificate_path: storedPath },
  });

  await writeAuditLog({
    performedBy: staffId,
    action: 'CLOSURE_CERTIFICATE_UPLOADED',
    targetTable: cfg.table,
    targetId: row[cfg.idField],
    data: { reference: row[cfg.refField], replaced: Boolean(previous) },
    ipAddress: ctx.ipAddress || null,
  });

  if (previous) await storage.remove(previous);

  return cfg.reload(row[cfg.idField]);
}

/** Remove a wrong scan. */
async function clearCertificate(kind, staffId, idOrRef, ctx = {}) {
  const cfg = kindOrThrow(kind);
  const row = await load(cfg, idOrRef);
  if (!row.closure_certificate_path) {
    throw new HttpError(404, 'No signed closure document is attached to this case.');
  }

  await cfg.delegate().update({
    where: { [cfg.idField]: row[cfg.idField] },
    data: { closure_certificate_path: null },
  });

  await writeAuditLog({
    performedBy: staffId,
    action: 'CLOSURE_CERTIFICATE_REMOVED',
    targetTable: cfg.table,
    targetId: row[cfg.idField],
    data: { reference: row[cfg.refField] },
    ipAddress: ctx.ipAddress || null,
  });

  await storage.remove(row.closure_certificate_path);

  return cfg.reload(row[cfg.idField]);
}

module.exports = { setCertificate, clearCertificate, KINDS };
