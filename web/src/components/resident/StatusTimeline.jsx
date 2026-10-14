import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TIMELINE_TL } from '@/lib/tagalog';

// Canonical resident-visible step sequences per report kind. Each step carries
// the raw backend status values (schema.prisma enums) that land on it, so the
// report's current status is mapped onto its flow to mark progress - no API
// change needed.
//
// MATCH ON THE STATUS, NOT THE LABEL. The step labels are a resident-friendly
// story ("In Progress"); the API sends the real enum ("Under_Care"). Matching
// the label alone - the old behaviour - meant NONE of the wildlife statuses
// matched their flow (a turnover is never literally "In Progress"), and neither
// did a request's Approved or Completed, so a Transferred animal or a Completed
// request showed the tracker frozen on step 1 while the case was actually
// finished. Every real enum value now appears in exactly one step's `match`.
const FLOWS = {
  // Approved is where CENRO accepts the complaint and the response clock starts,
  // so the resident sees it as its own step rather than a silent state change.
  complaint: [
    { label: 'Submitted', match: ['Pending'] },
    { label: 'Under Review', match: ['Under_Review'] },
    { label: 'Approved', match: ['Approved'] },
    { label: 'In Progress', match: ['In_Progress'] },
    { label: 'Resolved', match: ['Resolved'] },
  ],
  // Pending_Review / Priority_Review are the two "awaiting assessment" states
  // (the second is auto-set for endangered animals); Under_Care is the animal in
  // hand; and Released / Transferred / Deceased are the three ways the case
  // ends. All three terminal outcomes land on "Completed" - which one it was is
  // named in the updates list below the tracker.
  wildlife: [
    { label: 'Submitted', match: ['Pending_Review'] },
    { label: 'Under Review', match: ['Priority_Review'] },
    { label: 'In Progress', match: ['Under_Care'] },
    { label: 'Completed', match: ['Released', 'Transferred', 'Deceased'] },
  ],
  request: [
    { label: 'Submitted', match: ['Pending'] },
    { label: 'Under Review', match: ['Approved'] },
    { label: 'Scheduled', match: ['Scheduled'] },
    { label: 'Completed', match: ['Completed'] },
  ],
};

const norm = (v) => String(v || '').toLowerCase().replace(/[\s_]+/g, ' ').trim();

// A report closed OFF the happy path - a dismissed complaint or request. Not a
// step any flow lists, so it lights the final step (the case is closed) with the
// real outcome shown in the updates list. Wildlife's Deceased is handled by its
// own flow entry above, so it is not here.
const CLOSED = ['rejected', 'closed', 'cancelled'];

// Case-insensitive index of the current status within the flow.
function statusIndex(flow, status) {
  const s = norm(status);
  const byStatus = flow.findIndex((step) => step.match.some((m) => norm(m) === s));
  if (byStatus >= 0) return byStatus;
  if (CLOSED.includes(s)) return flow.length - 1;
  // Last resort: an unforeseen status named like a step still lands on it rather
  // than defaulting to "Submitted".
  const byLabel = flow.findIndex((step) => norm(step.label) === s);
  return byLabel >= 0 ? byLabel : 0;
}

export function StatusTimeline({ kind, status, times = {} }) {
  const flow = FLOWS[kind] || FLOWS.complaint;
  const active = statusIndex(flow, status);
  // Per-kind, because "Released" is a freed animal on a turnover but a
  // delivered service on a request.
  const tl = TIMELINE_TL[kind] || TIMELINE_TL.complaint;
  return (
    <ol className="space-y-0">
      {flow.map((step, i) => {
        const label = step.label;
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
