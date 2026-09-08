import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TIMELINE_TL } from '@/lib/tagalog';

// Canonical resident-visible step sequences per report kind. Built without an API
// change - the report's current status is mapped onto its flow to mark progress.
const FLOWS = {
  // Approved is where CENRO accepts the complaint and the response clock starts,
  // so the resident sees it as its own step rather than a silent state change.
  complaint: ['Submitted', 'Under Review', 'Approved', 'In Progress', 'Resolved'],
  wildlife: ['Submitted', 'Under Review', 'In Progress', 'Completed'],
  request: ['Submitted', 'Under Review', 'Scheduled', 'Released'],
};

// Step names are spaced ("Under Review") but the API sends the raw enum
// ("Under_Review"), so a plain lowercase compare never matched and every live
// complaint fell through to index 0 - a resident whose report was In_Progress
// saw the timeline stuck on "Submitted". Normalising underscores fixes that.
const norm = (v) => String(v || '').toLowerCase().replace(/[\s_]+/g, ' ').trim();

// Best-effort, case-insensitive index of the current status within the flow.
function statusIndex(flow, status) {
  const s = norm(status);
  const i = flow.findIndex((f) => norm(f) === s);
  if (i >= 0) return i;
  if (['rejected', 'closed', 'cancelled'].includes(s)) return flow.length - 1;
  return 0;
}

export function StatusTimeline({ kind, status, times = {} }) {
  const flow = FLOWS[kind] || FLOWS.complaint;
  const active = statusIndex(flow, status);
  // Per-kind, because "Released" is a freed animal on a turnover but a
  // delivered service on a request.
  const tl = TIMELINE_TL[kind] || TIMELINE_TL.complaint;
  return (
    <ol className="space-y-0">
      {flow.map((label, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <li key={label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold',
                  done
                    ? 'border-primary bg-primary text-white'
                    : current
                      ? 'border-primary text-primary'
                      : 'border-muted-foreground/30 text-muted-foreground'
                )}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : i + 1}
              </span>
              {i < flow.length - 1 && (
                <span className={cn('min-h-[28px] w-0.5 flex-1', i < active ? 'bg-primary' : 'bg-border')} />
              )}
            </div>
            <div className="pb-6">
              <div className={cn('text-sm font-semibold', current ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground')}>
                {label}
                {tl[label] && (
                  <span className="ml-1.5 font-normal text-muted-foreground">/ {tl[label]}</span>
                )}
              </div>
              {times[label] && (
                <div className="text-xs tabular-nums text-muted-foreground">{times[label]}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
