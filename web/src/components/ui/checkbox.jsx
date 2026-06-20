import * as React from 'react';
import { cn } from '@/lib/utils';

// Native checkbox, brand-accented. `accent-brand-primary` paints the checked fill.
const Checkbox = React.forwardRef(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      'mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-input accent-brand-primary',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      className
    )}
    {...props}
  />
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
