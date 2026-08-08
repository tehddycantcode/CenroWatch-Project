import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRIVACY_SECTIONS, PRIVACY_SUMMARY, PRIVACY_UPDATED } from '@/lib/privacy';

// The full notice. Used on the standalone /privacy page and inside the
// expandable panel next to a consent checkbox.
export function PrivacyNoticeBody({ className }) {
  return (
    <div className={cn('space-y-5', className)}>
      {PRIVACY_SECTIONS.map((s) => (
        <section key={s.title}>
          <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
          {s.body.map((p) => (
            <p key={p} className="mt-1.5 text-sm text-muted-foreground">{p}</p>
          ))}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">Last updated {PRIVACY_UPDATED}.</p>
    </div>
  );
}

// Shown directly above a consent checkbox: a one-paragraph summary anyone will
// actually read, plus the full notice on demand. Expanding keeps the resident
// on the form so nothing they have typed is lost.
export function PrivacyDisclosure({ className }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('rounded-lg border bg-muted/30 p-3.5', className)}>
      <p className="text-xs leading-relaxed text-muted-foreground">{PRIVACY_SUMMARY}</p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        {open ? 'Hide the full privacy notice' : 'Read the full privacy notice'}
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="mt-3 max-h-72 overflow-y-auto border-t pt-3">
          <PrivacyNoticeBody />
        </div>
      )}
    </div>
  );
}
