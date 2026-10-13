import { useRef, useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { staffApi, isPdfPath } from '@/lib/api';
import { Button } from '@/components/ui/button';
import ConfirmDialog, { useConfirm } from '@/components/ui/confirm-dialog';

// The signed closure document: the wet-signed certification or chain-of-custody
// form that comes back on paper, scanned and filed against the case.
//
// THIS IS NOT THE WORK PROOF. The photo attached when a case is Resolved or
// Completed is CENRO's own evidence that the job was done, it is REQUIRED to
// close the case, and it stays internal. This is the counter-signed paperwork
// handed back, it is OPTIONAL, and it is the one upload a resident can open.
// The copy below says so, because a staff member looking at two upload boxes
// needs to know which one the resident will see.
//
// PDF OR IMAGE. An office scanner produces a PDF; the status endpoint's proof
// field takes images only, which is why this is a separate endpoint rather than
// another field on the status form.
export default function ClosureCertificate({ kind, id, path, status, onChange }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmProps, ask] = useConfirm();

  const resource = staffApi[kind === 'wildlife' ? 'wildlife' : kind === 'request' ? 'requests' : 'complaints'];

  // Mirrors the server rule in closureCertificate.service. Shown as a disabled
  // state with the reason rather than a 409 after the file has been chosen.
  const CLOSED = {
    complaint: ['Resolved'],
    wildlife: ['Released', 'Transferred'],
    request: ['Completed'],
  };
  const closedWord = kind === 'wildlife' ? 'released or transferred' : kind === 'request' ? 'completed' : 'resolved';
  const canAttach = CLOSED[kind].includes(status);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('certificate', file);
      await resource.uploadCertificate(id, form);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onChange?.();
    } catch (e) {
      setError(e.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    // The consequence stated here is one the code keeps: the file is deleted
    // from storage and the resident's download disappears.
    const ok = await ask({
      title: 'Remove the signed document?',
      body: 'The file is deleted permanently and the resident will no longer be able to download it. Use this only for a wrong or unreadable scan. This cannot be undone.',
      confirmLabel: 'Remove document',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await resource.removeCertificate(id);
      onChange?.();
    } catch (e) {
      setError(e.message || 'Could not remove the document.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        The signed certification or turnover form, scanned back in.{' '}
        <strong className="text-foreground">The resident can download this one.</strong>{' '}
        Optional &mdash; attach it whenever the signed paper comes back. PDF or photo.
      </p>

      {path ? (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {isPdfPath(path) ? (
            <a
              href={path}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm font-medium text-primary hover:underline"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              View signed document (PDF)
            </a>
          ) : (
            <a href={path} target="_blank" rel="noreferrer" title="Open full size">
              <img src={path} alt="signed closure document" className="max-h-44 rounded-lg border" />
            </a>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={remove}>
            Replace or remove
          </Button>
        </div>
      ) : !canAttach ? (
        <p className="mt-3 rounded-md border bg-muted/40 p-3 text-sm">
          A signed document can be attached once this case is {closedWord}.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            aria-label="Choose the signed document"
            onChange={(e) => setFile((e.target.files || [])[0] || null)}
            className="block max-w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
          />
          <Button size="sm" disabled={!file} loading={busy} onClick={upload}>
            Attach
          </Button>
        </div>
      )}

      {path && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Available to the resident on their tracking page and in the app.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
