import { useState } from 'react';
import { humanize } from '@/lib/reports';

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

// Horizontal bar list. data: [{ label, value }]. `format` optional label cleanup.
export function BarChart({ data, color = CHART_COLORS.requests, format = humanize, empty = 'No data yet.' }) {
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label} className="group flex items-center gap-3" title={`${format(d.label)}: ${d.value}`}>
          <div className="w-40 shrink-0 truncate text-sm text-foreground">{format(d.label)}</div>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full opacity-90 group-hover:opacity-100 motion-safe:transition-[width] motion-safe:duration-500"
              style={{ width: d.value > 0 ? `${Math.max((d.value / max) * 100, 3)}%` : 0, backgroundColor: color }}
            />
          </div>
          <div className="w-8 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

const SERIES = [
  { key: 'complaints', label: 'Complaints', stroke: CHART_COLORS.complaints },
  { key: 'wildlife', label: 'Wildlife', stroke: CHART_COLORS.wildlife },
  { key: 'requests', label: 'Requests', stroke: CHART_COLORS.requests },
];

// Multi-series line chart for the 6-month trend. data: [{ month, complaints, wildlife, requests }].
export function TrendChart({ data }) {
  const [hover, setHover] = useState(null); // hovered month index

  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>;

  const W = 560, H = 200, padL = 34, padR = 16, padT = 12, padB = 24;
  const max = Math.max(1, ...data.flatMap((d) => [d.complaints, d.wildlife, d.requests]));
  const stepX = (W - padL - padR) / Math.max(1, data.length - 1);
  const x = (i) => padL + i * stepX;
  const y = (v) => H - padB - (v / max) * (H - padB - padT);

  const line = (key) => data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ');
  const monthDate = (m) => {
    const [yr, mo] = m.split('-');
    return new Date(yr, mo - 1, 1);
  };
  const shortMonth = (m) => monthDate(m).toLocaleString('en', { month: 'short' });

  // Gridline ticks: 0, midpoint, max (deduped for tiny maxima).
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  const last = data.length - 1;

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.min(last, Math.max(0, Math.round((px - padL) / stepX)));
    setHover(i);
  }

  return (
    <div>
      {/* Legend: identity per series (dot carries the color, text stays in text tokens). */}
      <div className="mb-2 flex flex-wrap justify-end gap-x-4 gap-y-1">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.stroke }} />
            {s.label}
          </div>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="6-month report trend"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* Recessive grid + y scale */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="currentColor" className="text-border" strokeWidth="1" strokeDasharray={t === 0 ? '' : '3 4'} />
              <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground tabular-nums" fontSize="10">
                {t}
              </text>
            </g>
          ))}

          {/* Hover crosshair */}
          {hover != null && (
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB} stroke="currentColor" className="text-muted-foreground/40" strokeWidth="1" />
          )}

          {SERIES.map((s) => (
            <g key={s.key}>
              <path d={line(s.key)} fill="none" stroke={s.stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {/* Emphasized endpoint only (not a dot on every reading) */}
              <circle cx={x(last)} cy={y(data[last][s.key])} r="3.5" fill={s.stroke} stroke="white" strokeWidth="1.5" />
              {/* Hovered reading, ringed so overlapping marks stay separable */}
              {hover != null && hover !== last && (
                <circle cx={x(hover)} cy={y(data[hover][s.key])} r="3.5" fill={s.stroke} stroke="white" strokeWidth="1.5" />
              )}
            </g>
          ))}

          {data.map((d, i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className={i === hover ? 'fill-foreground' : 'fill-muted-foreground'} fontSize="11">
              {shortMonth(d.month)}
            </text>
          ))}
        </svg>

        {/* Tooltip for the hovered month */}
        {hover != null && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-lg border bg-popover px-3 py-2 shadow-soft"
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
    </div>
  );
}
