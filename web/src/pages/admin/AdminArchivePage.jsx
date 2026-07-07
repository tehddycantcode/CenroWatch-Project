import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { staffApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { fmtDay } from '@/lib/staff';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';

// Read-only archive of closed/terminal records across the three modules
// (manuscript Admin "Archive Resolved Records"). Records are retained, never
// deleted — this view surfaces the completed ones in one place. Reuses the
// existing staff list endpoints (Admin is authorized) with client-side filtering.
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

function ArchiveTable({ section, rows }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
        <h2 className="text-sm font-semibold">{section.title}</h2>
        <span className="text-xs text-muted-foreground">{rows.length} closed</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No closed records yet.</p>
      ) : (
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
      )}
    </Card>
  );
}

export default function AdminArchivePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all(SECTIONS.map((s) => s.resource.list({ limit: 100 })))
      .then((results) => {
        const out = {};
        SECTIONS.forEach((s, i) => {
          out[s.key] = (results[i].data.items || [])
            .filter((r) => s.terminal.includes(r.status))
            .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
        });
        setData(out);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  const total = SECTIONS.reduce((n, s) => n + data[s.key].length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Archive</h1>
        <p className="mt-1 text-muted-foreground">
          {total} closed record{total === 1 ? '' : 's'}: resolved, completed, released, transferred, or rejected
        </p>
      </div>
      {SECTIONS.map((s) => (
        <ArchiveTable key={s.key} section={s} rows={data[s.key]} />
      ))}
    </div>
  );
}
