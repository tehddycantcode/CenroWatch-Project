import { cva } from 'class-variance-authority';

// Variant classes for <Button>. Split from button.jsx so the component file
// only exports components (react-refresh Fast Refresh boundary).
// Focus uses `outline`, not `ring`. Tailwind's ring is a box-shadow, and the
// bare `transition` shorthand animates box-shadow - so the focus indicator used
// to FADE IN, leaving keyboard users with no marker for the first ~150ms.
// Outline is not in the transition list, so it appears instantly. The property
// list is spelled out for the same reason: `transition` alone is too broad.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform,filter] duration-150 ease-out active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-br from-brand-primary to-brand-accent text-primary-foreground shadow-soft hover:shadow-soft-md hover:brightness-[1.05]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        destructive: 'bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90',
      },
      size: {
        default: 'h-11 px-5 py-2.5',
        sm: 'h-9 px-3',
        lg: 'h-12 px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);
