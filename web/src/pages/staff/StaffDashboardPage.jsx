import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { staffApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { KIND_META, fmtDate } from '@/lib/staff';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';

function ResourceCard({ kind, data }) {
  const meta = KIND_META[kind];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{meta.plural}</h3>
        <Link to={meta.base} className="text-sm font-medium text-primary hover:underline">Open queue →</Link>
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Good day, {user?.first_name} 👋</h1>
        <p className="mt-1 text-muted-foreground">CENRO Cabuyao · operations dashboard</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-5">
          <div className="text-3xl font-bold text-primary">{overview.totals.open}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">Open items</div>
        </Card>
        <Card className="p-5">
          <div className={`text-3xl font-bold ${overview.totals.breached ? 'text-red-600' : 'text-foreground'}`}>
            {overview.totals.breached}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">SLA past due</div>
        </Card>
        <Card className="p-5">
          <div className="text-3xl font-bold text-foreground">{overview.complaints.total + overview.wildlife.total + overview.requests.total}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">All reports</div>
        </Card>
        <Card className="p-5">
          <div className="text-3xl font-bold text-foreground">{overview.wildlife.by_status?.Priority_Review || 0}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">Priority wildlife</div>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <ResourceCard kind="complaint" data={overview.complaints} />
        <ResourceCard kind="wildlife" data={overview.wildlife} />
        <ResourceCard kind="request" data={overview.requests} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
        {overview.recent.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">No reports yet.</Card>
        ) : (
          <Card className="divide-y">
            {overview.recent.map((r) => (
              <Link
                key={r.id}
                to={`${KIND_META[r.kind].base}/${r.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-accent/30"
              >
                <div className="min-w-0">
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
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
