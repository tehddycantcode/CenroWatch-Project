import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/icons';
import { BarChart, TrendChart } from '@/components/admin/charts';

function Stat({ label, value, sub }) {
  return (
    <Card className="p-5">
      <div className="text-3xl font-bold text-primary">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function SlaCard({ label, sla }) {
  return (
    <Card className="p-5">
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-3xl font-bold text-foreground">{sla.rate == null ? '—' : `${sla.rate}%`}</span>
        <span className="pb-1 text-xs text-muted-foreground">on-time</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {sla.on_time}/{sla.closed} closed on time
        {sla.overdue_open > 0 && <span className="ml-1 font-medium text-red-600">· {sla.overdue_open} overdue</span>}
      </div>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const [a, setA] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.analytics().then((r) => setA(r.data.analytics)).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!a) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  const topBarangays = [...a.by_barangay]
    .sort((x, y) => y.total - x.total)
    .slice(0, 8)
    .map((b) => ({ label: b.name, value: b.total }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Analytics Dashboard</h1>
        <p className="mt-1 text-muted-foreground">CENRO Cabuyao · system-wide overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total Reports" value={a.reports.total} sub={`${a.reports.complaints} complaints · ${a.reports.wildlife} wildlife · ${a.reports.requests} requests`} />
        <Stat label="Users" value={a.users.total} sub={`${a.users.active} active · ${a.users.by_role.CENRO_Staff} staff`} />
        <Stat label="Avg Resolution" value={a.resolution.avg_resolution_hours == null ? '—' : `${a.resolution.avg_resolution_hours}h`} sub={`${a.resolution.complaints_resolved} complaints resolved`} />
        <Stat label="Endangered Wildlife" value={a.wildlife_endangered} sub="flagged for priority" />
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Reports — last 6 months</h2>
        <TrendChart data={a.trend} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <SlaCard label="Complaint SLA" sla={a.sla.complaints} />
        <SlaCard label="Wildlife SLA" sla={a.sla.wildlife} />
        <SlaCard label="Request SLA" sla={a.sla.requests} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Complaints by type</h2>
          <BarChart data={a.by_type.complaints.map((t) => ({ label: t.key, value: t.count }))} color="bg-red-500" />
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Requests by type</h2>
          <BarChart data={a.by_type.requests.map((t) => ({ label: t.key, value: t.count }))} color="bg-blue-500" />
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Top barangays by reports</h2>
        <BarChart data={topBarangays} color="bg-primary" format={(s) => s} />
      </Card>
    </div>
  );
}
