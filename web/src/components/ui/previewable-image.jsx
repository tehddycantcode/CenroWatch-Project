import { useEffect, useRef, useState } from 'react';

// A species photo you can open at full size.
//
// WHY THIS EXISTS. Every species photo on the site was `object-cover`, which
// fills its box by CROPPING - and the catalogue photos are landscape wildlife
// shots, so the thing being cropped is the animal. On the wildlife form that is
// actively harmful: the photo is there so a resident can check they picked the
// right species, and a reference photo with the head or tail cut off is worse
// than no reference photo, because it still looks like an answer.
//
// The card keeps a fixed height so the form does not jump as you change
// species, but the image inside is `object-contain` - letterboxed on a muted
// panel rather than cropped - and clicking it opens the whole frame.
export default function PreviewableImage({ src, alt, caption, className = '', imgClassName = '' }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);
  const openerRef = useRef(null);

  // Escape closes, and focus goes to the close button on open and back to the
  // thumbnail on close, so keyboard users are not dropped at the top of the
  // page. Keyed on `open` alone: adding anything else here can leave focus on
  // the opener while the overlay is up.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={openerRef}
        onClick={() => setOpen(true)}
        title={caption || undefined}
        className={`group relative block w-full overflow-hidden rounded-md bg-muted ${className}`}
      >
        <img src={src} alt={alt} loading="lazy" className={`h-full w-full object-contain ${imgClassName}`} />
        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          View full photo
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4"
          onClick={() => { setOpen(false); openerRef.current?.focus(); }}
        >
          {/* The image stops the click so tapping the photo itself does not
              close the thing you just opened. */}
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] max-w-full rounded-md object-contain"
          />
          {caption && <p className="mt-2 max-w-xl text-center text-xs text-white/80">{caption}</p>}
          <button
            type="button"
            ref={closeRef}
            onClick={() => { setOpen(false); openerRef.current?.focus(); }}
            className="mt-3 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black"
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}
