import { useEffect, useState } from 'react';
import { FileText, Users, Clock, ShieldAlert, Download } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { IconChip } from '@/components/ui/icon-chip';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Spinner } from '@/components/ui/icons';
import { BarChart, TrendChart } from '@/components/admin/charts';

function Stat({ icon, tone, label, value, sub }) {
  return (
    <Card className="border-t-2 border-t-brand-accent p-5">
      <IconChip icon={icon} tone={tone} size="sm" />
      <div className="mt-3 text-3xl font-bold text-primary">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function SlaCard({ label, sla }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <ProgressRing value={sla.rate == null ? 0 : sla.rate} size={60} label={sla.rate == null ? '-' : `${sla.rate}%`} />
        <div className="min-w-0">
          <div className="text-sm font-semibold">{label}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {sla.on_time}/{sla.closed} closed on time
          </div>
          {sla.overdue_open > 0 && (
            <div className="mt-0.5 text-xs font-medium text-red-600">{sla.overdue_open} overdue open</div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    adminApi.analytics().then((r) => setA(r.data.analytics)).catch((e) => setError(e.message));
  }, []);

  async function downloadReport() {
    setDownloadError('');
    setDownloading(true);
    try {
      await adminApi.downloadReport();
    } catch (e) {
      setDownloadError(e.message || 'Could not generate the report.');
    } finally {
      setDownloading(false);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!a) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  const topBarangays = [...a.by_barangay]
    .sort((x, y) => y.total - x.total)
    .slice(0, 8)
    .map((b) => ({ label: b.name, value: b.total }));

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-eco-gradient p-6 text-white shadow-soft-md sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-leaf-motif opacity-40" aria-hidden="true" />
        <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-display text-3xl">Analytics Dashboard</h1>
            <p className="mt-1 text-white/80">CENRO Cabuyao - system-wide overview</p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <button
              onClick={downloadReport}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-forest shadow-soft transition-all hover:shadow-soft-md disabled:opacity-60"
            >
              {downloading ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              Download PDF report
            </button>
            {downloadError && <span className="text-xs text-red-100">{downloadError}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={FileText} tone="primary" label="Total Reports" value={a.reports.total} sub={`${a.reports.complaints} complaints, ${a.reports.wildlife} wildlife, ${a.reports.requests} requests`} />
        <Stat icon={Users} tone="blue" label="Users" value={a.users.total} sub={`${a.users.active} active, ${a.users.by_role.CENRO_Staff} staff`} />
        <Stat icon={Clock} tone="amber" label="Avg Resolution" value={a.resolution.avg_resolution_hours == null ? '-' : `${a.resolution.avg_resolution_hours}h`} sub={`${a.resolution.complaints_resolved} complaints resolved`} />
        <Stat icon={ShieldAlert} tone="violet" label="Endangered Wildlife" value={a.wildlife_endangered} sub="flagged for priority" />
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Reports - last 6 months</h2>
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
        <h2 className="mb-4 text-lg font-semibold">Wildlife by species</h2>
        <BarChart
          data={a.by_type.wildlife.slice(0, 8).map((s) => ({ label: s.key, value: s.count }))}
          color="bg-emerald-500"
          format={(s) => s}
        />
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Top barangays by reports</h2>
        <BarChart data={topBarangays} color="bg-primary" format={(s) => s} />
      </Card>
    </div>
  );
}
