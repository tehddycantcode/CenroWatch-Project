import { useEffect, useState } from 'react';
import { FileText, Users, Clock, ShieldAlert, Download } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconChip } from '@/components/ui/icon-chip';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Spinner } from '@/components/ui/icons';
import { BarChart, TrendChart } from '@/components/admin/charts';
import { CHART_COLORS } from '@/components/admin/chart-colors';

function Stat({ icon, tone, label, value, sub }) {
  return (
    <Card className="border-t-2 border-t-brand-accent p-5">
      <IconChip icon={icon} tone={tone} size="sm" />
      <div className="mt-3 text-3xl font-bold tabular-nums text-primary">{value}</div>
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

// Presets mirror the server's own list. "This month" rather than "Last month"
// because the server counts the CURRENT month plus the previous n-1, so 1m is
// month-to-date - labelling it "last month" would describe a different window.
const RANGE_PRESETS = [
  { value: '1m', label: 'This month' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: '1y', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

const GRAIN_LABEL = { day: 'per day', month: 'per month', year: 'per year' };
const todayStr = () => new Date().toLocaleDateString('en-CA'); // local ISO date

export default function AdminDashboardPage() {
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const [preset, setPreset] = useState('6m');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // What is actually sent. Held separately from the inputs so a half-typed
  // custom range never triggers a fetch.
  const [query, setQuery] = useState({ range: '6m' });
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReloading(true);
    adminApi
      .analytics(query)
      .then((r) => { if (!cancelled) { setA(r.data.analytics); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setReloading(false); });
    return () => { cancelled = true; };
  }, [query]);

  function onPreset(e) {
    const v = e.target.value;
    setPreset(v);
    if (v !== 'custom') setQuery({ range: v }); // custom waits for both dates
  }

  function applyCustom(e) {
    e.preventDefault();
    if (from && to) setQuery({ startDate: from, endDate: to });
  }

  async function downloadReport() {
    setDownloadError('');
    setDownloading(true);
    try {
      // Same window as the screen, so the PDF cannot disagree with the chart.
      await adminApi.downloadReport(query);
    } catch (e) {
      setDownloadError(e.message || 'Could not generate the report.');
    } finally {
      setDownloading(false);
    }
  }

  // Only a first-load failure blanks the page. A failed REFETCH keeps the last
  // good dashboard on screen with an inline error - wiping a working dashboard
  // because one range change failed loses more than it reports.
  if (error && !a) return <p className="text-sm text-destructive">{error}</p>;
  if (!a) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  const tr = a.trend_range;
  const fmt = (iso) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

  // All 18 barangays; BarChart caps visible rows and footnotes the zeros.
  const barangayRows = a.by_barangay.map((b) => ({ label: b.name, value: b.total }));

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-eco-gradient p-6 text-white shadow-soft-md sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-leaf-motif opacity-40" aria-hidden="true" />
        <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-display text-3xl">Analytics Dashboard</h1>
            <p className="mt-1 text-white/80">CENRO Cabuyao system-wide overview</p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <button
              type="button"
              onClick={downloadReport}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-forest shadow-soft transition-shadow duration-150 ease-out hover:shadow-soft-md disabled:opacity-60"
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
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="range" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Period
            </label>
            <Select id="range" value={preset} onChange={onPreset} className="h-9 w-44">
              {RANGE_PRESETS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>

            {preset === 'custom' && (
              <form onSubmit={applyCustom} className="flex flex-wrap items-center gap-2">
                <Input
                  type="date" aria-label="Start date" value={from} max={to || todayStr()}
                  onChange={(e) => setFrom(e.target.value)} className="h-9 w-40"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="date" aria-label="End date" value={to} min={from} max={todayStr()}
                  onChange={(e) => setTo(e.target.value)} className="h-9 w-40"
                />
                <Button type="submit" size="sm" variant="outline" disabled={!from || !to}>Apply</Button>
              </form>
            )}
            {reloading && <Spinner className="h-4 w-4 text-primary" />}
          </div>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>

        <TrendChart
          data={a.trend}
          title="Reports over time"
          subtitle={`${fmt(tr.from)} - ${fmt(tr.to)} - ${GRAIN_LABEL[tr.granularity] || ''}`}
        />

        {tr.truncated && (
          <p className="mt-3 text-xs text-amber-700">
            This range holds more reports than the chart loads at once, so the trend below is incomplete.
            Narrow the period for an exact count.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <SlaCard label="Complaint SLA" sla={a.sla.complaints} />
        <SlaCard label="Wildlife SLA" sla={a.sla.wildlife} />
        <SlaCard label="Request SLA" sla={a.sla.requests} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <BarChart
            title="Complaints by type"
            subtitle="Complaint categories, all time"
            unit="complaints"
            noun="types"
            data={a.by_type.complaints.map((t) => ({ label: t.key, value: t.count }))}
            color={CHART_COLORS.complaints}
          />
        </Card>
        <Card className="p-6">
          <BarChart
            title="Requests by type"
            subtitle="Service requests by kind"
            unit="requests"
            noun="types"
            data={a.by_type.requests.map((t) => ({ label: t.key, value: t.count }))}
            color={CHART_COLORS.requests}
          />
        </Card>
      </div>

      <Card className="p-6">
        <BarChart
          title="Wildlife by species"
          subtitle="Turnovers by reported species"
          unit="turnovers"
          noun="species"
          data={a.by_type.wildlife.map((s) => ({ label: s.key, value: s.count }))}
          color={CHART_COLORS.wildlife}
          format={(s) => s}
        />
      </Card>

      <Card className="p-6">
        <BarChart
          title="Top barangays by reports"
          subtitle={`All report kinds combined across ${a.by_barangay.length} barangays`}
          unit="reports"
          noun="barangays"
          data={barangayRows}
          color={CHART_COLORS.requests}
          format={(s) => s}
        />
      </Card>
    </div>
  );
}
