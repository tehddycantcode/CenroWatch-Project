import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from './icons';

// Native <select> styled to match the design system (no extra dependency).
const Select = React.forwardRef(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'flex h-11 w-full appearance-none rounded-lg border border-input bg-muted/40 px-3.5 pr-9 text-sm text-foreground shadow-soft transition-colors',
        'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  </div>
));
Select.displayName = 'Select';

export { Select };
