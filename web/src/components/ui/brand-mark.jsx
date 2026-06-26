import { Leaf } from 'lucide-react';
import { cn } from '@/lib/utils';

// CENROWATCH brand mark: a leaf glyph in a rounded brand square. Replaces the
// literal "CW" text badge. `invert` for dark backgrounds; `withWordmark` adds the name.
export function BrandMark({ withWordmark = false, invert = false, className }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl shadow-soft',
          invert ? 'bg-white text-brand-forest' : 'bg-primary text-primary-foreground',
          className
        )}
      >
        <Leaf className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
      </span>
      {withWordmark && <span className="text-lg font-bold tracking-tight">CENROWATCH</span>}
    </span>
  );
}
