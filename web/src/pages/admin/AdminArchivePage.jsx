import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { staffApi, adminApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { fmtDay } from '@/lib/staff';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { TableHead } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';

// Two views of "archive", which mean different things and are kept apart:
//
// Closed records - reports that reached a terminal status. Still fully live in
//   the system; this is just the completed work in one place.
// Archived - reports an admin has hidden. They keep their record and history
//   but drop out of queues, dashboards, analytics, and the resident's list.
const SECTIONS = [
  {
    key: 'complaints',
    title: 'Complaints',
    resource: staffApi.complaints,
    terminal: ['Resolved', 'Rejected'],
    id: (r) => r.tracking_id,
    label: (r) => humanize(r.complaint_type),
    link: (r) => `/admin/complaints/${r.tracking_id}`,
  },
  {
    key: 'wildlife',
    title: 'Wildlife turnovers',
    resource: staffApi.wildlife,
    terminal: ['Released', 'Transferred', 'Deceased'],
    id: (r) => r.reference_id,
    label: (r) => r.species_name,
    link: (r) => `/admin/wildlife/${r.reference_id}`,
  },
  {
    key: 'requests',
    title: 'Service requests',
    resource: staffApi.requests,
    terminal: ['Completed', 'Rejected'],
    id: (r) => r.tracking_id,
    label: (r) => humanize(r.request_type),
    link: (r) => `/admin/requests/${r.tracking_id}`,
  },
];

const LINK_FOR = {
  complaints: (ref) => `/admin/complaints/${ref}`,
  wildlife: (ref) => `/admin/wildlife/${ref}`,
  requests: (ref) => `/admin/requests/${ref}`,
};

function ClosedTable({ section, rows }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
        <h2 className="text-sm font-semibold">{section.title}</h2>
        <span className="text-xs text-muted-foreground">{rows.length} closed</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No closed records yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Reference</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Barangay</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={section.id(r)} className="hover:bg-accent/20">
                  <td className="px-4 py-2.5">
                    <Link to={section.link(r)} className="font-mono text-xs text-primary hover:underline">
                      {section.id(r)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-foreground">{section.label(r)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.barangay?.name || '—'}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{fmtDay(r.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ArchivedTable({ rows, onRestore, busyKey }) {
  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing is archived. Archiving a report from its detail page hides it from the queues,
          dashboards, and public map while keeping the record and its history.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <TableHead columns={['Reference', 'Report', 'Reason', 'Archived', '']} />
          <tbody className="divide-y">
            {rows.map((r) => {
              const key = `${r.kind}:${r.reference}`;
              return (
                <tr key={key} className="hover:bg-accent/20">
                  <td className="px-4 py-3">
                    <Link to={LINK_FOR[r.kind](r.reference)} className="font-mono text-xs text-primary hover:underline">
                      {r.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-foreground">{humanize(r.title)}</div>
                    <div className="text-xs text-muted-foreground">{r.label} · {r.barangay || 'No barangay'}</div>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-muted-foreground">{r.archive_reason || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div>{fmtDay(r.archived_at)}</div>
                    {r.archived_by_name && <div className="text-xs">by {r.archived_by_name}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" disabled={busyKey === key} onClick={() => onRestore(r)}>
                      {busyKey === key ? <Spinner className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                      Restore
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function AdminArchivePage() {
  const [tab, setTab] = useState('closed');
  const [closed, setClosed] = useState(null);
  const [archived, setArchived] = useState(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const loadClosed = useCallback(() => {
    Promise.all(SECTIONS.map((s) => s.resource.list({ limit: 100 })))
      .then((results) => {
        const out = {};
        SECTIONS.forEach((s, i) => {
          out[s.key] = (results[i].data.items || [])
            .filter((r) => s.terminal.includes(r.status))
            .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
        });
        setClosed(out);
      })
      .catch((e) => setError(e.message));
  }, []);

  const loadArchived = useCallback(() => {
    adminApi.archive.list().then((r) => setArchived(r.data.items)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { loadClosed(); loadArchived(); }, [loadClosed, loadArchived]);

  async function restore(row) {
    const key = `${row.kind}:${row.reference}`;
    setError('');
    setBusyKey(key);
    try {
      await adminApi.archive.restore(row.kind, row.reference);
      loadArchived();
      loadClosed();
    } catch (e) {
      setError(e.message || 'Could not restore the report.');
    } finally {
      setBusyKey('');
    }
  }

  if (error && !closed && !archived) return <p className="text-sm text-destructive">{error}</p>;
  if (!closed || !archived) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  const closedTotal = SECTIONS.reduce((n, s) => n + closed[s.key].length, 0);

  const TABS = [
    { id: 'closed', label: `Closed records (${closedTotal})` },
    { id: 'archived', label: `Archived (${archived.length})` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Archive</h1>
        <p className="mt-1 text-muted-foreground">
          Completed work, and reports an administrator has hidden from the working system.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {tab === 'closed' ? (
        <>
          <p className="text-sm text-muted-foreground">
            {closedTotal} closed record{closedTotal === 1 ? '' : 's'}: resolved, completed, released,
            transferred, or rejected. These are still live in the system.
          </p>
          {SECTIONS.map((s) => <ClosedTable key={s.key} section={s} rows={closed[s.key]} />)}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Archived reports keep their record and status history, and can be restored at any time.
            While archived they do not appear in staff queues, dashboard counts, analytics, the
            public map and feed, or the resident&apos;s own list.
          </p>
          <ArchivedTable rows={archived} onRestore={restore} busyKey={busyKey} />
        </>
      )}
    </div>
  );
}
