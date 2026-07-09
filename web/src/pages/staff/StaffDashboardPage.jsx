import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Bird, Sprout, Clock, AlertTriangle, FileText, ShieldAlert, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { staffApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { KIND_META, fmtDate } from '@/lib/staff';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { IconChip } from '@/components/ui/icon-chip';
import { StatusLegend } from '@/components/ui/status-legend';
import { Spinner } from '@/components/ui/icons';
import ReportsMap from '@/components/staff/ReportsMap';

// Icon + tone per report kind.
const ICONS = {
  complaint: { icon: Trash2, tone: 'amber' },
  wildlife: { icon: Bird, tone: 'violet' },
  request: { icon: Sprout, tone: 'primary' },
};

function Stat({ icon, tone, label, value, danger }) {
  return (
    <Card className="border-t-2 border-t-brand-accent p-5">
      <IconChip icon={icon} tone={tone} size="sm" />
      <div className={cn('mt-3 text-3xl font-bold tabular-nums', danger ? 'text-red-600' : 'text-primary')}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    </Card>
  );
}

function ResourceCard({ kind, data }) {
  const meta = KIND_META[kind];
  const ic = ICONS[kind];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconChip icon={ic.icon} tone={ic.tone} size="md" />
          <h3 className="font-semibold">{meta.plural}</h3>
        </div>
        <Link to={meta.base} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Open <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-2xl font-bold text-foreground">{data.total}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-primary">{data.open}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Open</div>
        </div>
        <div>
          <div className={`text-2xl font-bold ${data.breached ? 'text-red-600' : 'text-foreground'}`}>{data.breached}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">SLA past</div>
        </div>
      </div>
    </Card>
  );
}

export default function StaffDashboardPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    staffApi.overview().then((r) => setOverview(r.data.overview)).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!overview) {
    return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;
  }

  const allReports = overview.complaints.total + overview.wildlife.total + overview.requests.total;

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-eco-gradient p-6 text-white shadow-soft-md sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-leaf-motif opacity-40" aria-hidden="true" />
        <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-display text-3xl">Good day, {user?.first_name}</h1>
            <p className="mt-1 text-white/80">CENRO Cabuyao operations dashboard</p>
          </div>
          <Link
            to="/staff/complaints"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-forest shadow-soft transition-all hover:shadow-soft-md"
          >
            Open complaints queue
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat icon={Clock} tone="amber" label="Open items" value={overview.totals.open} />
        <Stat icon={AlertTriangle} tone="amber" label="SLA past due" value={overview.totals.breached} danger={overview.totals.breached > 0} />
        <Stat icon={FileText} tone="primary" label="All reports" value={allReports} />
        <Stat icon={ShieldAlert} tone="violet" label="Priority wildlife" value={overview.wildlife.by_status?.Priority_Review || 0} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <ResourceCard kind="complaint" data={overview.complaints} />
        <ResourceCard kind="wildlife" data={overview.wildlife} />
        <ResourceCard kind="request" data={overview.requests} />
      </div>

      <ReportsMap />

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
        {overview.recent.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">No reports yet.</Card>
        ) : (
          <Card className="divide-y">
            <StatusLegend />
            {overview.recent.map((r) => {
              const ic = ICONS[r.kind] || ICONS.complaint;
              return (
                <Link
                  key={r.id}
                  to={`${KIND_META[r.kind].base}/${r.id}`}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-accent/30"
                >
                  <IconChip icon={ic.icon} tone={ic.tone} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {KIND_META[r.kind].label}
                      </span>
                      <span className="text-xs text-muted-foreground">{r.id}</span>
                    </div>
                    <div className="truncate font-medium text-foreground">{humanize(r.title)}</div>
                    <div className="text-xs text-muted-foreground">{r.barangay || 'Cabuyao'} · {fmtDate(r.date)}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
