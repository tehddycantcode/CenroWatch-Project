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
  const confirmRef = useRef(null);
  const dialogRef = useRef(null);
  const openerRef = useRef(null);

  // Focus capture/restore keys off `open` ALONE. It used to also depend on
  // `busy`, so a caller toggling busy mid-dialog ran the cleanup, threw focus
  // back to the opener behind the backdrop, then failed to re-focus the
  // now-disabled Cancel button - leaving Enter able to re-fire the action.
  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      // Return focus to the control that opened it, so keyboard users are not
      // dumped at the top of the document.
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape' && !busy) { onCancel(); return; }
      if (e.key !== 'Tab') return;
      // Focus can land on <body> if someone clicks the dialog's text, and from
      // there Tab escapes behind the backdrop - the same hole the cycle below
      // closes for the buttons. Pull it back in first.
      if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        cancelRef.current?.focus();
        return;
      }
      // Exactly two focusable controls, so the trap is a two-element cycle.
      // Without this, aria-modal is a claim the component does not honour: Tab
      // off Confirm lands behind the backdrop, on the control that opened this.
      const cancel = cancelRef.current;
      const confirm = confirmRef.current;
      if (!cancel || !confirm) return;
      const first = e.shiftKey ? cancel : confirm;
      const next = e.shiftKey ? confirm : cancel;
      if (document.activeElement === first) {
        e.preventDefault();
        next.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl border bg-card p-5 shadow-soft"
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="mt-2 text-sm text-muted-foreground">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
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
    // Settle any in-flight question as a cancel before replacing it, or its
    // awaiting handler never resumes.
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
    setState({ open: true, opts });
    return new Promise((resolve) => { resolveRef.current = resolve; });
  }, []);

  const settle = useCallback((value) => {
    setState({ open: false, opts: {} });
    // Cleared before resolving: a caller that re-opens the dialog inside its
    // own continuation must not have its new resolver overwritten by this one.
    const r = resolveRef.current;
    resolveRef.current = null;
    if (r) r(value);
  }, []);

  // Memoised on purpose: ConfirmDialog's effect lists onCancel in its deps, so a
  // fresh function on every render would re-run it whenever the parent
  // re-renders while open, bouncing focus to the opener and back to Cancel.
  const onConfirm = useCallback(() => settle(true), [settle]);
  const onCancel = useCallback(() => settle(false), [settle]);

  return [
    { ...state.opts, open: state.open, onConfirm, onCancel },
    ask,
  ];
}
