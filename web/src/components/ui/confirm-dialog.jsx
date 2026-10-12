import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

// A confirmation step for an action that cannot be taken back.
//
// Written rather than installed: there is no Dialog primitive anywhere in
// web/src/components/ui, and adding a headless-UI dependency for one modal is
// more surface than this needs. Roughly 70 lines against a package.
//
// Deliberately NOT window.confirm(): that cannot carry the explanation of WHAT
// is irreversible, which is the only reason to interrupt someone. It also
// blocks the event loop and is styled by the browser.
//
// ACCESSIBILITY, all load-bearing rather than decorative:
//  - role="dialog" + aria-modal so a screen reader announces it as a dialog
//  - focus moves to the cancel button on open, so the SAFE option is the one
//    already selected and a stray Enter does nothing
//  - Escape cancels
//  - focus returns to whatever opened it on close
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    cancelRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Return focus to the control that opened it, so keyboard users are not
      // dumped at the top of the document.
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop. Clicking it cancels - a confirmation is not a decision that
          has to be forced, and the destructive path still needs the button. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 cursor-default bg-black/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md rounded-2xl border bg-card p-5 shadow-soft"
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="mt-2 text-sm text-muted-foreground">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={destructive ? 'destructive' : 'default'}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Turns the dialog into something a handler can `await`, so a call site reads
// as a straight line instead of being split across two callbacks:
//
//   const [confirmProps, ask] = useConfirm();
//   if (!(await ask({ title: '...', body: '...' }))) return;
//   ...do the thing
//   <ConfirmDialog {...confirmProps} />
export function useConfirm() {
  const [state, setState] = useState({ open: false, opts: {} });
  const resolveRef = useRef(null);

  const ask = useCallback((opts) => {
    setState({ open: true, opts });
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value) => {
    setState({ open: false, opts: {} });
    // Cleared before resolving: a caller that re-opens the dialog inside its
    // own continuation must not have its new resolver overwritten by this one.
    const r = resolveRef.current;
    resolveRef.current = null;
    if (r) r(value);
  }, []);

  return [
    { ...state.opts, open: state.open, onConfirm: () => settle(true), onCancel: () => settle(false) },
    ask,
  ];
}
