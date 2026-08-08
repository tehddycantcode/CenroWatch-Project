import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { complaintApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { COPY_TL } from '@/lib/tagalog';
import { fmtDate } from '@/lib/staff';
import PublicHeader from '@/components/public/PublicHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/badge';

export default function PublicTrackPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('id') || '';
  const [query, setQuery] = useState(initial);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(async (id) => {
    const trackingId = id.trim();
    if (!trackingId) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await complaintApi.track(trackingId);
      setResult(res.data.complaint);
    } catch (e) {
      setError(e.message || 'No report found with that reference number.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-lookup when arriving with ?id=...
  useEffect(() => {
    if (initial) lookup(initial);
  }, [initial, lookup]);

  function onSubmit(e) {
    e.preventDefault();
    setParams(query.trim() ? { id: query.trim() } : {});
    lookup(query);
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="container py-10">
        <div className="mx-auto max-w-xl">
          <div className="mb-6">
            <Link to="/" className="text-sm font-medium text-primary hover:underline">← Home</Link>
            <h1 className="mt-2 font-display text-3xl">Track a Report</h1>
            <p className="mt-1 text-muted-foreground">
              Enter the reference number you received (e.g. CMP-2026-00001) to see its current status.
            </p>
            <p className="mt-1 text-sm text-muted-foreground/80">{COPY_TL.trackHint}</p>
          </div>

          <Card className="p-6">
            <form onSubmit={onSubmit} className="flex items-center gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="CMP-2026-00001"
                className="font-mono"
              />
              <Button type="submit" loading={loading}>Track</Button>
            </form>

            {error && <div className="mt-4"><Alert>{error}</Alert></div>}

            {result && (
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Reference</div>
                    <div className="font-mono text-lg font-semibold">{result.tracking_id}</div>
                  </div>
                  {/* `stage` so a public lookup shows the same three-stage
                      label the resident sees, not the raw internal status. */}
                  <StatusBadge status={result.status} stage />
                </div>
                <dl className="grid grid-cols-1 gap-4 border-t pt-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Type</dt>
                    <dd className="mt-0.5">{humanize(result.complaint_type)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Barangay</dt>
                    <dd className="mt-0.5">{result.barangay?.name || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Submitted</dt>
                    <dd className="mt-0.5">{fmtDate(result.submitted_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {result.resolved_at ? 'Resolved' : 'Last updated'}
                    </dt>
                    <dd className="mt-0.5">{fmtDate(result.resolved_at || result.updated_at)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </Card>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            For your privacy, public tracking shows status only. No personal details are displayed.
          </p>
        </div>
      </div>
    </div>
  );
}
