import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { fmtDate } from '@/lib/staff';

// Shared status-change timeline for the complaint/wildlife/request detail pages.
export default function StatusHistory({ history }) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Status history</h2>
      {!history || history.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No status changes yet.</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {history.map((h) => (
            <li key={h.id} className="border-l-2 border-primary/30 pl-4">
              <div className="flex items-center gap-2 text-sm">
                <StatusBadge status={h.old_status} />
                <span className="text-muted-foreground">→</span>
                <StatusBadge status={h.new_status} />
              </div>
              {h.note && <p className="mt-1 text-sm text-foreground">{h.note}</p>}
              <div className="mt-0.5 text-xs text-muted-foreground">{fmtDate(h.changed_at)}</div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
