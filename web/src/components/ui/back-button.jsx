import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

// A back arrow that returns to the previous page (browser history). When there
// is no in-app history to go back to — e.g. the page was opened via a direct
// link or right after login — it falls back to `fallback` (usually the module
// dashboard) so it never dumps the user out of the app. Use `invert` on dark
// panels (the auth brand panel).
export function BackButton({ fallback = '/', invert = false, label = 'Go back', className }) {
  const navigate = useNavigate();
  // React Router stamps an incrementing `idx` on each history entry; 0 means
  // this is the first entry in the session, so there is nothing to return to.
  const canGoBack = (window.history.state?.idx ?? 0) > 0;

  function onBack() {
    if (canGoBack) navigate(-1);
    else navigate(fallback);
  }

  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-[0.96]',
        invert
          ? 'text-white/80 hover:bg-white/15 hover:text-white'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        className
      )}
    >
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
