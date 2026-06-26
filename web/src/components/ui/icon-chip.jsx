import { cn } from '@/lib/utils';

// A lucide icon inside a soft tinted rounded square. Used for stats, action cards,
// and service tiles - the consistent "professional icon" treatment across the app.
const TONES = {
  primary: 'bg-brand-tint text-brand-primary',
  forest: 'bg-brand-tint text-brand-forest',
  amber: 'bg-amber-100 text-amber-700',
  violet: 'bg-violet-100 text-violet-700',
  blue: 'bg-blue-100 text-blue-700',
};
const BOX = { sm: 'h-9 w-9 rounded-lg', md: 'h-11 w-11 rounded-xl', lg: 'h-14 w-14 rounded-2xl' };
const GLYPH = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' };

export function IconChip({ icon: Icon, tone = 'primary', size = 'md', className }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', BOX[size], TONES[tone] || TONES.primary, className)}>
      <Icon className={GLYPH[size]} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}
