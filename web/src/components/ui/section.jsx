import { cn } from '@/lib/utils';
import { IconChip } from '@/components/ui/icon-chip';

// Subtle organic divider between page sections (light, nature-themed).
export function LeafDivider({ className }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-2 text-brand-light', className)} aria-hidden="true">
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-brand-light" />
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 18C6 9 12 4 20 4c0 8-5 14-14 14Z" />
        <path d="M6 18 18 6" />
      </svg>
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-brand-light" />
    </div>
  );
}

// One step in the "How it works" strip. `titleTl` is the Tagalog companion for
// the step name - the three steps are the first thing a first-time reporter
// reads, so they carry both languages.
export function Step({ n, icon, title, titleTl, desc, tone = 'primary' }) {
  return (
    <div className="flex flex-col items-center text-center">
      <IconChip icon={icon} tone={tone} size="lg" />
      <div className="mt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Step {n}</div>
      <div className="mt-1 font-semibold text-foreground">
        {title}
        {titleTl && <span className="font-normal text-muted-foreground"> / {titleTl}</span>}
      </div>
      <p className="mt-1 max-w-[16rem] text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
