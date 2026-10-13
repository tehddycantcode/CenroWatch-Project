// Renders a single report (complaint, wildlife turnover, or service request)
// into a PDF. Pure layout over the detail object the services already return -
// no DB access here.
//
// TWO AUDIENCES, ONE CODE PATH.
//
//   'official' - the record CENRO keeps, an auditor reads, and a receiving
//                department signs. Produced behind staff/admin RBAC, and it
//                intentionally carries reporter contact details, SLA internals
//                and the closure work proof. The zero-personal-data rule
//                (R.A. 10173) governs PUBLIC endpoints, not this one, so the
//                footer reminds whoever holds the printout of that duty.
//
//   'resident' - the resident's own copy of their own case. It prints exactly
//                the fields web/src/pages/resident/TrackReportPage.jsx already
//                shows them, plus the signed closure certificate and an
//                acknowledgement line. That rule is deliberate: the PDF then
//                introduces NO new disclosure decision. Anything the tracking
//                page does not render stays out of this document until
//                somebody decides it should be rendered.
//
// Parameterising one writer rather than forking two is what stops a field
// appearing on one copy and silently rotting on the other.

const {
  MUTED, humanize, letterhead, withRunningHeader, stampPages, section,
  fieldGrid, drawRow, paragraph, signatureBlock, photoGrid, attachment,
  createReportDocument, ensureSpace,
} = require('./report.layout');
const storage = require('./storage');

const fmt = (d) => (d ? new Date(d).toLocaleString('en-PH') : null);
const yesNo = (v) => (v ? 'Yes' : 'No');
const staffName = (s) => (s ? `${s.first_name || ''} ${s.last_name || ''}`.trim() || null : null);

const KINDS = {
  complaint: {
    official: 'Environmental Complaint Record',
    resident: 'Complaint - Resident Copy',
    idField: 'tracking_id',
  },
  wildlife: {
    official: 'Wildlife Turnover Record',
    resident: 'Wildlife Turnover - Resident Copy',
    idField: 'reference_id',
  },
  request: {
    official: 'Environmental Service Request Record',
    resident: 'Service Request - Resident Copy',
    idField: 'tracking_id',
  },
};

// The states in which the work is finished and a signature means something.
// Rejected is NOT terminal for signing purposes: nothing was handed over and
// nothing was delivered, so there is nothing to certify.
const TERMINAL = {
  complaint: new Set(['Resolved']),
  wildlife: new Set(['Released', 'Transferred']),
  request: new Set(['Completed']),
};

const CLASSIFICATION = {
  official: 'Contains personal data. Handle per R.A. 10173.',
  resident: 'CENROWATCH - CENRO Cabuyao',
};

// ---------------------------------------------------------------------------
// Shared blocks

function issuedLine(doc, meta, audience) {
  const when = fmt(meta.generatedAt || Date.now());
  // The resident copy names no staff member. The resident-facing selects
  // deliberately omit every staff identity (see complaint.service DETAIL_SELECT),
  // and a generated document should not be the one place that leaks one.
  const text = audience === 'resident'
    ? `Issued ${when}`
    : `Generated ${when}${meta.by ? ` by ${meta.by}` : ''}`;
  doc.fontSize(7.5).font('Helvetica').fillColor(MUTED)
    .text(text, doc.page.margins.left, doc.y, { width: 400, lineBreak: false });
  doc.y += 12;
  doc.fillColor('#000');
}

// Who filed it. Walk-in and anonymous reports have no linked account, so the
// printout must say so explicitly rather than leaving the field blank.
// OFFICIAL COPY ONLY - a resident does not need their own details read back.
function reporterBlock(doc, r) {
  section(doc, 'Reporter');
  if (r.is_anonymous) {
    fieldGrid(doc, [
      ['Reporter', 'Anonymous - no identity collected'],
      ['Logged by', staffName(r.logged_by_staff)],
    ]);
    paragraph(doc,
      'Filed anonymously. No name, account or contact detail was recorded, and the report cannot be linked back to a filer.',
      { size: 8, color: MUTED });
    return;
  }
  if (r.logged_by) {
    fieldGrid(doc, [
      ['Reporter', r.reporter_name || 'Not recorded'],
      ['Contact', r.reporter_contact || 'Not recorded'],
      ['Received via', humanize(r.received_via || 'Walk_In')],
      ['Logged by', staffName(r.logged_by_staff) || 'Not recorded'],
    ]);
    return;
  }
  const u = r.user || r.resident;
  fieldGrid(doc, [
    ['Reporter', staffName(u) || 'Not recorded'],
    ['Email', u?.email || 'Not recorded'],
    ['Contact number', u?.contact_number || 'Not recorded'],
  ]);
}

function locationBlock(doc, r) {
  const hasGeo = r.latitude != null && r.longitude != null;
  if (!hasGeo && !r.address_details) return;
  section(doc, 'Location');
  if (r.address_details) paragraph(doc, r.address_details);
  if (hasGeo) {
    doc.y += 4;
    fieldGrid(doc, [['Coordinates', `${r.latitude}, ${r.longitude}`]], { cols: 1 });
  }
}

function notesBlock(doc, r, audience) {
  const title = audience === 'resident' ? 'Updates from CENRO' : 'CENRO Action';
  if (!r.staff_notes && !r.resolution_notes) return;
  section(doc, title);
  if (r.staff_notes) paragraph(doc, r.staff_notes);
  if (r.resolution_notes) {
    doc.y += 6;
    paragraph(doc, 'Resolution', { bold: true, size: 8.5, color: MUTED });
    paragraph(doc, r.resolution_notes);
  }
}

// The status timeline. Audience-aware because the two selects differ: the staff
// detail select carries old_status and changed_by, the resident one carries
// neither (by design - no staff identity reaches a resident). Printing an
// "old to new" transition from a record that has no old_status would render
// "undefined to Resolved".
function historyBlock(doc, r, audience) {
  const rows = r.status_history || [];
  section(doc, audience === 'resident' ? 'Progress' : 'Status History');
  if (rows.length === 0) {
    paragraph(doc, 'No status changes recorded.', { color: MUTED, size: 8.5 });
    return;
  }
  const left = doc.page.margins.left;
  const resident = audience === 'resident';
  const head = resident
    ? [{ text: 'Date', x: left, w: 130 }, { text: 'Status', x: left + 130, w: 130 },
      { text: 'Note', x: left + 260, w: 235 }]
    : [{ text: 'Date', x: left, w: 130 }, { text: 'Change', x: left + 130, w: 160 },
      { text: 'Note', x: left + 290, w: 205 }];
  drawRow(doc, head, { bold: true, color: MUTED, size: 7.5 });
  for (const h of rows) {
    drawRow(doc, resident
      ? [
        { text: fmt(h.changed_at) || '-', x: left, w: 130 },
        { text: humanize(h.new_status), x: left + 130, w: 130 },
        { text: h.note || '-', x: left + 260, w: 235 },
      ]
      : [
        { text: fmt(h.changed_at) || '-', x: left, w: 130 },
        { text: `${humanize(h.old_status)} to ${humanize(h.new_status)}`, x: left + 130, w: 160 },
        { text: h.note || '-', x: left + 290, w: 205 },
      ]);
  }
}

// Collapse the single path and the list into one set, de-duplicated.
//
// photo_path STAYS the primary and is written on every create, while
// photo_paths holds every file including that one. A row filed before
// multi-upload (2026-10-12) has a photo_path and a NULL list, which must read
// as "one photo" and not as "no photos" - so this is a fallback, not defence.
function allFiles(single, list) {
  const out = [];
  const seen = new Set();
  for (const p of [...(Array.isArray(list) ? list : []), single]) {
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

// THE EVIDENCE SECTION. This exists because the document is offered as the
// retained copy of a report, and for an environmental complaint the photograph
// IS the evidence - it used to be represented by the single line
// "Photo attached: Yes", which is not a copy of anything, and which became
// outright wrong once a report could carry five.
//
// Every path prints something. A missing file, an unreadable one, or a format
// pdfkit cannot decode (webp/heic/heif are all accepted by the uploader) each
// produce a stated reason rather than a silent omission, so nobody is handed a
// page that looks complete while the evidence is absent.
async function attachmentsBlock(doc, paths, { label = 'Photograph', title } = {}) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return;

  // Break BEFORE the heading when a photo row will not fit under it. Otherwise
  // photoGrid breaks on its own and strands "Attachments (3)" alone at the
  // bottom of a page, above half a page of white.
  ensureSpace(doc, 250);
  section(doc, title || (list.length > 1 ? `Attachments (${list.length})` : 'Attachment'));
  const items = [];
  for (const [i, p] of list.entries()) {
    items.push({
      // read() answers null instead of throwing when the object is gone.
      buf: await storage.read(p),
      caption: list.length > 1 ? `${label} ${i + 1} of ${list.length}` : label,
    });
  }
  await photoGrid(doc, items);
}

// One file on its own, full width - used for the closure documents, where the
// point is to be able to read what was signed.
async function singleAttachment(doc, p, caption) {
  if (!p) return;
  await attachment(doc, await storage.read(p), caption);
}

// ---------------------------------------------------------------------------
// Signature blocks

// CENRO's side of a signature block. The printed name comes from the record,
// never from whoever clicked Download, and the designation is left BLANK
// because the system does not store job titles - printing a plausible one
// would put a claim on a signed record that nobody made.
const cenroColumn = (role, name) => ({
  role,
  lines: [
    ['Printed name', name],
    ['Designation', null],
    ['Office', 'CENRO Cabuyao'],
    ['Date signed', null],
  ],
});

function custodySignatures(doc, w) {
  signatureBlock(doc, {
    title: 'Chain of Custody - Release and Receipt',
    note: 'To be completed in ink when the animal changes hands. Each party retains one signed copy; the signed scan is filed back into CENROWATCH against this reference.',
    columns: [
      cenroColumn('Released by (CENRO Cabuyao)', staffName(w.staff)),
      {
        role: 'Received by',
        lines: [
          ['Printed name', null],
          ['Designation', null],
          // Pre-filled from the record when staff recorded where it went, since
          // that is a fact the system holds. Blank otherwise.
          ['Agency / Office', w.transfer_destination || null],
          ['Contact number', null],
          ['Date signed', null],
        ],
      },
      {
        role: 'Witnessed by',
        lines: [
          ['Printed name', null],
          ['Designation', null],
          ['Agency / Office', null],
          ['Date signed', null],
        ],
      },
    ],
    remarks: 'Remarks / condition of animal on release or transfer',
  });
}

const residentColumn = (residentName) => ({
  role: 'Received by (resident)',
  lines: [
    ['Printed name', residentName || null],
    ['Contact number', null],
    ['Date received', null],
  ],
});

function certificationSignatures(doc, { staff, residentName }) {
  signatureBlock(doc, {
    title: 'Certification',
    note: 'Certifying that the action recorded above was carried out. To be completed in ink.',
    columns: [
      cenroColumn('Certified by', staffName(staff)),
      cenroColumn('Noted by (CENRO Head)', null),
      residentColumn(residentName),
    ],
  });
}

// The resident's copy gets ONE line - their own acknowledgement of receipt.
//
// It does not reproduce CENRO's certification columns, and that is deliberate
// rather than an omission. Those lines are signed on the office's copy, and the
// counter-signed result reaches the resident as the uploaded closure document.
// Printing a blank "Certified by" on their copy would state that nobody
// certified it; printing a filled one would put a staff member's name on a
// document whose whole rule is that it shows only what the tracking page shows.
//
// Today the resident DETAIL_SELECTs carry no staff relation, so the name would
// come out blank ANYWAY - which is precisely why this is written as an explicit
// rule. A future widening of those selects must not start leaking names here.
function residentReceipt(doc, residentName) {
  signatureBlock(doc, {
    title: 'Acknowledgement of Receipt',
    note: 'Sign here when you receive the signed closure document from CENRO Cabuyao.',
    columns: [residentColumn(residentName)],
  });
}

// On an open case the lines are withheld and the reason is stated.
//
// A printed signing line for a handover that has not happened is a blank form
// that can be signed to assert something false. The gate reads the record's
// CURRENT status - no transition is involved - so every row already sitting in
// a terminal state renders its block correctly.
function signatureSection(doc, kind, r, ctx = {}) {
  if (!TERMINAL[kind].has(r.status)) {
    section(doc, 'Signatures');
    paragraph(doc,
      `Signature lines appear on this document once the case is ${
        kind === 'wildlife' ? 'released or transferred' : kind === 'request' ? 'completed' : 'resolved'
      }. This case is currently ${humanize(r.status)}.`,
      { size: 8.5, color: MUTED });
    return;
  }
  // The resident is not a party to a chain-of-custody handover and does not
  // certify CENRO's own work, so their copy carries only their receipt line.
  if (ctx.audience === 'resident') {
    residentReceipt(doc, ctx.residentName);
    return;
  }
  if (kind === 'wildlife') custodySignatures(doc, r);
  else certificationSignatures(doc, ctx);
}

// The staff-signed document handed back to the resident. Printed on BOTH copies
// when present: it is the resident's proof, and the office needs to see that it
// was issued.
async function certificateSection(doc, r) {
  if (!r.closure_certificate_path) return;
  section(doc, 'Signed Closure Document');
  paragraph(doc,
    'A signed document has been filed against this case and is available to the resident in CENROWATCH.',
    { size: 8.5, color: MUTED });
  doc.y += 4;
  await singleAttachment(doc, r.closure_certificate_path, 'Signed closure document');
}

function acknowledgement(doc) {
  section(doc, 'Acknowledgement');
  paragraph(doc,
    'This is a system-generated copy of your report as recorded by the City Environment and Natural Resources Office of Cabuyao. Quote the reference number above in any follow-up.',
    { size: 8.5, color: MUTED });
}

// ---------------------------------------------------------------------------
// Writers

async function writeComplaintReport(doc, c, meta = {}) {
  const audience = meta.audience === 'resident' ? 'resident' : 'official';
  const resident = audience === 'resident';
  letterhead(doc, { title: KINDS.complaint[audience], reference: c.tracking_id });
  issuedLine(doc, meta, audience);

  section(doc, resident ? 'Your Report' : 'Case Summary');
  fieldGrid(doc, resident
    ? [
      ['Type', humanize(c.complaint_type)],
      ['Status', humanize(c.status)],
      ['Barangay', c.barangay?.name],
      ['Priority', yesNo(c.priority)],
      ['Filed', fmt(c.submitted_at)],
      ['Date observed', fmt(c.observed_at)],
      // Shown on the tracking page already, and it is the office's Citizens
      // Charter commitment TO this resident rather than an internal metric.
      ['Service commitment', fmt(c.sla_deadline)],
      ['Resolved', fmt(c.resolved_at) || 'Not yet resolved'],
    ]
    : [
      ['Type', humanize(c.complaint_type)],
      ['Status', humanize(c.status)],
      ['Priority', yesNo(c.priority)],
      ['Filed anonymously', yesNo(c.is_anonymous)],
      ['Barangay', c.barangay?.name],
      ['Received via', humanize(c.received_via || (c.logged_by ? 'Walk_In' : 'Online'))],
      ['Filed', fmt(c.submitted_at)],
      ['Date observed', fmt(c.observed_at)],
      ['SLA deadline', fmt(c.sla_deadline)],
      ['SLA breached', yesNo(c.exceeded_sla)],
      ['Resolved', fmt(c.resolved_at) || 'Not yet resolved'],
      ['Assigned to', staffName(c.assigned_staff) || 'Unassigned'],
    ]);

  section(doc, 'Description');
  paragraph(doc, c.description || 'No description provided.');
  locationBlock(doc, c);
  if (!resident) reporterBlock(doc, c);
  notesBlock(doc, c, audience);
  historyBlock(doc, c, audience);

  await attachmentsBlock(doc, allFiles(c.photo_path, c.photo_paths), {
    label: 'Evidence photograph',
    title: resident ? 'Your Attachments' : undefined,
  });
  // Work proof is CENRO's evidence that the job was done. Internal: it is not
  // on the resident's tracking page, so it is not on their copy.
  if (!resident) await singleAttachment(doc, c.resolution_proof_path, 'Resolution work proof');
  await certificateSection(doc, c);

  signatureSection(doc, 'complaint', c, {
    audience,
    // Not read on the resident copy - see residentReceipt. Passed as null
    // there so the exclusion is a rule in this file rather than a side effect
    // of what the resident DETAIL_SELECT happens to omit.
    staff: resident ? null : c.assigned_staff,
    residentName: meta.residentName || staffName(c.user) || c.reporter_name || null,
  });
  if (resident) acknowledgement(doc);
}

async function writeWildlifeReport(doc, w, meta = {}) {
  const audience = meta.audience === 'resident' ? 'resident' : 'official';
  const resident = audience === 'resident';
  letterhead(doc, { title: KINDS.wildlife[audience], reference: w.reference_id });
  issuedLine(doc, meta, audience);

  section(doc, resident ? 'Your Report' : 'Case Summary');
  fieldGrid(doc, resident
    ? [
      ['Species', w.species_name],
      ['Category', w.species_category],
      ['Condition on report', humanize(w.animal_condition)],
      // "Not specified" rather than a guess: the column is nullable and every
      // row filed before the question existed has none. Printing a default
      // would put a commitment the reporter never made onto the record.
      ['Turnover method', w.turnover_method ? humanize(w.turnover_method) : 'Not specified'],
      ['Endangered', w.is_endangered ? 'Yes - priority review' : 'No'],
      ['Status', humanize(w.status)],
      ['Barangay', w.barangay?.name],
      ['Filed', fmt(w.submitted_at)],
      ['Service commitment', fmt(w.sla_deadline)],
    ]
    : [
      ['Species', w.species_name],
      ['Category', w.species_category],
      ['Endangered', w.is_endangered ? 'Yes - priority review' : 'No'],
      ['Condition on report', humanize(w.animal_condition)],
      ['Status', humanize(w.status)],
      ['Turnover method', w.turnover_method ? humanize(w.turnover_method) : 'Not specified'],
      ['Barangay', w.barangay?.name],
      ['Filed', fmt(w.submitted_at)],
      ['SLA deadline', fmt(w.sla_deadline)],
      ['SLA breached', yesNo(w.exceeded_sla)],
      ['Intake date', fmt(w.intake_date) || 'Not yet received'],
      ['Release date', fmt(w.release_date) || 'Not yet released'],
      ['Transfer destination', w.transfer_destination],
      // The officer who handled the animal. This is the name that has to appear
      // on the Released by line of the custody block below, which is why it is
      // here - the staff detail page has always shown it, the PDF never did.
      ['Processed by', staffName(w.staff) || 'Unassigned'],
      ['Chain-of-custody photos', String((w.chain_of_custody_photos || []).length)],
    ]);

  section(doc, 'Description');
  paragraph(doc, w.description || 'No description provided.');
  locationBlock(doc, w);
  if (!resident) reporterBlock(doc, w);
  notesBlock(doc, w, audience);
  historyBlock(doc, w, audience);

  await attachmentsBlock(doc, allFiles(w.photo_path, w.photo_paths), {
    label: 'Turnover photograph',
    title: resident ? 'Your Attachments' : undefined,
  });
  // Custody photos are the record of how the animal was handled after
  // collection, so they belong in the retained copy as much as the original
  // sighting does. Internal: not on the resident's tracking page.
  if (!resident) {
    // signFiles turns this column into { key, url } pairs for the staff UI, so
    // accept either shape rather than assuming one.
    const custody = (w.chain_of_custody_photos || []).map((p) => (typeof p === 'string' ? p : p?.key)).filter(Boolean);
    await attachmentsBlock(doc, custody, {
      label: 'Chain-of-custody photograph',
      title: 'Chain-of-Custody Documentation',
    });
  }
  await certificateSection(doc, w);

  signatureSection(doc, 'wildlife', w, { audience, residentName: meta.residentName });
  if (resident) acknowledgement(doc);
}

async function writeRequestReport(doc, r, meta = {}) {
  const audience = meta.audience === 'resident' ? 'resident' : 'official';
  const resident = audience === 'resident';
  letterhead(doc, { title: KINDS.request[audience], reference: r.tracking_id });
  issuedLine(doc, meta, audience);

  section(doc, resident ? 'Your Request' : 'Case Summary');
  fieldGrid(doc, resident
    ? [
      ['Service', humanize(r.request_type)],
      ['Status', humanize(r.status)],
      ['Barangay', r.barangay?.name],
      ['Quantity requested', r.requested_quantity == null ? null : String(r.requested_quantity)],
      ['Preferred schedule', fmt(r.preferred_schedule)],
      ['Scheduled for', fmt(r.scheduled_date) || 'Not yet scheduled'],
      ['Completed', fmt(r.completion_date) || 'Not yet completed'],
      ['Filed', fmt(r.submitted_at)],
      ['Service commitment', fmt(r.sla_deadline)],
    ]
    : [
      ['Service', humanize(r.request_type)],
      ['Status', humanize(r.status)],
      ['Barangay', r.barangay?.name],
      ['Quantity requested', r.requested_quantity == null ? null : String(r.requested_quantity)],
      ['Preferred schedule', fmt(r.preferred_schedule)],
      ['Scheduled for', fmt(r.scheduled_date) || 'Not yet scheduled'],
      ['Completed', fmt(r.completion_date) || 'Not yet completed'],
      ['Filed', fmt(r.submitted_at)],
      ['SLA deadline', fmt(r.sla_deadline)],
      ['SLA breached', yesNo(r.exceeded_sla)],
      // Both live columns, written by staff.request.service on approval, and
      // neither has ever appeared on this document.
      ['Approved by CENRO Head', yesNo(r.approved_by_cenro_head)],
      ['Approval date', fmt(r.approval_date)],
      ['Processed by', staffName(r.processor) || 'Unassigned'],
    ]);

  section(doc, 'Description');
  paragraph(doc, r.description || 'No description provided.');
  locationBlock(doc, r);
  if (!resident) reporterBlock(doc, r);
  notesBlock(doc, r, audience);
  historyBlock(doc, r, audience);

  // A supporting document may legitimately be a PDF here (DOC_MIME allows it),
  // which pdfkit cannot embed. attachment() states that rather than dropping it.
  await attachmentsBlock(doc, allFiles(r.document_path, r.document_paths), {
    label: 'Supporting document',
    title: 'Supporting Documents',
  });
  // Requests gained a photo field on 2026-10-12 and it printed NOWHERE until
  // now - a resident asking for a clean-up has something to show, and the crew
  // scheduling the trip needs to see it.
  await attachmentsBlock(doc, allFiles(r.photo_path, r.photo_paths), {
    label: 'Photograph',
    title: resident ? 'Your Attachments' : 'Photographs',
  });
  if (!resident) await singleAttachment(doc, r.completion_proof_path, 'Completion work proof');
  await certificateSection(doc, r);

  signatureSection(doc, 'request', r, {
    audience,
    staff: resident ? null : r.processor,
    residentName: meta.residentName || staffName(r.user) || null,
  });
  if (resident) acknowledgement(doc);
}

// One entry point so controllers stay uniform.
const WRITERS = { complaint: writeComplaintReport, wildlife: writeWildlifeReport, request: writeRequestReport };

// ASYNC, because the evidence photos are fetched from storage while the
// document is being written. Callers MUST await this before doc.end() - ending
// the document first truncates it mid-attachment and produces a corrupt file
// that still downloads with a .pdf name.
//
// Returns the page count, which is what stampPages knows and nothing else can
// cheaply recover (pdfkit subsets fonts and writes glyph ids as hex, so the
// printed footer cannot be grepped out of the output).
async function writeReport(doc, kind, record, meta = {}) {
  const write = WRITERS[kind];
  if (!write) throw new Error(`Unknown report kind: ${kind}`);
  const audience = meta.audience === 'resident' ? 'resident' : 'official';
  const reference = record[KINDS[kind].idField];

  // Registered BEFORE anything can overflow onto page 2, and after the document
  // was constructed - pdfkit creates page 1 inside the constructor, so this
  // listener is scoped to continuation pages by construction.
  withRunningHeader(doc, { title: KINDS[kind][audience], reference });

  await write(doc, record, meta);

  // LAST. stampPages leaves the cursor on whichever page it visited last, so
  // nothing may draw after it.
  return stampPages(doc, { reference, note: CLASSIFICATION[audience] });
}

function documentFor(kind, ref, audience = 'official') {
  const label = KINDS[kind][audience === 'resident' ? 'resident' : 'official'];
  return createReportDocument(`CENROWATCH ${label} ${ref}`);
}

module.exports = {
  writeReport, documentFor, KINDS, TERMINAL,
  writeComplaintReport, writeWildlifeReport, writeRequestReport,
};
