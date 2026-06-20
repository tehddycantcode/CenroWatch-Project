import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-11 w-full rounded-lg border border-input bg-muted/40 px-3.5 py-2.5 text-sm text-foreground shadow-sm transition-colors',
      'placeholder:text-muted-foreground',
      'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
      'disabled:cursor-not-allowed disabled:opacity-60',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
