import { cn } from '@/lib/utils';

// Legend for the recent-activity lists: the three lifecycle stages (adviser
// model, see statusStage in lib/reports.js). Every badge color maps to one
// stage; Rejected/Deceased badges stay red and carry their own label, so they
// need no legend entry. Render as the first row of a `divide-y` Card so the
// separator comes for free.
const ITEMS = [
  { dot: 'bg-amber-400', label: 'Submitted' },
  { dot: 'bg-blue-500', label: 'Under review' },
  { dot: 'bg-green-500', label: 'Finished' },
];

export function StatusLegend({ className }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-x-4 gap-y-1 bg-muted/30 px-4 py-2', className)}>
      {ITEMS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', item.dot)} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}
