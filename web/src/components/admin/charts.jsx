import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, LineChart, Minus, Table2 } from 'lucide-react';
import { humanize } from '@/lib/reports';
import { cn } from '@/lib/utils';
import { CHART_COLORS } from './chart-colors';

// Dependency-light charts (CSS bars + inline SVG) so the admin dashboard stays
// free of a charting library and the bundle small.

// Integer value axis for counts: pick a step from {1, 2, 5} x 10^k so the
// scale has at most 4 intervals, then round the top up to a whole step.
function niceTicks(max) {
  let unit = 1;
  outer: for (let mag = 1; ; mag *= 10) {
    for (const s of [1, 2, 5]) {
      unit = s * mag;
      if (Math.ceil(max / unit) <= 4) break outer;
    }
  }
  const top = Math.max(unit, Math.ceil(max / unit) * unit);
  const ticks = [];
  for (let t = 0; t <= top; t += unit) ticks.push(t);
  return { top, ticks };
}

// Row geometry: label column (w-40) + gap-3 on the left; value (w-7) and
// share (w-9) columns + two gap-3 on the right. The gridline overlay and the
// axis row use these to align with the bar column exactly.
const PLOT_LEFT = '10.75rem';
const PLOT_RIGHT = '5.5rem';
const ROW_H = 34; // text-sm line height (20px) + py-[7px] * 2

// ── BarChart ────────────────────────────────────────────────
// Horizontal bar figure with the same anatomy as TrendChart: title/subtitle,
// stat header (total + leading item), integer value axis with recessive
// gridlines, hover tooltip that isolates the hovered bar, chart/table view
// switch, and footnotes for cut-off and zero rows. Bars are sorted by
// magnitude, square at the baseline with a 4px rounded data-end.
// data: [{ label, value }]. `format` optional label cleanup. `unit` names the
// counted thing ("complaints"); `noun` names the rows ("types", plural).
export function BarChart({
  data,
  color = CHART_COLORS.requests,
  format = humanize,
  title,
  subtitle,
  unit = 'reports',
  noun = 'types',
  maxRows = 8,
  empty = 'No data yet.',
}) {
  const [hover, setHover] = useState(null); // hovered row index
  const [view, setView] = useState('chart'); // 'chart' | 'table'
  const [entered, setEntered] = useState(false); // bars grow in from 0 on mount
  useEffect(() => { setEntered(true); }, []);

  const sorted = (data || []).toSorted((a, b) => b.value - a.value);
  const nonzero = sorted.filter((d) => d.value > 0);
  if (nonzero.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;

  const rows = nonzero.slice(0, maxRows);
  const cut = nonzero.length - rows.length;
  const zeros = sorted.length - nonzero.length;
  const total = sorted.reduce((n, d) => n + d.value, 0);
  const share = (v) => (total ? Math.round((v / total) * 100) : 0);
  const { top, ticks } = niceTicks(Math.max(...rows.map((d) => d.value)));
  const leader = rows[0];

  return (
    <div>
      {/* Figure header: title + stat cluster + view switch */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total {unit}</div>
            <div className="text-2xl font-semibold tabular-nums text-foreground">{total}</div>
            <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="truncate">Top: {format(leader.label)} · {share(leader.value)}%</span>
            </div>
          </div>
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Chart or table view">
            <ViewButton active={view === 'chart'} onClick={() => setView('chart')} label="Chart view">
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
            </ViewButton>
            <ViewButton active={view === 'table'} onClick={() => setView('table')} label="Table view">
              <Table2 className="h-4 w-4" aria-hidden="true" />
            </ViewButton>
          </div>
        </div>
      </div>

      {view === 'table' ? (
        <table className="mt-4 w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">{noun}</th>
              <th className="py-2 text-right font-medium">Count</th>
              <th className="py-2 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((d) => (
              <tr key={d.label}>
                <td className="py-2 text-foreground">{format(d.label)}</td>
                <td className="py-2 text-right tabular-nums text-foreground">{d.value}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{share(d.value)}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t">
            <tr>
              <td className="py-2 font-medium text-foreground">Total</td>
              <td className="py-2 text-right font-medium tabular-nums text-foreground">{total}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">100%</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <>
          <div className="relative mt-4" onMouseLeave={() => setHover(null)}>
            {/* Recessive grid behind the bars; x=0 baseline slightly stronger */}
            <div className="pointer-events-none absolute inset-y-0" style={{ left: PLOT_LEFT, right: PLOT_RIGHT }} aria-hidden="true">
              {ticks.map((t) => (
                <div
                  key={t}
                  className={cn('absolute inset-y-0 w-px', t === 0 ? 'bg-border' : 'bg-border/60')}
                  style={{ left: `${(t / top) * 100}%` }}
                />
              ))}
            </div>

            {rows.map((d, i) => (
              <div
                key={d.label}
                onMouseEnter={() => setHover(i)}
                className={cn(
                  '-mx-2 flex items-center gap-3 rounded-md px-2 py-[7px] transition-colors',
                  hover === i && 'bg-accent/30'
                )}
              >
                <div className="w-40 shrink-0 truncate text-sm text-foreground">{format(d.label)}</div>
                <div className="h-4 flex-1 py-[3px]">
                  <div
                    className="h-full rounded-r-[4px] motion-safe:transition-[width,opacity] motion-safe:[transition-duration:500ms,150ms]"
                    style={{
                      width: entered ? `${Math.max((d.value / top) * 100, 2.5)}%` : 0,
                      backgroundColor: color,
                      opacity: hover == null ? 0.9 : hover === i ? 1 : 0.35,
                      // Width grows in staggered on mount; hover dims stay instant.
                      transitionDelay: `${i * 40}ms, 0ms`,
                    }}
                  />
                </div>
                <div className="w-7 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">{d.value}</div>
                <div className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{share(d.value)}%</div>
              </div>
            ))}

            {/* Tooltip above the hovered row: full label rescues truncation */}
            {hover != null && rows[hover] && (
              <div
                className="pointer-events-none absolute z-10 min-w-36 -translate-y-full rounded-lg border bg-popover px-3 py-2 shadow-soft"
                style={{ top: hover * ROW_H - 4, left: PLOT_LEFT }}
              >
                <div className="text-xs font-medium text-foreground">{format(rows[hover].label)}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="font-medium tabular-nums text-foreground">{rows[hover].value}</span>
                  <span className="tabular-nums">· {share(rows[hover].value)}% of total</span>
                </div>
              </div>
            )}
          </div>

          {/* Value axis under the bar column */}
          <div className="relative mt-1 h-4" style={{ marginLeft: PLOT_LEFT, marginRight: PLOT_RIGHT }} aria-hidden="true">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ left: `${(t / top) * 100}%` }}
              >
                {t}
              </span>
            ))}
          </div>

          {(cut > 0 || zeros > 0) && (
            <p className="mt-2 text-xs text-muted-foreground">
              {cut > 0 && `Showing the top ${rows.length} of ${nonzero.length} ${noun}. `}
              {zeros > 0 && `No reports yet from ${zeros} of ${sorted.length} ${noun}.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

const SERIES = [
  { key: 'complaints', label: 'Complaints', stroke: CHART_COLORS.complaints },
  { key: 'wildlife', label: 'Wildlife', stroke: CHART_COLORS.wildlife },
  { key: 'requests', label: 'Requests', stroke: CHART_COLORS.requests },
];

// Monotone cubic interpolation (Fritsch-Carlson, like d3 curveMonotoneX):
// smooth curves that never overshoot the data, so a run of zero months stays
// flat on the baseline instead of dipping below it.
function monotonePath(pts) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    m.push((pts[i + 1].y - pts[i].y) / dx[i]);
  }
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C ${pts[i].x + h} ${pts[i].y + t[i] * h}, ${pts[i + 1].x - h} ${pts[i + 1].y - t[i + 1] * h}, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}

// Bucket keys arrive as "YYYY", "YYYY-MM" or "YYYY-MM-DD" depending on the range
// the admin picked. The SHAPE of the key is the granularity, so the labels work
// it out themselves rather than needing a second prop threaded through.
const keyParts = (k) => String(k).split('-');

const monthDate = (k) => {
  const [yr, mo, day] = keyParts(k);
  return new Date(Number(yr), mo ? Number(mo) - 1 : 0, day ? Number(day) : 1);
};

// Axis label: terse, because these sit 11px apart at the foot of the chart.
const shortMonth = (k) => {
  const n = keyParts(k).length;
  const d = monthDate(k);
  if (n === 1) return String(d.getFullYear());
  if (n === 2) return d.toLocaleString('en', { month: 'short' });
  return d.toLocaleString('en', { month: 'short', day: 'numeric' });
};

// Full label for the tooltip and the table view, where there is room. Without
// the day part a daily range would print "March 2026" on all 31 rows.
const longLabel = (k) => {
  const n = keyParts(k).length;
  const d = monthDate(k);
  if (n === 1) return String(d.getFullYear());
  if (n === 2) return d.toLocaleString('en', { month: 'long', year: 'numeric' });
  return d.toLocaleString('en', { dateStyle: 'medium' });
};
const monthTotal = (d) => d.complaints + d.wildlife + d.requests;

// ── TrendChart ──────────────────────────────────────────────
// Multi-series area/line chart for the 6-month trend, with the full figure
// anatomy: stat header (this month + delta vs previous), legend that toggles
// series isolation, chart/table view switch, crosshair + tooltip on hover.
// data: [{ month, complaints, wildlife, requests }].
export function TrendChart({ data, title, subtitle }) {
  const [hover, setHover] = useState(null); // hovered month index
  const [focus, setFocus] = useState(null); // isolated series key
  const [view, setView] = useState('chart'); // 'chart' | 'table'

  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>;

  const W = 560, H = 190, padL = 34, padR = 16, padT = 10, padB = 22;
  const max = Math.max(1, ...data.flatMap((d) => [d.complaints, d.wildlife, d.requests]));
  const stepX = (W - padL - padR) / Math.max(1, data.length - 1);
  const x = (i) => padL + i * stepX;
  const y = (v) => H - padB - (v / max) * (H - padB - padT);
  const baseline = H - padB;
  const last = data.length - 1;

  const pts = (key) => data.map((d, i) => ({ x: x(i), y: y(d[key]) }));
  const areaPath = (key) => `${monotonePath(pts(key))} L ${x(last)} ${baseline} L ${x(0)} ${baseline} Z`;

  const ticks = [...new Set([0, Math.round(max / 2), max])];
  // At most ~8 x-axis labels regardless of bucket count (see the axis below).
  const labelStride = Math.max(1, Math.ceil(data.length / 8));
  const thisMonth = monthTotal(data[last]);
  const delta = data.length > 1 ? thisMonth - monthTotal(data[last - 1]) : 0;
  const DeltaIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.min(last, Math.max(0, Math.round((px - padL) / stepX))));
  }

  return (
    <div>
      {/* Figure header: title + stat cluster + view switch */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{shortMonth(data[last].month)} reports</div>
            <div className="flex items-center justify-end gap-2">
              <span className="text-2xl font-semibold text-foreground">{thisMonth}</span>
              <span
                className="inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground"
                title={data.length > 1 ? `vs ${shortMonth(data[last - 1].month)}` : ''}
              >
                <DeltaIcon className="h-3 w-3" aria-hidden="true" />
                {Math.abs(delta)}
              </span>
            </div>
          </div>
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Chart or table view">
            <ViewButton active={view === 'chart'} onClick={() => setView('chart')} label="Chart view">
              <LineChart className="h-4 w-4" aria-hidden="true" />
            </ViewButton>
            <ViewButton active={view === 'table'} onClick={() => setView('table')} label="Table view">
              <Table2 className="h-4 w-4" aria-hidden="true" />
            </ViewButton>
          </div>
        </div>
      </div>

      {view === 'table' ? (
        <table className="mt-4 w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Month</th>
              {SERIES.map((s) => (
                <th key={s.key} className="py-2 text-right font-medium">{s.label}</th>
              ))}
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((d) => (
              <tr key={d.month}>
                <td className="py-2 text-foreground">{longLabel(d.month)}</td>
                {SERIES.map((s) => (
                  <td key={s.key} className="py-2 text-right tabular-nums text-foreground">{d[s.key]}</td>
                ))}
                <td className="py-2 text-right font-medium tabular-nums text-foreground">{monthTotal(d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          {/* Legend: click a series to isolate it */}
          <div className="mt-3 flex flex-wrap justify-end gap-1">
            {SERIES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setFocus(focus === s.key ? null : s.key)}
                aria-pressed={focus === s.key}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors',
                  focus === s.key ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50',
                  focus && focus !== s.key && 'opacity-50'
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.stroke }} />
                {s.label}
              </button>
            ))}
          </div>

          <div className="relative mt-1">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              role="img"
              aria-label="6-month report trend"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`trend-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.stroke} stopOpacity="0.16" />
                    <stop offset="100%" stopColor={s.stroke} stopOpacity="0.02" />
                  </linearGradient>
                ))}
              </defs>

              {/* Recessive grid: solid hairlines + y scale */}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="currentColor" className={t === 0 ? 'text-border' : 'text-border/60'} strokeWidth="1" />
                  <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground tabular-nums" fontSize="10">
                    {t}
                  </text>
                </g>
              ))}

              {/* Hover crosshair */}
              {hover != null && (
                <line x1={x(hover)} y1={padT} x2={x(hover)} y2={baseline} stroke="currentColor" className="text-muted-foreground/40" strokeWidth="1" />
              )}

              {SERIES.map((s) => (
                <g key={s.key} className="motion-safe:transition-opacity" opacity={focus && focus !== s.key ? 0.12 : 1}>
                  <path d={areaPath(s.key)} fill={`url(#trend-fill-${s.key})`} />
                  <path d={monotonePath(pts(s.key))} fill="none" stroke={s.stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {/* Emphasized endpoint only; 2px surface ring keeps overlaps separable */}
                  <circle cx={x(last)} cy={y(data[last][s.key])} r="4" fill={s.stroke} stroke="white" strokeWidth="2" />
                  {hover != null && hover !== last && (
                    <circle cx={x(hover)} cy={y(data[hover][s.key])} r="4" fill={s.stroke} stroke="white" strokeWidth="2" />
                  )}
                </g>
              ))}

              {/* A daily range can be 90+ points in a 560-unit viewBox, so labels
                  are thinned to at most ~8. The final bucket is always labelled -
                  it is the one a reader looks for first - as is whichever point
                  is hovered, so the crosshair never points at an unnamed tick. */}
              {data.map((d, i) =>
                i % labelStride === 0 || i === last || i === hover ? (
                  <text key={i} x={x(i)} y={H - 5} textAnchor="middle" className={i === hover ? 'fill-foreground' : 'fill-muted-foreground'} fontSize="11">
                    {shortMonth(d.month)}
                  </text>
                ) : null
              )}
            </svg>

            {/* Tooltip for the hovered month */}
            {hover != null && (
              <div
                className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-lg border bg-popover px-3 py-2 shadow-soft"
                style={
                  hover > last / 2
                    ? { right: `${100 - (x(hover) / W) * 100}%`, marginRight: 10 }
                    : { left: `${(x(hover) / W) * 100}%`, marginLeft: 10 }
                }
              >
                <div className="text-xs font-medium text-foreground">
                  {longLabel(data[hover].month)}
                </div>
                <div className="mt-1 space-y-0.5">
                  {SERIES.map((s) => (
                    <div key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.stroke }} />
                      {s.label}
                      <span className="ml-auto pl-3 font-medium tabular-nums text-foreground">{data[hover][s.key]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ViewButton({ active, onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 w-9 items-center justify-center rounded-md transition-colors',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
