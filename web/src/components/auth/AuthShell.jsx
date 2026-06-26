import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { BrandMark } from '@/components/ui/brand-mark';

// Shared two-column auth layout. Left: CENROWATCH brand panel (forest gradient).
// Right: the form. On small screens the brand panel collapses to a compact header.
const points = [
  'Report environmental concerns with photos and a map pin',
  'Turn over rescued wildlife - endangered species get priority',
  'Track every report across all 18 barangays of Cabuyao',
];

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Brand panel (desktop) */}
      <div className="relative hidden flex-col justify-between bg-eco-gradient p-12 text-white lg:flex">
        <Link to="/" className="w-fit">
          <BrandMark withWordmark invert />
        </Link>

        <div className="max-w-md">
          <h1 className="font-display text-4xl leading-tight">
            Guard Cabuyao&apos;s environment, together.
          </h1>
          <ul className="mt-8 space-y-4">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm text-white/90">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/60">
          CENRO Cabuyao - Pamantasan ng Cabuyao - BSIT Capstone
        </p>
      </div>

      {/* Form side */}
      <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md">
          {/* Compact brand header (mobile) */}
          <Link to="/" className="mb-8 flex w-fit lg:hidden">
            <BrandMark withWordmark />
          </Link>

          <div className="mb-6">
            <h2 className="font-display text-3xl text-foreground">{title}</h2>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>

          {children}

          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
