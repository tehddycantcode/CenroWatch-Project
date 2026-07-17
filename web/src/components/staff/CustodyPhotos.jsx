import { useRef, useState } from 'react';
import { staffApi } from '@/lib/api';
import { Button } from '@/components/ui/button';

// Chain-of-custody photo gallery + uploader for the staff wildlife detail view
// (manuscript Objective 2.3). Photos document the animal's condition, handling,
// and transfer. Staff can append multiple images and remove any one.
export default function CustodyPhotos({ id, photos = [], onChange }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function upload() {
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      files.forEach((f) => form.append('photos', f));
      await staffApi.wildlife.addCustodyPhotos(id, form);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
      onChange?.();
    } catch (e) {
      setError(e.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(path) {
    setBusy(true);
    setError('');
    try {
      await staffApi.wildlife.removeCustodyPhoto(id, path);
      onChange?.();
    } catch (e) {
      setError(e.message || 'Could not remove the photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Custody photos ({photos.length})
      </div>

      {photos.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No custody photos yet. Document the animal&apos;s condition, handling, and transfer below.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <div key={p.key} className="group relative">
              <a href={p.url} target="_blank" rel="noreferrer">
                <img src={p.url} alt="chain of custody" className="h-28 w-full rounded-lg border object-cover" />
              </a>
              <button
                type="button"
                onClick={() => remove(p.key)}
                disabled={busy}
                title="Remove photo"
                className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          aria-label="Choose custody photos"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
          className="block max-w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
        />
        <Button size="sm" disabled={!files.length} loading={busy} onClick={upload}>
          Upload{files.length ? ` (${files.length})` : ''}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
