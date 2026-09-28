// Shared PDF layout vocabulary for generated documents (admin analytics
// report, staff single-report printout). Pure drawing helpers over pdfkit -
// no DB access, no business logic.

const PDFDocument = require('pdfkit');
const { sniffMime } = require('../middlewares/upload');

const GREEN = '#0f3d1f';
const MUTED = '#66756e';
const humanize = (v) => (v == null ? '' : String(v).replace(/_/g, ' '));

function ensureSpace(doc, needed = 18) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function heading(doc, text) {
  doc.moveDown(0.6);
  ensureSpace(doc, 32);
  doc.fontSize(13).font('Helvetica-Bold').fillColor(GREEN).text(text, doc.page.margins.left, doc.y);
  doc.fillColor('#000');
  doc.moveDown(0.3);
}

// Single-line columns. Note lineBreak:false - text wider than its column is
// clipped, so never use this for free text (see paragraph).
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

// Two-column key/value list.
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
  const width = doc.page.width - left - doc.page.margins.right;
  ensureSpace(doc, 30);
  doc.fontSize(opts.size || 10).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(opts.color || '#000');
  doc.text(String(text ?? ''), left, doc.y, { width, align: 'left' });
  doc.fillColor('#000');
  doc.x = left;
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
 * @returns {string|null} null when the buffer can be embedded, otherwise a
 * sentence explaining why not, ready to print.
 */
function embedRefusal(buf) {
  if (!buf || !buf.length) return 'the file could not be read from storage';
  const mime = sniffMime(buf);
  if (!mime) return 'the file is not a recognised image';
  if (EMBEDDABLE.has(mime)) return null;
  if (mime === 'application/pdf') return 'it is a PDF document, not an image';
  return `${mime} images cannot be embedded in a PDF`;
}

// Draw one attachment, captioned. Never throws: a report whose photo is
// missing, unreadable or in an unsupported format must still print.
function attachment(doc, buf, caption) {
  const refusal = embedRefusal(buf);
  ensureSpace(doc, refusal ? 30 : 230);

  doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text(caption, doc.page.margins.left, doc.y);
  doc.moveDown(0.2);
  doc.fillColor('#000');

  if (refusal) {
    paragraph(doc, `Not shown here - ${refusal}. The original is held in the system.`, { size: 9, color: MUTED });
    doc.moveDown(0.4);
    return false;
  }

  const width = Math.min(320, doc.page.width - doc.page.margins.left - doc.page.margins.right);
  try {
    doc.image(buf, doc.page.margins.left, doc.y, { fit: [width, 220], align: 'left' });
    // `fit` scales within the box, so advancing by the box height is correct
    // whatever the source aspect ratio - measuring the drawn height would mean
    // decoding the image twice.
    doc.y += 226;
    doc.x = doc.page.margins.left;
    return true;
  } catch (err) {
    // Belt and braces: embedRefusal already screened the format, so reaching
    // here means a corrupt file that carried a valid signature.
    paragraph(doc, 'Not shown here - the image file is damaged. The original is held in the system.', {
      size: 9,
      color: MUTED,
    });
    doc.moveDown(0.4);
    return false;
  }
}

// Create a fresh document the controller can pipe to a response.
function createReportDocument(title = 'CENROWATCH Analytics Report') {
  return new PDFDocument({ size: 'A4', margin: 50, info: { Title: title } });
}

module.exports = {
  GREEN, MUTED, humanize, ensureSpace, heading, drawRow, kv, paragraph,
  createReportDocument, embedRefusal, attachment,
};
