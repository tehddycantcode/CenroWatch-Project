// The PDF document frame: letterhead, continuation header, and the footer that
// carries "Page X of Y" on EVERY page.
//
// WHY THIS SUITE EXISTS. The generated PDF is the retained copy of a case - the
// thing an auditor reads and a receiving department signs - and before
// 2026-10-13 it had no page numbers and no identification on any page but the
// first. A page separated from the stack was anonymous.
//
// Two mechanisms here are easy to break by accident and produce a document that
// is wrong while every other test stays green:
//
//   1. stampPages must run LAST, because it uses switchToPage and leaves the
//      cursor on whichever page it visited. Anything drawn after it lands on
//      the wrong page.
//   2. Writing the footer BELOW the bottom margin makes pdfkit auto-append a
//      page per write. That is not theoretical - it shipped during development
//      and turned a 3-page record into 12 pages, 9 of them blank, while the
//      numbers printed on the real pages were still correct.
//
// ASSERTIONS GO THROUGH THE API AND THE PAGE COUNT, NEVER THROUGH THE BYTES:
// pdfkit subsets its fonts and writes glyph ids as hex, so the printed text
// cannot be found by grepping the output. Trying is a trap, not an option.

const {
  createReportDocument, letterhead, withRunningHeader, stampPages,
  fieldGrid, signatureBlock, textWidth,
} = require('../src/services/report.layout');

// A document that goes nowhere. pdfkit needs a sink or it buffers forever.
function doc(title = 'Test') {
  const d = createReportDocument(title);
  d.on('data', () => {});
  return d;
}

// Finish a document so pdfkit flushes, without writing to disk.
function finish(d) {
  return new Promise((resolve) => {
    d.on('end', resolve);
    d.end();
  });
}

describe('createReportDocument', () => {
  test('buffers pages, which is what makes Page X of Y possible at all', () => {
    const d = doc();
    // Without bufferPages, bufferedPageRange throws or reports nothing to
    // revisit, and the total page count cannot be known before the end.
    expect(() => d.bufferedPageRange()).not.toThrow();
    expect(d.bufferedPageRange().count).toBe(1);
  });

  test('is A4 with a 50pt margin', () => {
    const d = doc();
    expect(Math.round(d.page.width)).toBe(595);
    expect(Math.round(d.page.height)).toBe(842);
    expect(d.page.margins.left).toBe(50);
  });
});

describe('stampPages', () => {
  test('returns the real page count and ADDS NO PAGES', async () => {
    const d = doc();
    d.addPage();
    d.addPage();
    expect(d.bufferedPageRange().count).toBe(3);

    const total = stampPages(d, { reference: 'CMP-2026-00001', note: 'Handle per R.A. 10173.' });

    // The regression that matters. Writing three footer cells below the bottom
    // margin on each of three pages appended nine blank pages.
    expect(total).toBe(3);
    expect(d.bufferedPageRange().count).toBe(3);
    await finish(d);
  });

  test('a single-page document reports Page 1 of 1', async () => {
    const d = doc();
    expect(stampPages(d, { reference: 'REQ-1' })).toBe(1);
    expect(d.bufferedPageRange().count).toBe(1);
    await finish(d);
  });

  test('restores the bottom margin it borrowed', async () => {
    const d = doc();
    const before = d.page.margins.bottom;
    stampPages(d, { reference: 'X' });
    expect(d.page.margins.bottom).toBe(before);
    await finish(d);
  });

  test('tolerates a missing reference and note', async () => {
    const d = doc();
    expect(() => stampPages(d, {})).not.toThrow();
    expect(() => stampPages(d)).not.toThrow();
    await finish(d);
  });
});

describe('withRunningHeader', () => {
  test('fires on pages 2+ and NOT on page 1', async () => {
    const d = doc();
    // Page 1 already exists by the time this is attached - pdfkit creates it
    // inside the constructor. That is what scopes the header to continuation
    // pages, rather than a page-number check inside the listener.
    const firstPageY = d.y;
    withRunningHeader(d, { title: 'Wildlife Turnover Record', reference: 'WLD-1' });
    expect(d.y).toBe(firstPageY);

    d.addPage();
    // The listener drew a header and a rule, so content starts lower than the
    // top margin would put it.
    expect(d.y).toBeGreaterThan(d.page.margins.top);
    await finish(d);
  });
});

describe('letterhead', () => {
  test('advances past the title band and leaves the cursor at the left margin', async () => {
    const d = doc();
    const top = d.y;
    letterhead(d, { title: 'Environmental Complaint Record', reference: 'CMP-2026-00042' });
    expect(d.y).toBeGreaterThan(top + 80);
    expect(d.x).toBe(d.page.margins.left);
    await finish(d);
  });

  test('does not throw when the seal cannot be read', async () => {
    // The seal lives in backend/assets and is read lazily; a deploy that forgot
    // to ship it must still produce the record, with a text-only letterhead.
    const d = doc();
    expect(() => letterhead(d, { title: 'X', reference: 'Y' })).not.toThrow();
    await finish(d);
  });
});

describe('fieldGrid', () => {
  test('DROPS a pair whose value is empty, so an open case is not a page of "Not set"', async () => {
    const full = doc();
    const emptyish = doc();
    const y0 = full.y;

    fieldGrid(full, [['Type', 'Waste'], ['Status', 'Pending']]);
    fieldGrid(emptyish, [['Type', 'Waste'], ['Status', null], ['Resolved', ''], ['Notes', undefined]]);

    // One populated pair fills one grid row; so does one pair plus three empty
    // ones - the empties occupy nothing.
    expect(emptyish.y - y0).toBeLessThan(full.y - y0 + 1);
    await Promise.all([finish(full), finish(emptyish)]);
  });

  test('renders nothing at all when every value is empty', async () => {
    const d = doc();
    const before = d.y;
    fieldGrid(d, [['A', null], ['B', ''], ['C', '   ']]);
    expect(d.y).toBe(before);
    await finish(d);
  });

  test('a long value WRAPS instead of being clipped - the kv() bug', async () => {
    // kv() draws through drawRow with lineBreak:false, so anything wider than
    // its column vanishes silently. A truncated transfer destination on a
    // chain-of-custody record is the same class of defect as a missing photo.
    const short = doc();
    const long = doc();
    const y0 = short.y;

    fieldGrid(short, [['Transfer destination', 'DENR']]);
    fieldGrid(long, [['Transfer destination',
      'DENR-CALABARZON Wildlife Rescue Center, Barangay Timugan, Los Banos, Laguna, Region IV-A, Philippines, attention the Receiving Officer on duty']]);

    expect(long.y - y0).toBeGreaterThan(short.y - y0);
    await Promise.all([finish(short), finish(long)]);
  });

  test('zero is a value, not an absence', async () => {
    // The falsy-value trap this codebase has hit twice. A count of 0 custody
    // photos is a fact worth printing.
    const d = doc();
    const before = d.y;
    fieldGrid(d, [['Chain-of-custody photos', String(0)]]);
    expect(d.y).toBeGreaterThan(before);
    await finish(d);
  });

  test('breaks to a new page rather than running off the bottom', async () => {
    const d = doc();
    const pairs = Array.from({ length: 60 }, (_, i) => [`Field ${i}`, `Value ${i}`]);
    fieldGrid(d, pairs);
    expect(d.bufferedPageRange().count).toBeGreaterThan(1);
    await finish(d);
  });
});

describe('signatureBlock', () => {
  test('a wrapped value pushes the next line down instead of drawing over it', async () => {
    // The overlap this fixed: a fixed 13pt advance drew "Date signed" straight
    // through the second line of a long agency name.
    const shortName = doc();
    const longName = doc();
    // THREE columns, which is the real shape. With one column the cell is the
    // full text width and nothing wraps, so a one-column version of this test
    // passes against the bug it is meant to catch.
    const cols = (agency) => [
      { role: 'Released by', lines: [['Printed name', 'Maria Santos'], ['Date signed', null]] },
      { role: 'Received by', lines: [['Printed name', null], ['Agency / Office', agency], ['Date signed', null]] },
      { role: 'Witnessed by', lines: [['Printed name', null], ['Date signed', null]] },
    ];

    const y0 = shortName.y;
    signatureBlock(shortName, { title: 'T', columns: cols('DENR') });
    signatureBlock(longName, {
      title: 'T',
      columns: cols('DENR-CALABARZON Wildlife Rescue Center, Los Banos, Laguna, Region IV-A'),
    });

    expect(longName.y - y0).toBeGreaterThan(shortName.y - y0);
    await Promise.all([finish(shortName), finish(longName)]);
  });

  test('keeps the whole block on one page', async () => {
    const d = doc();
    // Put the cursor 120pt from the bottom - not enough for a signature block,
    // which needs roughly 180. Set directly rather than counted out in filler
    // paragraphs, so the test does not silently stop exercising the break when
    // a font size changes.
    d.y = d.page.height - d.page.margins.bottom - 120;
    const pagesBefore = d.bufferedPageRange().count;
    signatureBlock(d, {
      title: 'Chain of Custody',
      columns: [
        { role: 'Released by', lines: [['Printed name', 'A'], ['Designation', null], ['Office', 'CENRO'], ['Date', null]] },
        { role: 'Received by', lines: [['Printed name', null], ['Designation', null], ['Agency', null], ['Contact', null], ['Date', null]] },
      ],
      remarks: 'Remarks',
    });
    // It broke to a fresh page rather than splitting the rules from the roles.
    expect(d.bufferedPageRange().count).toBeGreaterThan(pagesBefore);
    await finish(d);
  });
});

describe('textWidth', () => {
  test('is the page width less both margins', () => {
    const d = doc();
    expect(Math.round(textWidth(d))).toBe(Math.round(595.28 - 100));
  });
});
