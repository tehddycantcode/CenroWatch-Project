import { useState } from 'react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/ui/brand-mark';

const BOX = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-14 w-14' };

// Official CENRO Cabuyao seal (served from /public). Falls back to the leaf
// BrandMark if the image is missing/broken, so the build is never blocked and a
// missing asset degrades gracefully instead of showing a broken-image icon.
export function CenroLogo({
  withWordmark = false,
  withSubtitle = false,
  invert = false,
  size = 'md',
  className,
}) {
  const [broken, setBroken] = useState(false);
  if (broken) return <BrandMark withWordmark={withWordmark} invert={invert} className={className} />;

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'flex items-center justify-center overflow-hidden rounded-xl shadow-soft',
          invert && 'bg-white p-1',
          BOX[size]
        )}
      >
        <img
          src="/cenro-logo.png"
          alt="CENRO Cabuyao seal"
          className="h-full w-full object-contain"
          onError={() => setBroken(true)}
        />
      </span>
      {withWordmark && (
        <span className="leading-tight">
          <span className={cn('block text-lg font-bold tracking-tight', invert ? 'text-white' : 'text-foreground')}>
            CENROWATCH
          </span>
          {withSubtitle && (
            <span className={cn('block text-[11px] font-medium', invert ? 'text-white/70' : 'text-muted-foreground')}>
              CENRO Cabuyao
            </span>
          )}
        </span>
      )}
    </span>
  );
}
