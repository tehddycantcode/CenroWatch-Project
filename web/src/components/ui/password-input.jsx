import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from './input';

// Password field with a show/hide eye toggle. Drop-in replacement for
// <Input type="password" ... /> — pass the same props (id, value, onChange, etc.).
//
// `noClipboard` blocks copy, cut, paste and drag-and-drop on the field. It is
// OPT-IN and used only on the change-password form, deliberately:
//
//   Blocking paste on SIGN-IN would be actively harmful. It is the single
//   loudest complaint about password UX, it breaks every password manager, and
//   both NIST SP 800-63B and the UK NCSC explicitly say verifiers SHOULD allow
//   pasting - because the alternative people pick is a short password they can
//   type. Do not spread this prop to LoginPage or RegisterPage.
//
// All four events are covered because they are four ways to do the same thing:
// the `copy`/`cut`/`paste` events fire however they were triggered (Ctrl+V, the
// context menu, middle-click paste on Linux), and `drop` is the one that does
// not go through the clipboard at all - dragging selected text into the field.
const PasswordInput = React.forwardRef(({ className, noClipboard, ...props }, ref) => {
  const [show, setShow] = React.useState(false);
  const blockClipboard = noClipboard
    ? {
        onCopy: (e) => e.preventDefault(),
        onCut: (e) => e.preventDefault(),
        onPaste: (e) => e.preventDefault(),
        onDrop: (e) => e.preventDefault(),
      }
    : null;
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={show ? 'text' : 'password'}
        className={cn('pr-11', className)}
        {...props}
        {...blockClipboard}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
