import * as React from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from './button-variants';
import { Spinner } from './icons';

const Button = React.forwardRef(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
);
Button.displayName = 'Button';

export { Button };
