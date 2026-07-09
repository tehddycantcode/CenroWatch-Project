import { useState } from 'react';
import { ArrowDown, ArrowUp, LineChart, Minus, Table2 } from 'lucide-react';
import { humanize } from '@/lib/reports';
import { cn } from '@/lib/utils';

// Dependency-light charts (CSS bars + inline SVG) so the admin dashboard stays
// free of a charting library and the bundle small.
//
// Chart colors follow the app's kind-identity language (IconChip/KIND_UI):
// complaints = amber, wildlife = violet, requests = brand green. Palette
// validated for lightness, chroma, CVD separation, and contrast on the white
// card surface (dataviz six-checks). Red stays reserved for status (SLA).
export const CHART_COLORS = {
  complaints: '#d97706', // amber-600
  wildlife: '#7c3aed', // violet-600
  requests: '#22a050', // brand primary
};

// ── BarChart ────────────────────────────────────────────────
// Horizontal bar list: value + share of total per row, bars sorted by
// magnitude, square at the baseline with a 4px rounded data-end.
// data: [{ label, value }]. `format` optional label cleanup.
export function BarChart({ data, color = CHART_COLORS.requests, format = humanize, empty = 'No data yet.' }) {
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((d) => d.value), 1);
  const total = sorted.reduce((n, d) => n + d.value, 0);

  return (
    <div>
      {sorted.map((d) => {
        const share = total ? Math.round((d.value / total) * 100) : 0;
        return (
          <div
            key={d.label}
            className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-[7px] transition-colors hover:bg-accent/30"
            title={`${format(d.label)}: ${d.value} (${share}% of total)`}
          >
            <div className="w-40 shrink-0 truncate text-sm text-foreground">{format(d.label)}</div>
            {/* Bars share one hairline baseline; no track, air does the separating. */}
            <div className="h-4 flex-1 border-l border-border py-[3px]">
              <div
                className="h-full rounded-r-[4px] opacity-90 group-hover:opacity-100 motion-safe:transition-[width] motion-safe:duration-500"
                style={{ width: d.value > 0 ? `${Math.max((d.value / max) * 100, 2.5)}%` : 0, backgroundColor: color }}
              />
            </div>
            <div className="w-7 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">{d.value}</div>
            <div className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{share}%</div>
          </div>
        );
      })}
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

const monthDate = (m) => {
  const [yr, mo] = m.split('-');
  return new Date(yr, mo - 1, 1);
};
const shortMonth = (m) => monthDate(m).toLocaleString('en', { month: 'short' });

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
  const monthTotal = (d) => d.complaints + d.wildlife + d.requests;
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
                <td className="py-2 text-foreground">{monthDate(d.month).toLocaleString('en', { month: 'long', year: 'numeric' })}</td>
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

              {data.map((d, i) => (
                <text key={i} x={x(i)} y={H - 5} textAnchor="middle" className={i === hover ? 'fill-foreground' : 'fill-muted-foreground'} fontSize="11">
                  {shortMonth(d.month)}
                </text>
              ))}
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
                  {monthDate(data[hover].month).toLocaleString('en', { month: 'long', year: 'numeric' })}
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
