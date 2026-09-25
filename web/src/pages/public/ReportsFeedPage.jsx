import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { gisApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import PublicHeader from '@/components/public/PublicHeader';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/icons';

const ALL = 'all';

export default function ReportsFeedPage() {
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(ALL);

  useEffect(() => {
    gisApi
      .feed()
      .then((r) => setFeed(r.data.feed))
      .catch((e) => setError(e.message));
  }, []);

  // The options come from the statuses the feed actually contains, not from a
  // hardcoded list. A hand-maintained array is how a status silently vanishes
  // from a filter the day someone adds one to the enum (see the status-enum
  // lesson in CLAUDE.md); derived options cannot drift out of sync.
  const statuses = useMemo(() => {
    if (!feed) return [];
    return [...new Set(feed.map((f) => f.status))].sort();
  }, [feed]);

  const shown = useMemo(() => {
    if (!feed) return [];
    return status === ALL ? feed : feed.filter((f) => f.status === status);
  }, [feed, status]);

  return (
    <div className="min-h-screen bg-muted/20">
      <PublicHeader />
      <main className="container py-10">
        <h1 className="font-display text-3xl">Environmental Reports</h1>
        <p className="mt-1 text-muted-foreground">
          Recent activity across Cabuyao. Personal details are never shown.
        </p>

        {feed && feed.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label htmlFor="status-filter" className="text-sm font-medium text-foreground">
              Filter by status
            </label>
            <Select
              id="status-filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 w-auto min-w-[12rem]"
            >
              <option value={ALL}>All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
            <span className="text-sm text-muted-foreground">
              {shown.length} of {feed.length} report{feed.length === 1 ? '' : 's'}
            </span>
          </div>
        )}

        <div className="mt-6">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !feed ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-7 w-7 text-primary" />
            </div>
          ) : feed.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No public reports yet.</Card>
          ) : shown.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No reports with that status.
            </Card>
          ) : (
            <Card className="divide-y">
              {shown.map((f) => (
                <FeedRow key={f.id} report={f} />
              ))}
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

// One row of the feed.
//
// A complaint links to the public tracking page, which already takes ?id= and
// looks the reference up on arrival. That is the ONLY public per-report view
// there is, and it is the privacy-safe one: it returns status, type, barangay
// and dates, and no reporter identity at all. There is deliberately no
// /reports/:id page - a public detail route would be a second surface to keep
// free of personal data, and /track already answers the question.
//
// Wildlife rows are NOT linked, because public tracking is mounted for
// complaints only (backend routes/complaint.routes.js). Linking a WLD-
// reference would render a link that always resolves to "not found", which is
// worse than no link at all.
function FeedRow({ report: f }) {
  const trackable = f.kind === 'complaint';

  const body = (
    <>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {f.kind === 'wildlife' ? 'Wildlife' : 'Complaint'}
          </span>
          <span className="text-xs text-muted-foreground">{f.id}</span>
        </div>
        <div className="truncate font-medium text-foreground">{humanize(f.title)}</div>
        <div className="text-xs text-muted-foreground">
          {f.barangay || 'Cabuyao'} · {new Date(f.date).toLocaleDateString()}
        </div>
      </div>
      <StatusBadge status={f.status} />
    </>
  );

  if (!trackable) {
    return <div className="flex items-center justify-between gap-4 p-4">{body}</div>;
  }

  return (
    <Link
      to={`/track?id=${encodeURIComponent(f.id)}`}
      aria-label={`Track report ${f.id}`}
      className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {body}
    </Link>
  );
}
