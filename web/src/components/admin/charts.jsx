import { humanize } from '@/lib/reports';

// Dependency-light charts (CSS bars + inline SVG) so the admin dashboard stays
// free of a charting library and the bundle small.

// Horizontal bar list. data: [{ label, value }]. `format` optional label cleanup.
export function BarChart({ data, color = 'bg-primary', format = humanize, empty = 'No data yet.' }) {
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-40 shrink-0 truncate text-sm text-foreground">{format(d.label)}</div>
          <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
            <div className={`h-full ${color}`} style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <div className="w-8 shrink-0 text-right text-sm font-medium tabular-nums">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

const SERIES = [
  { key: 'complaints', label: 'Complaints', stroke: '#dc2626' },
  { key: 'wildlife', label: 'Wildlife', stroke: '#16a34a' },
  { key: 'requests', label: 'Requests', stroke: '#2563eb' },
];

// Multi-series line chart for the 6-month trend. data: [{ month, complaints, wildlife, requests }].
export function TrendChart({ data }) {
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>;

  const W = 560, H = 200, padX = 32, padY = 20;
  const max = Math.max(1, ...data.flatMap((d) => [d.complaints, d.wildlife, d.requests]));
  const stepX = (W - padX * 2) / Math.max(1, data.length - 1);
  const x = (i) => padX + i * stepX;
  const y = (v) => H - padY - (v / max) * (H - padY * 2);

  const line = (key) => data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ');
  const shortMonth = (m) => {
    const [yr, mo] = m.split('-');
    return new Date(yr, mo - 1, 1).toLocaleString('en', { month: 'short' });
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="6-month report trend">
        {/* baseline */}
        <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="currentColor" className="text-border" strokeWidth="1" />
        {SERIES.map((s) => (
          <g key={s.key}>
            <path d={line(s.key)} fill="none" stroke={s.stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {data.map((d, i) => (
              <circle key={i} cx={x(i)} cy={y(d[s.key])} r="3" fill={s.stroke} />
            ))}
          </g>
        ))}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={H - 4} textAnchor="middle" className="fill-muted-foreground" fontSize="11">
            {shortMonth(d.month)}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.stroke }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
