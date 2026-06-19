import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn/ui className helper: merge conditional + Tailwind classes safely.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
