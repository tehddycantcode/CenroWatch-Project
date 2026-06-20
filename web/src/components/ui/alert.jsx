import * as React from 'react';
import { cn } from '@/lib/utils';
import { AlertIcon } from './icons';

// Lightweight inline alert for form errors / notices.
function Alert({ className, variant = 'destructive', children }) {
  const styles =
    variant === 'destructive'
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : 'border-border bg-muted text-foreground';
  return (
    <div role="alert" className={cn('flex items-start gap-2 rounded-lg border px-3.5 py-3 text-sm', styles, className)}>
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export { Alert };
