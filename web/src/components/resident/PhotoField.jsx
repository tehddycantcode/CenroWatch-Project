import { useEffect, useRef, useState } from 'react';

// File input with a thumbnail preview. `accept` defaults to images; pass a
// different accept string for documents. Calls onChange(file | null).
export default function PhotoField({ onChange, accept = 'image/*', label = 'Tap to upload a photo' }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const name = file?.name || '';

  // The chosen file is the single source of truth; the preview URL is derived
  // from it here so that createObjectURL and revokeObjectURL happen in ONE
  // scope, on the SAME const. React runs this cleanup when the file changes and
  // again on unmount, so every URL this component mints is released exactly
  // once, by construction rather than by remembering to.
  //
  // Previously the URL was created in the change handler and revoked in three
  // separate places. That worked, but it spread one object's lifetime across
  // three functions, and a handler that fired twice before the next render
  // would have read a stale `preview` and leaked the first URL.
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreview(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function handle(e) {
    const picked = e.target.files?.[0] || null;
    setFile(picked);
    onChange(picked);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = '';
    setFile(null);
    onChange(null);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/30 px-4 py-6 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
      >
        {preview ? (
          <img src={preview} alt="preview" className="h-28 w-auto rounded-md object-cover img-outline" />
        ) : (
          <span>{name || label}</span>
        )}
      </button>
      {name && (
        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{name}</span>
          <button type="button" onClick={clear} className="font-medium text-destructive hover:underline">
            Remove
          </button>
        </div>
      )}
      <input ref={inputRef} type="file" accept={accept} onChange={handle} className="hidden" />
    </div>
  );
}
