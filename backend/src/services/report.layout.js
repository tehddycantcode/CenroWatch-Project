// Shared PDF layout vocabulary for generated documents (admin analytics
// report, staff case record, resident copy). Pure drawing helpers over pdfkit -
// no DB access, no business logic.
//
// THE DOCUMENT FRAME. Three helpers have to be used together or the page
// furniture comes out wrong:
//
//   createReportDocument()  -> bufferPages: true, so pages stay addressable
//   withRunningHeader(doc)  -> draws the continuation header on pages 2+
//   stampPages(doc, ...)    -> draws the footer, with Page X of Y, on EVERY page
//
// stampPages MUST be the last thing called before doc.end(): it uses
// switchToPage, which leaves the cursor on whatever page it visited last, so
// anything drawn afterwards lands on the wrong page. And Y in "Page X of Y" is
// only knowable once the document is finished, which is the whole reason the
// footer is stamped at the end instead of as each page is written.

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { sniffMime } = require('../middlewares/upload');

const GREEN = '#0f3d1f';
const MUTED = '#66756e';
// Field labels sit a shade lighter than body muted so a dense grid reads as
// value-first; the value is what someone scans for.
const LABEL = '#7c8a83';
const RULE = '#d2dbd6';
const INK = '#3f4b45'; // signature rules - darker than RULE, it is written on

const humanize = (v) => (v == null ? '' : String(v).replace(/_/g, ' '));

const textWidth = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;

function ensureSpace(doc, needed = 18) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

// A hairline across the text column. Drawn with save/restore so it cannot leak
// a stroke colour or line width into whatever draws next.
function hairline(doc, { color = RULE, width = 0.7 } = {}) {
  const left = doc.page.margins.left;
  const y = doc.y;
  doc.save().lineWidth(width).strokeColor(color)
    .moveTo(left, y).lineTo(left + textWidth(doc), y).stroke().restore();
  doc.x = left;
  doc.y = y + 1;
}

// ---------------------------------------------------------------------------
// Letterhead and page furniture

// Read once, lazily. A missing or unreadable file degrades to a text-only
// letterhead rather than throwing: the document is a record, and failing to
// produce it because an image is absent is the worse outcome.
//
// The file lives in backend/assets because only backend/ is deployed to
// Railway - web/public/cenro-logo.png is not readable at runtime there.
const SEAL_PATH = path.join(__dirname, '..', '..', 'assets', 'cenro-logo.png');
let sealCache; // undefined = not yet tried, null = unavailable
function seal() {
  if (sealCache !== undefined) return sealCache;
  try {
    sealCache = fs.readFileSync(SEAL_PATH);
  } catch {
    sealCache = null;
  }
  return sealCache;
}

/**
 * Official letterhead plus a title band. Page 1 only.
 *
 * The band - a filled rectangle carrying the document title and reference in
 * white - is what makes this read as one document rather than as a heading
 * followed by a list. It replaces four stacked lines of descending font size.
 */
function letterhead(doc, { title, reference }) {
  const left = doc.page.margins.left;
  const w = textWidth(doc);
  const top = doc.y;
  const img = seal();
  const tx = img ? left + 58 : left;
  const tw = w - (tx - left);

  if (img) {
    try {
      doc.image(img, left, top, { fit: [46, 46] });
    } catch {
      // A corrupt seal is not worth failing a record over.
    }
  }

  doc.fontSize(8.5).font('Helvetica').fillColor(MUTED)
    .text('Republic of the Philippines', tx, top + 1, { width: tw, lineBreak: false });
  doc.fontSize(8.5).font('Helvetica').fillColor(MUTED)
    .text('City of Cabuyao, Laguna', tx, doc.y, { width: tw, lineBreak: false });
  doc.fontSize(11).font('Helvetica-Bold').fillColor(GREEN)
    .text('CITY ENVIRONMENT AND NATURAL RESOURCES OFFICE', tx, doc.y + 1, { width: tw });
  doc.fontSize(8).font('Helvetica').fillColor(MUTED)
    .text('CENROWATCH - Environmental Monitoring System', tx, doc.y, { width: tw, lineBreak: false });

  doc.y = Math.max(doc.y + 10, top + 52);
  hairline(doc, { color: GREEN, width: 1.3 });

  const bandY = doc.y + 9;
  const bandH = 25;
  doc.save().fillColor(GREEN).rect(left, bandY, w, bandH).fill().restore();
  const refW = 150;
  doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#ffffff')
    .text(String(title).toUpperCase(), left + 10, bandY + 8, { width: w - refW - 20, lineBreak: false });
  doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#ffffff')
    .text(String(reference), left + w - refW - 10, bandY + 8, { width: refW, align: 'right', lineBreak: false });

  doc.fillColor('#000');
  doc.x = left;
  doc.y = bandY + bandH + 12;
}

/**
 * Register the continuation header for pages 2 and beyond.
 *
 * Attached AFTER the document is constructed, which is what scopes it to
 * pages 2+: pdfkit adds page 1 inside the constructor, so that pageAdded has
 * already fired by the time this listener exists. Page 1 gets the letterhead
 * instead.
 *
 * A multi-page record whose later pages carry no reference cannot be audited
 * once a page is separated from the stack.
 */
function withRunningHeader(doc, { title, reference }) {
  doc.on('pageAdded', () => {
    const left = doc.page.margins.left;
    doc.x = left;
    doc.y = doc.page.margins.top;
    doc.fontSize(7.5).font('Helvetica').fillColor(MUTED)
      .text(`${String(title).toUpperCase()} - ${reference} (continued)`, left, doc.y, {
        width: textWidth(doc),
        lineBreak: false,
      });
    doc.y += 3;
    hairline(doc);
    doc.y += 8;
    doc.x = left;
    doc.fillColor('#000');
  });
}

/**
 * Footer on every page: reference, Page X of Y, and a classification note.
 *
 * MUST be called last, immediately before doc.end(). See the module header.
 * Returns the page count, which is the only honest way for a test to assert
 * the numbering without re-parsing the PDF (pdfkit subsets its fonts and
 * writes glyph ids as hex, so the printed text cannot be grepped).
 */
function stampPages(doc, { reference, note = '' } = {}) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i += 1) {
    doc.switchToPage(range.start + i);
    const left = doc.page.margins.left;
    const w = textWidth(doc);
    const bottom = doc.page.margins.bottom;
    const y = doc.page.height - bottom + 16;
    const third = w / 3;

    // PDFKIT APPENDS A PAGE WHEN TEXT WOULD CROSS THE BOTTOM MARGIN, and the
    // footer is deliberately BELOW it. Without dropping the margin for the
    // write, stamping a 3-page document produced 12 pages - one blank per
    // footer cell - and bufferedPageRange had already been read, so the count
    // printed on them was right while the document was wrong. Restored
    // immediately after, because the margin belongs to the page object.
    doc.page.margins.bottom = 0;

    doc.save().lineWidth(0.7).strokeColor(RULE)
      .moveTo(left, y - 7).lineTo(left + w, y - 7).stroke().restore();

    doc.fontSize(7).font('Helvetica').fillColor(MUTED);
    doc.text(String(reference || ''), left, y, { width: third, lineBreak: false });
    doc.text(`Page ${i + 1} of ${total}`, left + third, y, { width: third, align: 'center', lineBreak: false });
    doc.text(String(note), left + 2 * third, y, { width: third, align: 'right', lineBreak: false });
    doc.fillColor('#000');

    doc.page.margins.bottom = bottom;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Sections and fields

/**
 * Section label: uppercase, green, over a hairline.
 *
 * Uppercase rather than small-caps because pdfkit's bundled Helvetica has no
 * small-caps variant, and faking one by scaling glyphs looks worse than not
 * doing it at all.
 */
function section(doc, title) {
  doc.moveDown(0.7);
  ensureSpace(doc, 44);
  const left = doc.page.margins.left;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(GREEN)
    .text(String(title).toUpperCase(), left, doc.y, { width: textWidth(doc), characterSpacing: 0.7 });
  doc.y += 2;
  hairline(doc);
  doc.y += 6;
  doc.x = left;
  doc.fillColor('#000');
}

// Kept so admin.report.service.js keeps working unchanged. It is the same
// thing: one name for the old vocabulary, one for the new.
const heading = (doc, text) => section(doc, text);

/**
 * Two-column field grid: label above value, both left-aligned.
 *
 * Replaces kv() for case fields, for two reasons. kv right-aligns a BOLD value
 * against its label, which is the visual grammar of a receipt rather than of a
 * government form. And kv draws through drawRow, which passes lineBreak:false,
 * so any value wider than its column is SILENTLY CLIPPED - a truncated
 * transfer destination on the retained copy of a chain-of-custody record is the
 * same class of defect as a missing evidence photo. This measures and wraps.
 *
 * A pair whose value is empty is DROPPED. Where the absence is itself the fact,
 * the caller passes explicit copy ('Not yet resolved', 'Unassigned'). Printing
 * "Not set" eleven times is what made the old report look unfinished, and it
 * is the reason this document can carry more detail and read as less cluttered.
 */
function fieldGrid(doc, pairs, { cols = 2 } = {}) {
  const items = (pairs || []).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== '',
  );
  if (!items.length) return;

  const left = doc.page.margins.left;
  const gut = 18;
  const colW = (textWidth(doc) - gut * (cols - 1)) / cols;

  for (let i = 0; i < items.length; i += cols) {
    const row = items.slice(i, i + cols);

    // Measure first: all labels in a row share a baseline, so the values line
    // up even when one label wraps and its neighbour does not.
    let labelH = 0;
    let valueH = 0;
    for (const [k, v] of row) {
      doc.fontSize(7).font('Helvetica-Bold');
      labelH = Math.max(labelH, doc.heightOfString(String(k).toUpperCase(), { width: colW }));
      doc.fontSize(9.5).font('Helvetica');
      valueH = Math.max(valueH, doc.heightOfString(String(v), { width: colW }));
    }
    const rowH = labelH + valueH + 7;
    ensureSpace(doc, rowH);
    const y = doc.y;

    row.forEach(([k, v], j) => {
      const x = left + j * (colW + gut);
      doc.fontSize(7).font('Helvetica-Bold').fillColor(LABEL)
        .text(String(k).toUpperCase(), x, y, { width: colW, characterSpacing: 0.5 });
      doc.fontSize(9.5).font('Helvetica').fillColor('#000')
        .text(String(v), x, y + labelH, { width: colW });
    });

    doc.x = left;
    doc.y = y + rowH;
    doc.fillColor('#000');
  }
}

// Single-line columns. Note lineBreak:false - text wider than its column is
// clipped, so never use this for free text (see paragraph). Still used by the
// analytics report and the status-history table, where every value is a short
// date, enum or number.
function drawRow(doc, cells, opts = {}) {
  ensureSpace(doc, 16);
  const y = doc.y;
  doc.fontSize(opts.size || 9).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(opts.color || '#000');
  for (const c of cells) {
    doc.text(String(c.text), c.x, y, { width: c.w, align: c.align || 'left', lineBreak: false });
  }
  doc.fillColor('#000');
  doc.x = doc.page.margins.left;
  doc.y = y + (opts.lh || 15);
}

// Two-column key/value list, value right-aligned and bold. KEPT for the
// analytics report, where a figure against a label is the correct shape. It
// clips a long value (see drawRow) - safe there because every analytics value
// is a short number, NOT safe for case fields. Use fieldGrid for those.
function kv(doc, pairs) {
  const left = doc.page.margins.left;
  for (const [k, v] of pairs) {
    drawRow(doc, [
      { text: k, x: left, w: 240 },
      { text: v, x: left + 240, w: 215, align: 'right', bold: true },
    ]);
  }
}

// Wrapping body text for descriptions and notes, which drawRow would clip.
function paragraph(doc, text, opts = {}) {
  const left = doc.page.margins.left;
  const width = opts.width || textWidth(doc);
  ensureSpace(doc, 30);
  doc.fontSize(opts.size || 9.5).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(opts.color || '#000');
  doc.text(String(text ?? ''), opts.x ?? left, doc.y, { width, align: opts.align || 'left' });
  doc.fillColor('#000');
  doc.x = left;
}

/**
 * Blank ruled lines to be completed by hand.
 *
 * The one place in this document where an empty field is deliberate: a remarks
 * area on a transfer record exists precisely so somebody can write in it.
 */
function ruledLines(doc, count = 3, { label } = {}) {
  const left = doc.page.margins.left;
  ensureSpace(doc, (label ? 18 : 0) + count * 19 + 6);
  if (label) {
    doc.fontSize(7).font('Helvetica-Bold').fillColor(LABEL)
      .text(String(label).toUpperCase(), left, doc.y, { width: textWidth(doc), characterSpacing: 0.5 });
    doc.y += 6;
  }
  for (let i = 0; i < count; i += 1) {
    doc.y += 17;
    hairline(doc, { color: RULE, width: 0.8 });
  }
  doc.y += 4;
  doc.x = left;
  doc.fillColor('#000');
}

/**
 * Wet-ink signature block.
 *
 * columns: [{ role, lines: [[caption, value|null], ...] }]
 *
 * A line with a value prints that value in bold above its rule. A line with no
 * value prints its caption in grey, to be filled in by hand. The CALLER
 * decides which - this helper never substitutes a name, because the one thing
 * a handover record must not do is print somebody as having released an animal
 * when the system does not actually know who did.
 *
 * The whole block is kept on one page: a signature rule orphaned from the role
 * it belongs to is worse than a short page.
 */
function signatureBlock(doc, { title, columns, remarks, note }) {
  const maxLines = Math.max(...columns.map((c) => c.lines.length));
  // Generous: a wrapped value makes a row taller than one line, and the whole
  // block has to stay on one page - a signature rule orphaned from the role it
  // belongs to is worse than a short page.
  const need = 46 + 38 + maxLines * 20 + (remarks ? 24 + 3 * 19 : 0) + 10;
  ensureSpace(doc, need);

  section(doc, title);
  if (note) {
    paragraph(doc, note, { size: 8, color: MUTED });
    doc.y += 4;
  }

  const left = doc.page.margins.left;
  const gut = 14;
  const n = columns.length;
  const colW = (textWidth(doc) - gut * (n - 1)) / n;
  const top = doc.y;

  columns.forEach((c, j) => {
    doc.fontSize(7).font('Helvetica-Bold').fillColor(GREEN)
      .text(String(c.role).toUpperCase(), left + j * (colW + gut), top, { width: colW, characterSpacing: 0.4 });
  });

  // 34pt of clearance between the role caption and its rule - enough for a
  // signature written with a pen, which is the entire point of the block.
  const lineY = top + 36;
  columns.forEach((unused, j) => {
    const x = left + j * (colW + gut);
    doc.save().lineWidth(0.9).strokeColor(INK)
      .moveTo(x, lineY).lineTo(x + colW - 10, lineY).stroke().restore();
  });

  let y = lineY + 4;
  for (let i = 0; i < maxLines; i += 1) {
    // MEASURE THE WHOLE ROW FIRST. A pre-filled value can be long enough to
    // wrap - "DENR-CALABARZON Wildlife Rescue Center, Los Banos, Laguna" takes
    // two lines in a third-page column - and advancing by a fixed line height
    // drew the next caption straight through it. Clipping instead would be the
    // same defect this document exists to avoid, so the row grows.
    let rowH = 0;
    for (const c of columns) {
      const entry = c.lines[i];
      if (!entry) continue;
      const [caption, value] = entry;
      if (value) {
        doc.fontSize(8.5).font('Helvetica-Bold');
        rowH = Math.max(rowH, doc.heightOfString(String(value), { width: colW - 10 }));
      } else {
        doc.fontSize(7).font('Helvetica');
        rowH = Math.max(rowH, doc.heightOfString(String(caption), { width: colW - 10 }));
      }
    }
    columns.forEach((c, j) => {
      const entry = c.lines[i];
      if (!entry) return;
      const [caption, value] = entry;
      const x = left + j * (colW + gut);
      if (value) {
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000')
          .text(String(value), x, y, { width: colW - 10 });
      } else {
        doc.fontSize(7).font('Helvetica').fillColor(LABEL)
          .text(String(caption), x, y, { width: colW - 10 });
      }
    });
    y += rowH + 3;
  }

  doc.x = left;
  doc.y = y + 6;
  doc.fillColor('#000');
  if (remarks) ruledLines(doc, 3, { label: remarks });
}

// ---------------------------------------------------------------------------
// Attachments
//
// pdfkit decodes JPEG and PNG and nothing else: its Image.open tests those two
// magic-byte signatures and otherwise throws "Unknown image format." The
// UPLOADER is more permissive - middlewares/upload.js also accepts webp, heic
// and heif, plus application/pdf for a service request's supporting document -
// so a perfectly valid attachment may be impossible to put in the document.
//
// That gap is why this returns a REASON rather than a boolean. The printout is
// offered as the retained copy of a report, so a photo that exists but could
// not be embedded has to be stated in the document; silently dropping it would
// produce a page that looks complete while the evidence is missing, handed to
// someone who may be about to delete the original.

// The two signatures pdfkit itself tests, deliberately duplicated rather than
// inferred from the sniffer: this must track the LIBRARY, not our upload policy.
const EMBEDDABLE = new Set(['image/jpeg', 'image/png']);

/**
 * Get a buffer pdfkit can actually draw, converting when it has to.
 *
 * JPEG and PNG pass through UNTOUCHED - the printout should be the photograph
 * as filed, not a re-encoding of it, and most uploads are already one of the
 * two. webp, heic and heif are converted to JPEG, because pdfkit cannot decode
 * them and "Not shown here" on a real photograph is a hole in a document that
 * is offered as the retained copy of a report.
 *
 * @returns {Promise<{buf: Buffer, convertedFrom?: string}|{refusal: string}>}
 */
async function prepareEmbeddable(buf) {
  if (!buf || !buf.length) return { refusal: 'the file could not be read from storage' };
  const mime = sniffMime(buf);
  if (!mime) return { refusal: 'the file is not a recognised image' };
  if (mime === 'application/pdf') return { refusal: 'it is a PDF document, not an image' };
  if (EMBEDDABLE.has(mime)) return { buf };

  try {
    // Required lazily: sharp is a native module worth ~30 MB, and the common
    // path above never needs it. require() caches, so this costs once.
    const sharp = require('sharp');
    // failOn 'none' so a slightly malformed but readable photo still prints -
    // a strict decode would reject images the resident's phone was happy with.
    const out = await sharp(buf, { failOn: 'none' }).jpeg({ quality: 85 }).toBuffer();
    return { buf: out, convertedFrom: mime };
  } catch {
    return { refusal: `the ${mime} image could not be converted for printing` };
  }
}

/**
 * Draw one attachment at an explicit position. Never throws.
 *
 * @returns {Promise<{ok: boolean, height: number}>} height consumed, so a grid
 *   can advance past the tallest cell in its row.
 */
async function drawAttachment(doc, buf, caption, { x, y, width, height = 200 } = {}) {
  const left = doc.page.margins.left;
  const cx = x ?? left;
  const cw = width ?? Math.min(320, textWidth(doc));
  const prepared = await prepareEmbeddable(buf);
  const top = y ?? doc.y;

  doc.fontSize(7.5).font('Helvetica-Bold').fillColor(MUTED)
    .text(String(caption), cx, top, { width: cw, lineBreak: false });
  let cur = top + 11;
  doc.fillColor('#000');

  const stated = (msg) => {
    doc.fontSize(8).font('Helvetica').fillColor(MUTED).text(msg, cx, cur, { width: cw });
    const end = doc.y + 4;
    doc.fillColor('#000');
    return { ok: false, height: end - top };
  };

  if (prepared.refusal) {
    return stated(`Not shown here - ${prepared.refusal}. The original is held in the system.`);
  }

  try {
    doc.image(prepared.buf, cx, cur, { fit: [cw, height], align: 'center' });
    // `fit` scales within the box, so advancing by the box height is correct
    // whatever the source aspect ratio - measuring the drawn height would mean
    // decoding the image twice.
    cur += height + 4;
    if (prepared.convertedFrom) {
      // Stated, because the printed image is then not byte-for-byte what was
      // filed. On a document used as a record, a silent re-encode is the kind
      // of thing that should not be discovered later.
      doc.fontSize(7).font('Helvetica').fillColor(MUTED)
        .text(`Converted from ${prepared.convertedFrom} for printing. The original is held in the system.`,
          cx, cur, { width: cw });
      cur = doc.y + 3;
    }
    doc.fillColor('#000');
    return { ok: true, height: cur - top };
  } catch {
    // Belt and braces: the format was screened above, so reaching here means a
    // file that carried a valid signature and corrupt contents - which is what
    // the tiny seeded placeholder photos on this database actually are.
    return stated('Not shown here - the image file is damaged. The original is held in the system.');
  }
}

/**
 * Draw one attachment in the document flow, full width, advancing the cursor.
 *
 * RETURNS A BOOLEAN, and must keep doing so: tests/reportPhotoEmbed.test.js
 * asserts `resolves.toBe(true)` / `toBe(false)` on five paths. drawAttachment
 * is the richer variant for callers that need the height back.
 */
async function attachment(doc, buf, caption) {
  const prepared = await prepareEmbeddable(buf);
  ensureSpace(doc, prepared.refusal ? 34 : 240);
  const res = await drawAttachment(doc, buf, caption, { height: 200 });
  doc.x = doc.page.margins.left;
  doc.y += res.height + 6;
  return res.ok;
}

/**
 * Attachments two across.
 *
 * attachment() spends ~210pt of vertical space per image, so a five-photo
 * complaint used to put 2.5 pages of photographs into the record. Two across
 * halves that and makes a set of evidence photos comparable side by side,
 * which is how somebody actually reads them.
 *
 * @param items [{ buf, caption }]
 */
async function photoGrid(doc, items, { cols = 2, height = 170 } = {}) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return;
  const left = doc.page.margins.left;
  const gut = 16;
  const colW = (textWidth(doc) - gut * (cols - 1)) / cols;

  for (let i = 0; i < list.length; i += cols) {
    const row = list.slice(i, i + cols);
    ensureSpace(doc, height + 46);
    const top = doc.y;
    let tallest = 0;
    for (let j = 0; j < row.length; j += 1) {
      // Sequential, not Promise.all: each draw mutates the shared document
      // cursor, and two conversions racing through sharp would interleave
      // their writes onto the page.
      const res = await drawAttachment(doc, row[j].buf, row[j].caption, {
        x: left + j * (colW + gut),
        y: top,
        width: colW,
        height,
      });
      tallest = Math.max(tallest, res.height);
    }
    doc.x = left;
    doc.y = top + tallest + 10;
  }
}

// ---------------------------------------------------------------------------

/**
 * Create a fresh document the controller can pipe to a response.
 *
 * bufferPages so stampPages can revisit every page at the end and write
 * "Page X of Y" - the total does not exist until the document is finished.
 * doc.end() flushes the buffer, so a caller that never stamps still produces a
 * valid PDF; it just has no page numbers.
 */
function createReportDocument(title = 'CENROWATCH Analytics Report') {
  return new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: title } });
}

module.exports = {
  GREEN, MUTED, LABEL, RULE, humanize, textWidth, ensureSpace, hairline,
  letterhead, withRunningHeader, stampPages,
  section, heading, fieldGrid, drawRow, kv, paragraph, ruledLines, signatureBlock,
  createReportDocument, prepareEmbeddable, attachment, drawAttachment, photoGrid,
};
