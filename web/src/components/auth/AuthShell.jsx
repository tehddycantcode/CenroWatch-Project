import { Link } from 'react-router-dom';

// Shared two-column auth layout. Left: CENROWATCH brand panel (Figma green hero).
// Right: the form. On small screens the brand panel collapses to a compact header.
const points = [
  'Report environmental concerns with photos and a map pin',
  'Turn over rescued wildlife — endangered species get priority',
  'Track every report across all 18 barangays of Cabuyao',
];

function Logo({ className = '' }) {
  return (
    <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground ${className}`}>
      CW
    </span>
  );
}

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Brand panel (desktop) */}
      <div className="relative hidden flex-col justify-between bg-brand-forest p-12 text-white lg:flex">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-sm font-bold text-brand-forest">
            CW
          </span>
          <span className="text-lg font-bold tracking-tight">CENROWATCH</span>
        </Link>

        <div className="max-w-md">
          <h1 className="font-display text-4xl leading-tight">
            Guard Cabuyao&apos;s environment, together.
          </h1>
          <ul className="mt-8 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm text-white/85">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/60">
          CENRO Cabuyao · Pamantasan ng Cabuyao — BSIT Capstone
        </p>
      </div>

      {/* Form side */}
      <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md">
          {/* Compact brand header (mobile) */}
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo />
            <span className="text-lg font-bold tracking-tight">CENROWATCH</span>
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
