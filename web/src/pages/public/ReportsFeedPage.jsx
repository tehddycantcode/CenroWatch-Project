import { useEffect, useState } from 'react';
import { gisApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import PublicHeader from '@/components/public/PublicHeader';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';

export default function ReportsFeedPage() {
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    gisApi
      .feed()
      .then((r) => setFeed(r.data.feed))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen bg-muted/20">
      <PublicHeader />
      <main className="container py-10">
        <h1 className="font-display text-3xl">Environmental Reports</h1>
        <p className="mt-1 text-muted-foreground">
          Recent activity across Cabuyao. Personal details are never shown.
        </p>

        <div className="mt-6">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !feed ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-7 w-7 text-primary" />
            </div>
          ) : feed.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No public reports yet.</Card>
          ) : (
            <Card className="divide-y">
              {feed.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-4 p-4">
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
                </div>
              ))}
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
