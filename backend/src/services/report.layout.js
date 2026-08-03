// Shared PDF layout vocabulary for generated documents (admin analytics
// report, staff single-report printout). Pure drawing helpers over pdfkit -
// no DB access, no business logic.

const PDFDocument = require('pdfkit');

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

// Create a fresh document the controller can pipe to a response.
function createReportDocument(title = 'CENROWATCH Analytics Report') {
  return new PDFDocument({ size: 'A4', margin: 50, info: { Title: title } });
}

module.exports = { GREEN, MUTED, humanize, ensureSpace, heading, drawRow, kv, paragraph, createReportDocument };
