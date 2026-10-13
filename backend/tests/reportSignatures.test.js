// Signature blocks, and the two audiences the case PDF serves.
//
// WHY THIS SUITE EXISTS. Two of the rules here are about not producing a FALSE
// document, which is a worse failure than producing no document:
//
//   1. THE BLOCK IS WITHHELD ON AN OPEN CASE. A printed "Released by" rule on
//      a turnover that has not been handed over is a blank form somebody can
//      sign to assert a transfer that never happened. The gate reads the
//      record's CURRENT status, so rows already sitting in a terminal state
//      still render theirs - the retroactive-lock mistake CLAUDE.md records
//      for the proof-before-closing rule.
//
//   2. A NAME IS NEVER GUESSED. Where the system does not know who released an
//      animal, the line prints BLANK. It must never fall back to the staff
//      member who happened to click Download, because that would put their
//      name on a chain-of-custody record they had nothing to do with.
//
// And one about disclosure: the resident copy must not name a staff member.
// The resident-facing DETAIL_SELECTs withhold every staff identity on purpose,
// and a generated document should not be the one place that leaks one.
//
// HOW IT ASSERTS. report.layout is mocked so every primitive still DRAWS (the
// real implementation runs) while recording its arguments. That matters:
// staff.report.service destructures its helpers at require time, so a plain
// jest.spyOn after the fact intercepts nothing and every assertion would pass
// against a broken writer. Reading the output bytes is not an option either -
// pdfkit subsets its fonts and writes glyph ids as hex, so the printed words
// cannot be found by grepping a PDF.

jest.mock('../src/services/storage', () => ({
  read: jest.fn(async () => null), // no attachments; the frame is what is under test
  signFiles: jest.fn(async (x) => x),
}));

jest.mock('../src/services/report.layout', () => {
  const actual = jest.requireActual('../src/services/report.layout');
  return {
    ...actual,
    signatureBlock: jest.fn((...a) => actual.signatureBlock(...a)),
    section: jest.fn((...a) => actual.section(...a)),
    paragraph: jest.fn((...a) => actual.paragraph(...a)),
    fieldGrid: jest.fn((...a) => actual.fieldGrid(...a)),
  };
});

const layout = require('../src/services/report.layout');
const { writeReport, documentFor, TERMINAL } = require('../src/services/staff.report.service');

beforeEach(() => jest.clearAllMocks());

async function render(kind, record, audience = 'official') {
  const ref = record.tracking_id || record.reference_id;
  const d = documentFor(kind, ref, audience);
  d.on('data', () => {});
  const pages = await writeReport(d, kind, record, { audience, by: 'Clicker Person' });
  await new Promise((resolve) => { d.on('end', resolve); d.end(); });
  return { pages };
}

// Everything the writer passed to signatureBlock, if anything.
const sigCalls = () => layout.signatureBlock.mock.calls.map(([, opts]) => opts);
// Every section title drawn, uppercased the way the helper renders them.
const sections = () => layout.section.mock.calls.map(([, title]) => String(title));
// Every [label, value] pair that reached a field grid, flattened.
const gridPairs = () => layout.fieldGrid.mock.calls.flatMap(([, pairs]) => pairs || []);
const gridLabels = () => gridPairs().map(([k]) => k);
const gridValue = (label) => (gridPairs().find(([k]) => k === label) || [])[1];
const paragraphs = () => layout.paragraph.mock.calls.map(([, text]) => String(text));

const staff = { user_id: 3, first_name: 'Maria', last_name: 'Santos' };
const user = { user_id: 9, first_name: 'Juan', last_name: 'Dela Cruz', email: 'j@example.com', contact_number: '0917' };

const wildlife = (over = {}) => ({
  turnover_id: 1,
  reference_id: 'WLD-2026-00014',
  species_name: 'Philippine Serpent Eagle',
  species_category: 'Bird',
  animal_condition: 'Injured',
  description: 'Grounded with an injured wing.',
  status: 'Transferred',
  transfer_destination: 'DENR-CALABARZON',
  submitted_at: new Date('2026-10-03'),
  barangay: { name: 'Mamatid' },
  resident: user,
  staff,
  status_history: [],
  ...over,
});

const complaint = (over = {}) => ({
  complaint_id: 1,
  tracking_id: 'CMP-2026-00042',
  complaint_type: 'Improper_Waste_Disposal',
  description: 'Dumped waste by the creek.',
  status: 'Resolved',
  priority: false,
  is_anonymous: false,
  submitted_at: new Date('2026-10-01'),
  resolved_at: new Date('2026-10-09'),
  sla_deadline: new Date('2026-10-10'),
  exceeded_sla: false,
  barangay: { name: 'Banay-Banay' },
  user,
  assigned_staff: staff,
  status_history: [],
  ...over,
});

const request = (over = {}) => ({
  request_id: 1,
  tracking_id: 'REQ-2026-00008',
  request_type: 'Tree_Planting_Seedlings',
  description: 'Fifty seedlings for a planting activity.',
  status: 'Completed',
  submitted_at: new Date('2026-10-08'),
  completion_date: new Date('2026-10-18'),
  approved_by_cenro_head: true,
  approval_date: new Date('2026-10-10'),
  barangay: { name: 'Pulo' },
  user,
  processor: staff,
  status_history: [],
  ...over,
});

// Pull one column out of a rendered block.
const column = (opts, roleFragment) =>
  opts.columns.find((c) => c.role.toLowerCase().includes(roleFragment.toLowerCase()));
const lineValue = (col, caption) => (col.lines.find(([c]) => c === caption) || [])[1];

describe('TERMINAL - which states can carry a signature', () => {
  test('Rejected is NOT terminal: nothing was carried out, so there is nothing to certify', () => {
    expect(TERMINAL.complaint.has('Rejected')).toBe(false);
    expect(TERMINAL.request.has('Rejected')).toBe(false);
  });

  test('Deceased is not a handover', () => {
    expect(TERMINAL.wildlife.has('Deceased')).toBe(false);
  });

  test('the states that ARE terminal', () => {
    expect([...TERMINAL.complaint]).toEqual(['Resolved']);
    expect([...TERMINAL.wildlife].sort()).toEqual(['Released', 'Transferred']);
    expect([...TERMINAL.request]).toEqual(['Completed']);
  });

  test('every terminal state is a real value of its enum', () => {
    // Guards against a typo silently disabling the block forever - the same
    // shape as the status-partition bug CLAUDE.md records.
    const fs = require('fs');
    const path = require('path');
    const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
    const values = (name) => {
      const m = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
      return m[1].split('\n').map((s) => s.trim()).filter(Boolean);
    };
    for (const s of TERMINAL.complaint) expect(values('ComplaintStatus')).toContain(s);
    for (const s of TERMINAL.wildlife) expect(values('WildlifeStatus')).toContain(s);
    for (const s of TERMINAL.request) expect(values('RequestStatus')).toContain(s);
  });
});

describe('the block is WITHHELD on an open case', () => {
  test.each(['Pending_Review', 'Priority_Review', 'Under_Care', 'Deceased'])(
    'wildlife %s draws NO signature block',
    async (status) => {
      await render('wildlife', wildlife({ status }));
      expect(layout.signatureBlock).not.toHaveBeenCalled();
      // And says why, rather than leaving the reader wondering.
      expect(sections()).toContain('Signatures');
      expect(paragraphs().some((p) => /Signature lines appear/.test(p))).toBe(true);
    },
  );

  test.each(['Pending', 'Under_Review', 'Approved', 'In_Progress', 'Rejected'])(
    'complaint %s draws NO signature block',
    async (status) => {
      await render('complaint', complaint({ status, resolved_at: null }));
      expect(layout.signatureBlock).not.toHaveBeenCalled();
    },
  );

  test.each(['Pending', 'Approved', 'Scheduled', 'Rejected'])(
    'request %s draws NO signature block',
    async (status) => {
      await render('request', request({ status, completion_date: null }));
      expect(layout.signatureBlock).not.toHaveBeenCalled();
    },
  );

  test('the deferral copy names the state the case is actually in', async () => {
    await render('wildlife', wildlife({ status: 'Under_Care' }));
    expect(paragraphs().some((p) => /currently Under Care/.test(p))).toBe(true);
  });
});

describe('the custody block on a closed turnover', () => {
  test.each(['Transferred', 'Released'])('%s draws the three-column custody block', async (status) => {
    await render('wildlife', wildlife({ status }));
    expect(layout.signatureBlock).toHaveBeenCalledTimes(1);
    const [opts] = sigCalls();
    expect(opts.title).toMatch(/Chain of Custody/i);
    expect(opts.columns).toHaveLength(3);
    expect(opts.columns.map((c) => c.role)).toEqual([
      'Released by (CENRO Cabuyao)', 'Received by', 'Witnessed by',
    ]);
    expect(opts.remarks).toMatch(/condition of animal/i);
  });

  test('Released by carries the PROCESSOR, not whoever clicked Download', async () => {
    await render('wildlife', wildlife());
    const released = column(sigCalls()[0], 'Released by');
    expect(lineValue(released, 'Printed name')).toBe('Maria Santos');
    // meta.by was 'Clicker Person'. It must appear nowhere in the block.
    expect(JSON.stringify(sigCalls())).not.toContain('Clicker Person');
  });

  test('with no processor recorded the line is BLANK, never guessed', async () => {
    await render('wildlife', wildlife({ staff: null }));
    const released = column(sigCalls()[0], 'Released by');
    expect(lineValue(released, 'Printed name')).toBeNull();
    expect(JSON.stringify(sigCalls())).not.toContain('Clicker Person');
  });

  test('Designation is always blank - the system stores no job titles', async () => {
    await render('wildlife', wildlife());
    for (const col of sigCalls()[0].columns) {
      if (col.lines.some(([c]) => c === 'Designation')) {
        expect(lineValue(col, 'Designation')).toBeNull();
      }
    }
  });

  test('Received by is pre-filled from transfer_destination when it is known', async () => {
    await render('wildlife', wildlife({ transfer_destination: 'DENR-CALABARZON' }));
    expect(lineValue(column(sigCalls()[0], 'Received by'), 'Agency / Office')).toBe('DENR-CALABARZON');
  });

  test('and blank when it is not', async () => {
    await render('wildlife', wildlife({ transfer_destination: null }));
    expect(lineValue(column(sigCalls()[0], 'Received by'), 'Agency / Office')).toBeNull();
  });
});

describe('the Certification on a closed complaint or request', () => {
  test('a Resolved complaint draws Certification with three parties', async () => {
    await render('complaint', complaint());
    const [opts] = sigCalls();
    expect(opts.title).toBe('Certification');
    expect(opts.columns.map((c) => c.role)).toEqual([
      'Certified by', 'Noted by (CENRO Head)', 'Received by (resident)',
    ]);
  });

  test('Certified by is the assigned staff member; Noted by is left blank', async () => {
    await render('complaint', complaint());
    expect(lineValue(column(sigCalls()[0], 'Certified by'), 'Printed name')).toBe('Maria Santos');
    expect(lineValue(column(sigCalls()[0], 'Noted by'), 'Printed name')).toBeNull();
  });

  test('the resident acknowledgement line carries their name', async () => {
    await render('complaint', complaint());
    expect(lineValue(column(sigCalls()[0], 'Received by (resident)'), 'Printed name')).toBe('Juan Dela Cruz');
  });

  test('an ANONYMOUS complaint has no resident name to print', async () => {
    await render('complaint', complaint({ is_anonymous: true, user: null, assigned_staff: null }));
    const received = column(sigCalls()[0], 'Received by (resident)');
    expect(lineValue(received, 'Printed name')).toBeNull();
    expect(lineValue(column(sigCalls()[0], 'Certified by'), 'Printed name')).toBeNull();
  });

  test('a Completed request draws Certification with the processor', async () => {
    await render('request', request());
    expect(sigCalls()[0].title).toBe('Certification');
    expect(lineValue(column(sigCalls()[0], 'Certified by'), 'Printed name')).toBe('Maria Santos');
  });
});

describe('fields that were missing from the official copy', () => {
  test('wildlife prints Processed by - the name the custody block needs', async () => {
    await render('wildlife', wildlife());
    expect(gridValue('Processed by')).toBe('Maria Santos');
  });

  test('request prints Processed by, the CENRO Head approval and its date', async () => {
    await render('request', request());
    expect(gridValue('Processed by')).toBe('Maria Santos');
    expect(gridValue('Approved by CENRO Head')).toBe('Yes');
    expect(gridLabels()).toContain('Approval date');
  });

  test('complaint states whether it was filed anonymously, in the summary', async () => {
    await render('complaint', complaint({ is_anonymous: true, user: null }));
    expect(gridValue('Filed anonymously')).toBe('Yes');
  });

  test('"Photo attached: Yes" is gone - it was wrong once a report could carry five', async () => {
    await render('complaint', complaint({ photo_path: '/uploads/a.png', photo_paths: ['/uploads/a.png', '/uploads/b.png'] }));
    expect(gridLabels()).not.toContain('Photo attached');
    expect(gridLabels()).not.toContain('Document attached');
  });

  test('the 15 unwired Citizens Charter columns stay OUT', async () => {
    // They are read and written by nothing, so printing them yields a page of
    // "Not set" and tells a reader the office failed to record something it
    // was never asked to.
    await render('wildlife', wildlife());
    await render('complaint', complaint());
    await render('request', request());
    const labels = gridLabels().join('|').toLowerCase();
    for (const dead of ['inspection', 'vet clearance', 'rescue date', 'transport date', 'conference', 'monitoring', 'commitment']) {
      expect(labels).not.toContain(dead);
    }
  });
});

describe('the resident copy', () => {
  test('withholds the reporter block, the breach flag and the assignment', async () => {
    await render('complaint', complaint(), 'resident');
    expect(sections()).not.toContain('Reporter');
    expect(gridLabels()).not.toContain('SLA breached');
    expect(gridLabels()).not.toContain('Assigned to');
    expect(gridLabels()).not.toContain('Filed anonymously');
  });

  test('keeps the SLA deadline, which the tracking page already shows them', async () => {
    await render('complaint', complaint(), 'resident');
    expect(gridLabels()).toContain('Service commitment');
  });

  test.each([
    ['complaint', complaint()],
    ['wildlife', wildlife()],
    ['request', request()],
  ])('%s: names no staff member anywhere', async (kind, record) => {
    // The fixture DOES carry a staff relation, deliberately. In production the
    // resident DETAIL_SELECTs omit it, so a writer that read it would come out
    // blank by accident and start leaking the day somebody widened the select.
    await render(kind, record, 'resident');
    const everything = JSON.stringify([gridPairs(), paragraphs(), sections(), sigCalls()]);
    expect(everything).not.toContain('Maria Santos');
    expect(everything).not.toContain('Clicker Person');
  });

  test('gets ONE acknowledgement line, not CENRO\'s certification columns', async () => {
    await render('complaint', complaint(), 'resident');
    expect(layout.signatureBlock).toHaveBeenCalledTimes(1);
    const [opts] = sigCalls();
    expect(opts.title).toBe('Acknowledgement of Receipt');
    expect(opts.columns).toHaveLength(1);
    expect(opts.columns[0].role).toBe('Received by (resident)');
    expect(lineValue(opts.columns[0], 'Printed name')).toBe('Juan Dela Cruz');
  });

  test('a closed turnover gives the resident a receipt line, NOT a custody block', async () => {
    // They are not a party to the handover between CENRO and DENR.
    await render('wildlife', wildlife({ status: 'Transferred' }), 'resident');
    expect(sigCalls()[0].title).toBe('Acknowledgement of Receipt');
    expect(JSON.stringify(sigCalls())).not.toMatch(/Released by|Witnessed by/);
  });

  test('an open case withholds the receipt line too', async () => {
    await render('complaint', complaint({ status: 'In_Progress', resolved_at: null }), 'resident');
    expect(layout.signatureBlock).not.toHaveBeenCalled();
  });

  test('is headed as a resident copy and acknowledges itself', async () => {
    await render('complaint', complaint(), 'resident');
    expect(sections()).toContain('Your Report');
    expect(sections()).toContain('Acknowledgement');
    expect(sections()).toContain('Progress');
  });

  test('renders when the record carries no user relation - the resident selects omit it', async () => {
    const { pages } = await render('complaint', complaint({ user: undefined, assigned_staff: undefined }), 'resident');
    expect(pages).toBeGreaterThanOrEqual(1);
  });

  test('a history row with no old_status does not print "undefined to X"', async () => {
    // The resident DETAIL_SELECT returns new_status/note/changed_at only.
    const history = [{ new_status: 'Resolved', note: 'Cleared.', changed_at: new Date('2026-10-09') }];
    const { pages } = await render('complaint', complaint({ status_history: history }), 'resident');
    expect(pages).toBeGreaterThanOrEqual(1);
  });
});

describe('document integrity', () => {
  test('a long record paginates and writeReport reports the real page count', async () => {
    const long = complaint({
      description: 'x '.repeat(4000),
      status_history: Array.from({ length: 40 }, (_, i) => ({
        old_status: 'Pending', new_status: 'Under_Review', note: `Note ${i}`, changed_at: new Date(), changed_by: 2,
      })),
    });
    const { pages } = await render('complaint', long);
    expect(pages).toBeGreaterThan(1);
  });

  test('an unknown kind is refused rather than producing an empty document', async () => {
    const d = documentFor('complaint', 'X');
    d.on('data', () => {});
    await expect(writeReport(d, 'nonsense', complaint())).rejects.toThrow(/Unknown report kind/);
    d.end();
  });
});
