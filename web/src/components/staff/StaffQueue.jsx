import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Bird, Sprout, Search, ChevronRight, Inbox } from 'lucide-react';
import { humanize } from '@/lib/reports';
import { staffApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconChip } from '@/components/ui/icon-chip';

// Icon, tint, and overview key per report kind. Keeps the queue visually in step
// with the dashboard (same Trash2/Bird/Sprout + amber/violet/primary language).
const KIND_UI = {
  complaint: { icon: Trash2, tone: 'amber', overviewKey: 'complaints' },
  wildlife: { icon: Bird, tone: 'violet', overviewKey: 'wildlife' },
  request: { icon: Sprout, tone: 'primary', overviewKey: 'requests' },
};

// Generic staff queue: a header band with live workload chips, clickable status
// tabs (counts from /staff/overview), search, an icon-led clickable table, skeleton
// loading, and a friendly empty state. Each queue page supplies its API + columns.
export default function StaffQueue({ title, subtitle, kind, resource, statuses, columns, rowKey, rowLink }) {
  const navigate = useNavigate();
  const ui = KIND_UI[kind] || KIND_UI.complaint;

  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({ status: '', search: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Workload counts (total / open / SLA-breached + per-status) for this kind.
  // Non-fatal: the list still works if this fails, the chips/counts just hide.
  useEffect(() => {
    let active = true;
    staffApi
      .overview()
      .then((r) => active && setSummary(r.data.overview[ui.overviewKey]))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ui.overviewKey]);

  useEffect(() => {
    setLoading(true);
    resource
      .list({ status: applied.status, search: applied.search, page, limit: 20 })
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [resource, applied, page]);

  function selectStatus(value) {
    setStatus(value);
    setPage(1);
    setApplied((a) => ({ ...a, status: value }));
  }

  function applyFilters(e) {
    e.preventDefault();
    setPage(1);
    setApplied({ status, search: search.trim() });
  }

  function clearFilters() {
    setStatus('');
    setSearch('');
    setPage(1);
    setApplied({ status: '', search: '' });
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 20));
  const isFiltered = Boolean(applied.status || applied.search);

  const tabs = [
    { value: '', label: 'All', count: summary?.total },
    ...statuses.map((s) => ({ value: s, label: humanize(s), count: summary?.by_status?.[s] ?? 0 })),
  ];

  return (
    <div className="space-y-5">
      {/* Header band: identity + live workload chips */}
      <Card className="border-t-2 border-t-brand-accent p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <IconChip icon={ui.icon} tone={ui.tone} size="lg" />
            <div>
              <h1 className="font-display text-2xl leading-tight sm:text-3xl">{title}</h1>
              {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {summary && (
            <div className="flex gap-2">
              <SummaryChip label="Total" value={summary.total} />
              <SummaryChip label="Open" value={summary.open} tone="primary" />
              <SummaryChip label="SLA past" value={summary.breached} danger={summary.breached > 0} />
            </div>
          )}
        </div>
      </Card>

      {/* Status tabs + search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <StatusTab
              key={t.value || 'all'}
              active={applied.status === t.value}
              count={t.count}
              label={t.label}
              onClick={() => selectStatus(t.value)}
            />
          ))}
        </div>
        <form onSubmit={applyFilters} className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID or text…"
              className="h-9 w-56 pl-8"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">Search</Button>
        </form>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading ? (
        <SkeletonTable />
      ) : items.length === 0 ? (
        <EmptyState icon={ui.icon} filtered={isFiltered} onClear={clearFilters} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3" aria-hidden="true" />
                {columns.map((c) => (
                  <th key={c.header} className={cnHead(c)}>{c.header}</th>
                ))}
                <th className="w-10 px-4 py-3" aria-hidden="true" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={() => navigate(rowLink(row))}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(rowLink(row))}
                  tabIndex={0}
                  role="link"
                  className="group cursor-pointer outline-none transition-colors hover:bg-accent/40 focus-visible:bg-accent/40"
                >
                  <td className="px-4 py-3">
                    <IconChip icon={ui.icon} tone={ui.tone} size="sm" />
                  </td>
                  {columns.map((c) => (
                    <td key={c.header} className={cnCell(c)}>{c.render(row)}</td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">
            Showing {items.length} of {total}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page} of {pageCount}</span>
              <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryChip({ label, value, tone, danger }) {
  return (
    <div className="min-w-[68px] rounded-xl border bg-muted/40 px-3 py-2 text-center">
      <div
        className={cn(
          'text-xl font-bold leading-none',
          danger ? 'text-red-600' : tone === 'primary' ? 'text-primary' : 'text-foreground'
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusTab({ active, count, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-brand-primary bg-brand-primary text-white shadow-soft'
          : 'border-border bg-card text-muted-foreground hover:bg-accent/40 hover:text-foreground'
      )}
    >
      {label}
      {count != null && (
        <span
          className={cn(
            'rounded-full px-1.5 text-xs font-semibold tabular-nums',
            active ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function SkeletonTable() {
  return (
    <Card className="divide-y overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/5 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </Card>
  );
}

function EmptyState({ icon, filtered, onClear }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <IconChip icon={filtered ? Search : icon || Inbox} tone="primary" size="lg" />
      <div>
        <p className="font-medium text-foreground">No records found</p>
        <p className="text-sm text-muted-foreground">
          {filtered ? 'No items match these filters.' : 'Nothing has been submitted yet.'}
        </p>
      </div>
      {filtered && (
        <Button size="sm" variant="outline" onClick={onClear}>Clear filters</Button>
      )}
    </Card>
  );
}

const cnHead = (c) => `px-4 py-3 font-medium ${c.className || ''}`;
const cnCell = (c) => `px-4 py-3 ${c.className || ''}`;
