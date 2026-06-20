import { cn } from '@/lib/utils';
import { statusTone } from '@/lib/reports';
import { humanize } from '@/lib/reports';

const TONES = {
  green: 'bg-green-100 text-green-800',
  blue: 'bg-blue-100 text-blue-800',
  amber: 'bg-amber-100 text-amber-800',
  purple: 'bg-purple-100 text-purple-800',
  red: 'bg-red-100 text-red-800',
  gray: 'bg-muted text-muted-foreground',
};

export function Badge({ tone = 'gray', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone] || TONES.gray,
        className
      )}
    >
      {children}
    </span>
  );
}

// Convenience: a status pill that colors itself from the status value.
export function StatusBadge({ status, className }) {
  return (
    <Badge tone={statusTone(status)} className={className}>
      {humanize(status)}
    </Badge>
  );
}
