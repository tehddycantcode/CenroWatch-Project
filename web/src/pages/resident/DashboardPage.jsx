import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { complaintApi, wildlifeApi, requestApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';

const DONE = ['Resolved', 'Completed', 'Released'];

const actions = [
  { to: '/resident/report-complaint', emoji: '🗑️', title: 'Report a Complaint', desc: 'Illegal dumping, burning, noise, pollution…' },
  { to: '/resident/report-wildlife', emoji: '🦅', title: 'Wildlife Turnover', desc: 'Report or turn over rescued wildlife.' },
  { to: '/resident/request-service', emoji: '🌱', title: 'Request a Service', desc: 'Seedlings, hauling, creek cleaning…' },
];

function normalize(complaints, wildlife, requests) {
  const a = complaints.map((c) => ({ id: c.tracking_id, kind: 'complaint', title: humanize(c.complaint_type), status: c.status, date: c.submitted_at }));
  const b = wildlife.map((w) => ({ id: w.reference_id, kind: 'wildlife', title: w.species_name, status: w.status, date: w.submitted_at }));
  const c = requests.map((r) => ({ id: r.tracking_id, kind: 'request', title: humanize(r.request_type), status: r.status, date: r.submitted_at }));
  return [...a, ...b, ...c].sort((x, y) => new Date(y.date) - new Date(x.date));
}

function Stat({ label, value }) {
  return (
    <Card className="p-5">
      <div className="text-3xl font-bold text-primary">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
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
  const recent = items.slice(0, 6);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Good day, {user?.first_name} 👋</h1>
        <p className="mt-1 text-muted-foreground">Cabuyao Environmental Monitor</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Reports" value={total} />
        <Stat label="Active" value={active} />
        <Stat label="Resolved" value={resolved} />
        <Stat label="Wildlife Cases" value={wildlifeCount} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">What would you like to do?</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {actions.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="rounded-2xl border bg-card p-5 transition-colors hover:border-primary hover:bg-accent/40"
            >
              <div className="text-2xl">{a.emoji}</div>
              <div className="mt-2 font-semibold text-foreground">{a.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{a.desc}</div>
            </Link>
          ))}
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
          </Card>
        ) : (
          <Card className="divide-y">
            {recent.map((r) => (
              <Link key={r.id} to={`/resident/track/${r.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-accent/40">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.id} · {new Date(r.date).toLocaleDateString()}
                  </div>
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
