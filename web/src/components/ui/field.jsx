import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

// Label + control + (error|hint) wrapper. Keeps every form field consistent.
function FormField({ id, label, error, hint, className, children }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export { FormField };
