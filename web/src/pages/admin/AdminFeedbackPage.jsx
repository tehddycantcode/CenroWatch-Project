import { useEffect, useState } from 'react';
import { Star, MessageSquare } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/icons';

// What residents said about the service, once their case closed.
//
// READ-ONLY, deliberately. There is no reply, no resolve, no delete: an Admin
// who could edit or remove what was said about their own office would make the
// whole dataset worthless, and a reply button would promise a conversation
// nothing in the system actually delivers.

const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

const KIND_LABEL = { complaint: 'Complaint', wildlife: 'Wildlife', request: 'Request' };

function StarRow({ value, label }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${label}: ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
          aria-hidden="true"
        />
      ))}
      {/* The number as well as the stars: stars alone are unreadable in a
          screen reader and in a printed copy of this page. */}
      <span className="ml-1 text-xs tabular-nums text-muted-foreground">{value}</span>
    </span>
  );
}

function AverageCard({ label, value, hint }) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        {/* "No ratings yet" rather than 0.0 - a zero would read as the worst
            possible score when it actually means nobody has answered. */}
        <span className="font-display text-3xl tabular-nums">
          {value == null ? '—' : value.toFixed(1)}
        </span>
        {value != null && <span className="text-sm text-muted-foreground">/ 5</span>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{value == null ? 'No ratings yet.' : hint}</p>
    </Card>
  );
}

export default function AdminFeedbackPage() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    adminApi.feedback({ page, limit: 20 })
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message));
  }, [page]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  // Counts per overall score, so a 3.0 made of 1s and 5s is distinguishable
  // from a 3.0 made of 3s. The API returns only the scores that occur.
  const counts = Object.fromEntries((data.distribution || []).map((d) => [d.rating_overall, d._count.rating_overall]));
  const maxCount = Math.max(1, ...Object.values(counts));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Service feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What residents said after their report was closed. {data.total} response{data.total === 1 ? '' : 's'}.
          Averages are across every response, not just this page.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <AverageCard label="Overall experience" value={data.averages.rating_overall} hint="Everything taken together." />
        <AverageCard label="Speed" value={data.averages.rating_speed} hint="How quickly reports were dealt with." />
        <AverageCard label="Staff response" value={data.averages.rating_staff} hint="How residents were treated." />
      </div>

      {data.total > 0 && (
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Overall ratings, by score
          </div>
          <div className="mt-3 space-y-1.5">
            {[5, 4, 3, 2, 1].map((n) => (
              <div key={n} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{n} star</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${((counts[n] || 0) / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {counts[n] || 0}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {/* overflow-x-auto between the Card and the table: the Card's
            overflow-hidden clips the rounded corners AND the table's width,
            with no way to scroll. Every table in this app shipped that way
            once - see the note in CLAUDE.md. */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Report</th>
                <th className="px-4 py-3 font-medium">Overall</th>
                <th className="px-4 py-3 font-medium">Speed</th>
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Comment</th>
                <th className="px-4 py-3 font-medium">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No feedback yet. It is offered to a resident once their report is closed.
                  </td>
                </tr>
              ) : data.items.map((f) => (
                <tr key={f.feedback_id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="font-medium tabular-nums text-foreground">{f.reference || '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {KIND_LABEL[f.kind]}{f.subject ? ` · ${humanize(f.subject)}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3"><StarRow value={f.rating_overall} label="Overall" /></td>
                  <td className="px-4 py-3"><StarRow value={f.rating_speed} label="Speed" /></td>
                  <td className="px-4 py-3"><StarRow value={f.rating_staff} label="Staff" /></td>
                  <td className="px-4 py-3">
                    {f.comment ? (
                      <span className="flex max-w-md gap-1.5 text-foreground">
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        {f.comment}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No comment</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted-foreground">
                    {fmt(f.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">Page {data.page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
