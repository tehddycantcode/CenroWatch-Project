import { cn } from '@/lib/utils';

// Legend for the recent-activity lists: maps the status badge colors to what
// they mean for a report's lifecycle. Dot colors mirror the tone families in
// statusTone() (lib/reports.js): amber = just submitted, blue = being worked
// on, green = finished. Render as the first row of a `divide-y` Card so the
// separator comes for free.
const ITEMS = [
  { dot: 'bg-amber-400', label: 'Submitted · awaiting action' },
  { dot: 'bg-blue-500', label: 'In progress' },
  { dot: 'bg-green-500', label: 'Finished' },
];

export function StatusLegend({ className }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 bg-muted/30 px-4 py-2', className)}>
      {ITEMS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', item.dot)} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}
