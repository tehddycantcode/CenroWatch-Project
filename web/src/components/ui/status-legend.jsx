import { cn } from '@/lib/utils';
import { STAGE_TL, COPY_TL } from '@/lib/tagalog';

// Legend for the recent-activity lists: the three lifecycle stages (adviser
// model, see statusStage in lib/reports.js). Every badge color maps to one
// stage; Rejected/Deceased badges stay red and carry their own label, so they
// need no legend entry. Render as the first row of a `divide-y` Card so the
// separator comes for free.
//
// This is the one place the English/Tagalog mapping is taught. The badges
// themselves stay English so a row's layout can't break on a narrow phone -
// a resident reads the pairing here once and carries it to every badge.
const ITEMS = [
  { dot: 'bg-amber-400', label: 'Submitted' },
  { dot: 'bg-blue-500', label: 'Under review' },
  { dot: 'bg-green-500', label: 'Finished' },
];

export function StatusLegend({ className }) {
  return (
    <div className={cn('bg-muted/30 px-4 py-2.5', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-xs font-medium text-foreground">
          {COPY_TL.legendIntro}
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {ITEMS.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5 text-xs">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', item.dot)} aria-hidden="true" />
              <span className="text-muted-foreground">
                {item.label}
                <span className="text-muted-foreground/70"> / {STAGE_TL[item.label]}</span>
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
