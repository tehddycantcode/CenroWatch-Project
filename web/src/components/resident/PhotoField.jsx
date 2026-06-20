import { useEffect, useRef, useState } from 'react';

// File input with a thumbnail preview. `accept` defaults to images; pass a
// different accept string for documents. Calls onChange(file | null).
export default function PhotoField({ onChange, accept = 'image/*', label = 'Tap to upload a photo' }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState('');

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  function handle(e) {
    const file = e.target.files?.[0] || null;
    setName(file?.name || '');
    if (preview) URL.revokeObjectURL(preview);
    const isImage = file && file.type.startsWith('image/');
    setPreview(isImage ? URL.createObjectURL(file) : null);
    onChange(file);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = '';
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setName('');
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
          <img src={preview} alt="preview" className="h-28 w-auto rounded-md object-cover" />
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
