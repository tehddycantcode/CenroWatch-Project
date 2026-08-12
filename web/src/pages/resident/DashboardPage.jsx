import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Clock, CircleCheck, Bird, Trash2, Sprout, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { complaintApi, wildlifeApi, requestApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { ACTION_TL, STAT_TL, COPY_TL } from '@/lib/tagalog';
import { cn } from '@/lib/utils';
import { Card, cardHover } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { IconChip } from '@/components/ui/icon-chip';
import { StatusLegend } from '@/components/ui/status-legend';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Spinner } from '@/components/ui/icons';

const DONE = ['Resolved', 'Completed', 'Released'];

// Icon + tone per report kind (used by the action cards and the recent list).
const KIND = {
  complaint: { icon: Trash2, tone: 'amber' },
  wildlife: { icon: Bird, tone: 'violet' },
  request: { icon: Sprout, tone: 'primary' },
};

// Soft per-kind background tint for the action cards.
const TINT = {
  complaint: 'from-amber-50',
  wildlife: 'from-violet-50',
  request: 'from-emerald-50',
};

const actions = [
  { to: '/resident/report-complaint', kind: 'complaint', title: 'Report a Complaint', desc: 'Illegal dumping, burning, noise, pollution...' },
  { to: '/resident/report-wildlife', kind: 'wildlife', title: 'Wildlife Turnover', desc: 'Report or turn over rescued wildlife.' },
  { to: '/resident/request-service', kind: 'request', title: 'Request a Service', desc: 'Seedlings, hauling, creek cleaning...' },
];

function normalize(complaints, wildlife, requests) {
  const a = complaints.map((c) => ({ id: c.tracking_id, kind: 'complaint', title: humanize(c.complaint_type), status: c.status, date: c.submitted_at }));
  const b = wildlife.map((w) => ({ id: w.reference_id, kind: 'wildlife', title: w.species_name, status: w.status, date: w.submitted_at }));
  const c = requests.map((r) => ({ id: r.tracking_id, kind: 'request', title: humanize(r.request_type), status: r.status, date: r.submitted_at }));
  return [...a, ...b, ...c].sort((x, y) => new Date(y.date) - new Date(x.date));
}

function Stat({ icon, tone, label, value }) {
  return (
    <Card className="border-t-2 border-t-brand-accent p-5">
      <IconChip icon={icon} tone={tone} size="sm" />
      <div className="mt-3 text-3xl font-bold tabular-nums text-primary">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      {STAT_TL[label] && (
        <div className="text-xs text-muted-foreground/80">{STAT_TL[label]}</div>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [wildlifeCount, setWildlifeCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([complaintApi.listMine(), wildlifeApi.listMine(), requestApi.listMine()])
      .then(([c, w, r]) => {
        setWildlifeCount(w.data.turnovers.length);
        setItems(normalize(c.data.complaints, w.data.turnovers, r.data.requests));
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!items) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7 text-primary" />
      </div>
    );
  }

  const total = items.length;
  const resolved = items.filter((i) => DONE.includes(i.status)).length;
  const active = total - resolved;
  const resolvedPct = total ? Math.round((resolved / total) * 100) : 0;
  const recent = items.slice(0, 6);

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl bg-eco-gradient p-6 text-white shadow-soft-md sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-leaf-motif opacity-40" aria-hidden="true" />
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl">Good day, {user?.first_name}</h1>
            <p className="mt-1 text-white/80">Cabuyao Environmental Monitor</p>
            <Link
              to="/resident/report-complaint"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-forest shadow-soft transition-shadow duration-150 ease-out hover:shadow-soft-md"
            >
              File a report
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white/95 px-4 py-3 text-brand-forest shadow-soft">
            <ProgressRing value={resolvedPct} size={64} label={`${resolvedPct}%`} />
            <div className="text-sm">
              <div className="font-semibold">Resolved</div>
              <div className="text-muted-foreground">{resolved} of {total} reports</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat icon={FileText} tone="primary" label="Total Reports" value={total} />
        <Stat icon={Clock} tone="amber" label="Active" value={active} />
        <Stat icon={CircleCheck} tone="forest" label="Resolved" value={resolved} />
        <Stat icon={Bird} tone="violet" label="Wildlife Cases" value={wildlifeCount} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">What would you like to do?</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {actions.map((a) => {
            const k = KIND[a.kind];
            return (
              <Link
                key={a.to}
                to={a.to}
                className={cn('group rounded-2xl border bg-gradient-to-br to-white p-5', TINT[a.kind], cardHover)}
              >
                <IconChip icon={k.icon} tone={k.tone} size="lg" />
                <div className="mt-3 flex items-center gap-1 font-semibold text-foreground">
                  {a.title}
                  <ArrowRight className="h-4 w-4 shrink-0 text-primary transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true" />
                </div>
                {ACTION_TL[a.to] && (
                  <div className="text-sm font-medium text-primary">{ACTION_TL[a.to].title}</div>
                )}
                <div className="mt-1.5 text-sm text-muted-foreground">{a.desc}</div>
                {ACTION_TL[a.to] && (
                  <div className="text-sm text-muted-foreground/80">{ACTION_TL[a.to].desc}</div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent reports</h2>
          <Link to="/resident/my-reports" className="text-sm font-medium text-primary hover:underline">
            See all
          </Link>
        </div>
        {recent.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            You haven&apos;t filed any reports yet. Use an action above to get started.
            <span className="mt-1 block text-muted-foreground/80">{COPY_TL.noReports}</span>
          </Card>
        ) : (
          <Card className="divide-y">
            <StatusLegend />
            {recent.map((r) => {
              const k = KIND[r.kind] || KIND.complaint;
              return (
                <Link key={r.id} to={`/resident/track/${r.id}`} className="flex items-center gap-4 p-4 transition-colors hover:bg-accent/40">
                  <IconChip icon={k.icon} tone={k.tone} size="sm" />
                  {/* Titles wrap rather than truncate: at 320px the badge left
                      so little room that "Open Burning" rendered "Open Burni...". */}
                  {/* The tracking id gets its own line. Inline with the date it
                      could not wrap (it must not break mid-id) and so ran out
                      of its box and under the status badge. */}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="block truncate tabular-nums">{r.id}</span>
                      <span className="block">
                        Submitted{' '}
                        <span className="tabular-nums">
                          {new Date(r.date).toLocaleDateString()}
                        </span>
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={r.status} stage className="shrink-0" />
                </Link>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
