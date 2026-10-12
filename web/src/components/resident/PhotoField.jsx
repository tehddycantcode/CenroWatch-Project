import { useEffect, useRef, useState } from 'react';

// File picker with thumbnail previews. `accept` defaults to images; pass a
// different accept string for documents.
//
// MULTI-FILE SINCE 2026-10-12, and the contract changed with it: onChange now
// receives an ARRAY of File, always - `[]` rather than null when nothing is
// chosen. Every call site was updated. A component that sometimes emitted a
// File and sometimes an array would put the branch in five places instead of
// none, and the one that got it wrong would post `[object File]` as a filename.
//
// `max` caps the selection client-side. The server caps it too (MAX_FILES in
// middlewares/upload.js) - this one only exists so a resident is told before
// they upload ten megabytes, not after.
export default function PhotoField({
  onChange,
  accept = 'image/*',
  label = 'Tap to upload photos',
  max = 5,
}) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [notice, setNotice] = useState('');

  // The chosen files are the single source of truth; the preview URLs are
  // derived from them here so that createObjectURL and revokeObjectURL happen
  // in ONE scope, on the SAME value. React runs this cleanup when the list
  // changes and again on unmount, so every URL this component mints is released
  // exactly once, by construction rather than by remembering to.
  useEffect(() => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    const urls = images.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u.url));
  }, [files]);

  function emit(next) {
    setFiles(next);
    onChange(next);
  }

  function handle(e) {
    const picked = Array.from(e.target.files || []);
    // Cleared so picking the SAME file again still fires a change event.
    if (inputRef.current) inputRef.current.value = '';
    if (!picked.length) return;
    // Appended, not replaced: on a phone the camera and the gallery are two
    // separate trips through this picker, and replacing would silently discard
    // the first one.
    const combined = [...files, ...picked];
    if (combined.length > max) {
      setNotice(`Up to ${max} files. The extra ones were not added.`);
      emit(combined.slice(0, max));
      return;
    }
    setNotice('');
    emit(combined);
  }

  function removeAt(i) {
    setNotice('');
    emit(files.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/30 px-4 py-6 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
      >
        {previews.length > 0 ? (
          <span className="flex flex-wrap items-center justify-center gap-2">
            {previews.map((p) => (
              <img key={p.url} src={p.url} alt={p.name} className="h-20 w-auto rounded-md object-cover img-outline" />
            ))}
          </span>
        ) : (
          <span>{label}</span>
        )}
        {files.length > 0 && files.length < max && (
          <span className="text-xs">Tap again to add another ({files.length} of {max})</span>
        )}
      </button>

      {files.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="shrink-0 font-medium text-destructive hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice && <p className="mt-1 text-xs text-destructive">{notice}</p>}

      <input ref={inputRef} type="file" accept={accept} multiple onChange={handle} className="hidden" />
    </div>
  );
}
