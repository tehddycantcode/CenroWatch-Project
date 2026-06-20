import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { complaintApi, wildlifeApi, requestApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'complaint', label: 'Complaints' },
  { key: 'wildlife', label: 'Wildlife' },
  { key: 'request', label: 'Requests' },
];

export default function MyReportsPage() {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([complaintApi.listMine(), wildlifeApi.listMine(), requestApi.listMine()])
      .then(([c, w, r]) => {
        const merged = [
          ...c.data.complaints.map((x) => ({ id: x.tracking_id, kind: 'complaint', title: humanize(x.complaint_type), status: x.status, date: x.submitted_at })),
          ...w.data.turnovers.map((x) => ({ id: x.reference_id, kind: 'wildlife', title: x.species_name, status: x.status, date: x.submitted_at })),
          ...r.data.requests.map((x) => ({ id: x.tracking_id, kind: 'request', title: humanize(x.request_type), status: x.status, date: x.submitted_at })),
        ].sort((a, b) => new Date(b.date) - new Date(a.date));
        setItems(merged);
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

  const filtered = tab === 'all' ? items : items.filter((i) => i.kind === tab);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">My Reports</h1>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No reports in this category yet.</Card>
      ) : (
        <Card className="divide-y">
          {filtered.map((r) => (
            <Link key={r.id} to={`/resident/track/${r.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-accent/40">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{r.title}</div>
                <div className="text-xs text-muted-foreground">
                  {r.id} · {new Date(r.date).toLocaleString()}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
