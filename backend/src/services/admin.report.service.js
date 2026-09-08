// Renders the admin analytics into a downloadable PDF (manuscript Admin
// "Generate Analytics Report" use case). Pure layout over the analytics object
// produced by admin.analytics.service — no DB access here.

const { GREEN, MUTED, humanize, heading, drawRow, kv, createReportDocument } = require('./report.layout');

function writeAnalyticsReport(doc, a, meta = {}) {
  const left = doc.page.margins.left;

  // --- Title block ---
  doc.fontSize(22).font('Helvetica-Bold').fillColor(GREEN).text('CENROWATCH', left, doc.y);
  doc.fontSize(11).font('Helvetica').fillColor(MUTED).text('CENRO Cabuyao — Environmental Monitoring System');
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#000').text('Analytics Report');
  doc.fontSize(9).font('Helvetica').fillColor(MUTED)
    .text(`Generated ${new Date(meta.generatedAt || Date.now()).toLocaleString('en-PH')}${meta.by ? ` · by ${meta.by}` : ''}`);
  doc.fillColor('#000');

  // --- Summary ---
  heading(doc, 'Summary');
  kv(doc, [
    ['Total reports', a.reports.total],
    ['  Complaints', a.reports.complaints],
    ['  Wildlife turnovers', a.reports.wildlife],
    ['  Service requests', a.reports.requests],
    ['Endangered wildlife (priority)', a.wildlife_endangered],
    ['Users (active / total)', `${a.users.active} / ${a.users.total}`],
    ['  CENRO staff', a.users.by_role.CENRO_Staff],
    ['Complaints resolved', a.resolution.complaints_resolved],
    ['Avg. complaint resolution', a.resolution.avg_resolution_hours == null ? '—' : `${a.resolution.avg_resolution_hours} h`],
  ]);

  // --- SLA compliance ---
  heading(doc, 'Citizens Charter SLA Compliance');
  const slaCols = [
    { x: left, w: 150 },
    { x: left + 150, w: 80, align: 'right' },
    { x: left + 230, w: 75, align: 'right' },
    { x: left + 305, w: 75, align: 'right' },
    { x: left + 380, w: 75, align: 'right' },
  ];
  drawRow(doc, [
    { ...slaCols[0], text: 'Module' },
    { ...slaCols[1], text: 'On-time %' },
    { ...slaCols[2], text: 'On time' },
    { ...slaCols[3], text: 'Late' },
    { ...slaCols[4], text: 'Overdue' },
  ], { bold: true, color: MUTED });
  for (const [label, s] of [['Complaints', a.sla.complaints], ['Wildlife', a.sla.wildlife], ['Requests', a.sla.requests]]) {
    drawRow(doc, [
      { ...slaCols[0], text: label },
      { ...slaCols[1], text: s.rate == null ? '—' : `${s.rate}%` },
      { ...slaCols[2], text: s.on_time },
      { ...slaCols[3], text: s.late },
      { ...slaCols[4], text: s.overdue_open },
    ]);
  }

  // --- By type ---
  const typeTable = (title, rows) => {
    heading(doc, title);
    if (!rows.length) {
      drawRow(doc, [{ text: 'No data.', x: left, w: 400, color: MUTED }]);
      return;
    }
    drawRow(doc, [
      { text: 'Type', x: left, w: 320 },
      { text: 'Count', x: left + 320, w: 135, align: 'right' },
    ], { bold: true, color: MUTED });
    for (const r of rows) {
      drawRow(doc, [
        { text: humanize(r.key), x: left, w: 320 },
        { text: r.count, x: left + 320, w: 135, align: 'right' },
      ]);
    }
  };
  typeTable('Complaints by Type', a.by_type.complaints);
  typeTable('Requests by Type', a.by_type.requests);

  // --- By barangay ---
  heading(doc, 'Reports by Barangay');
  const bcols = [
    { x: left, w: 150 },
    { x: left + 150, w: 80, align: 'right' },
    { x: left + 230, w: 75, align: 'right' },
    { x: left + 305, w: 75, align: 'right' },
    { x: left + 380, w: 75, align: 'right' },
  ];
  drawRow(doc, [
    { ...bcols[0], text: 'Barangay' },
    { ...bcols[1], text: 'Complaints' },
    { ...bcols[2], text: 'Wildlife' },
    { ...bcols[3], text: 'Requests' },
    { ...bcols[4], text: 'Total' },
  ], { bold: true, color: MUTED });
  const byBgy = [...a.by_barangay].sort((x, y) => y.total - x.total);
  for (const b of byBgy) {
    drawRow(doc, [
      { ...bcols[0], text: b.name },
      { ...bcols[1], text: b.complaints },
      { ...bcols[2], text: b.wildlife },
      { ...bcols[3], text: b.requests },
      { ...bcols[4], text: b.total, bold: true },
    ]);
  }

  // --- Trend ---
  // The window is whatever the admin selected, so the heading has to state it.
  // A fixed "Last 6 Months" would have quietly mislabelled every other range,
  // and a printed report is the copy that outlives the screen it came from.
  const tr = a.trend_range || {};
  const asDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const period = tr.from && tr.to ? `${asDate(tr.from)} to ${asDate(tr.to)}` : 'All time';
  const GRAIN = { day: 'Day', month: 'Month', year: 'Year' };

  heading(doc, `Reports — ${period}`);
  if (tr.truncated) {
    doc.fontSize(9).fillColor(MUTED)
      .text('Note: this range exceeds the export row limit, so the figures below are incomplete.', left)
      .moveDown(0.5);
  }
  drawRow(doc, [
    { text: GRAIN[tr.granularity] || 'Month', x: left, w: 150 },
    { text: 'Complaints', x: left + 150, w: 100, align: 'right' },
    { text: 'Wildlife', x: left + 250, w: 100, align: 'right' },
    { text: 'Requests', x: left + 350, w: 105, align: 'right' },
  ], { bold: true, color: MUTED });
  for (const t of a.trend) {
    drawRow(doc, [
      { text: t.month, x: left, w: 150 },
      { text: t.complaints, x: left + 150, w: 100, align: 'right' },
      { text: t.wildlife, x: left + 250, w: 100, align: 'right' },
      { text: t.requests, x: left + 350, w: 105, align: 'right' },
    ]);
  }

  doc.moveDown(1.5);
  doc.fontSize(8).font('Helvetica').fillColor(MUTED)
    .text('Generated by CENROWATCH. Public-facing figures exclude personal data (R.A. 10173).', { align: 'center' });
}

module.exports = { createReportDocument, writeAnalyticsReport };
