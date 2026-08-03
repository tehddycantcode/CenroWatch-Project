import { humanize } from '@/lib/reports';

// Progress notes CENRO staff left on a report, newest first. The backend
// sends only the new status, the note, and when it changed - never who made
// the change - so no staff identity is exposed to residents.
export function ReportUpdates({ history = [] }) {
  if (!history.length) return null;

  return (
    <ol className="space-y-4">
      {history.map((h) => (
        <li key={h.changed_at} className="border-l-2 border-border pl-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-sm font-semibold text-foreground">{humanize(h.new_status)}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {new Date(h.changed_at).toLocaleString()}
            </span>
          </div>
          {h.note ? (
            <p className="mt-1 text-sm text-foreground">{h.note}</p>
          ) : (
            <p className="mt-1 text-sm italic text-muted-foreground">Status updated.</p>
          )}
        </li>
      ))}
    </ol>
  );
}
