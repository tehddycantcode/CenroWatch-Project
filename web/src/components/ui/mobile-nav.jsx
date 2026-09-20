import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Phone-only collapsible navigation.
//
// WHY THIS EXISTS: the header nav in the landing page, StaffLayout and
// AdminLayout is `hidden sm:flex`, so below 640px it was not rendered at all.
// A staff member on a phone had no way to reach Complaints, Wildlife or
// Requests, and a signed-out visitor could not reach the map, the feed or
// Login - the header showed only the seal and one button.
//
// PHONE ONLY, DELIBERATELY. Both the toggle and the panel carry `sm:hidden`,
// so the breakpoint is 640px. No tablet is narrower than that (iPad portrait is
// 768), which means a tablet and a desktop keep the inline header nav and never
// see a hamburger. Anything that renders this must keep its own inline nav for
// `sm` and up - this component is an addition, not a replacement.
//
// ResidentLayout deliberately does NOT use this. It already has a fixed bottom
// tab bar, which beats a hamburger on a phone: it is always visible, reachable
// by thumb, and costs one tap instead of two.

// Long enough to read as a deliberate exit, short enough that a second tap
// never feels queued behind it.
const EXIT_MS = 150;

// Tailwind's `sm` breakpoint. Kept in sync with the `sm:hidden` classes below;
// the media query is what force-closes the panel (and releases the scroll lock)
// when a phone is rotated into a width where the inline nav takes over.
const PHONE_QUERY = '(max-width: 639.98px)';

export function MobileNav({ items, id = 'mobile-nav', label = 'Main', className, children }) {
  const [open, setOpen] = useState(false);
  // Tracked separately from `open` so the panel can play an exit animation
  // before it leaves the DOM. Rendering is gated on `open || closing`.
  const [closing, setClosing] = useState(false);
  const location = useLocation();
  const exitTimer = useRef(null);

  const mounted = open || closing;

  // Close without an exit animation. Used when the reason for closing is not
  // the user dismissing the panel - a route change or a resize past the
  // breakpoint - where animating something the user did not ask to dismiss
  // just delays the page they did ask for.
  function closeNow() {
    clearTimeout(exitTimer.current);
    setClosing(false);
    setOpen(false);
  }

  function closeAnimated() {
    if (!open) return;
    setOpen(false);
    setClosing(true);
    clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => setClosing(false), EXIT_MS);
  }

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  // A tapped link navigates, so the panel has done its job.
  useEffect(() => {
    closeNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Rotating a phone to landscape can cross 640px, where `sm:hidden` hides the
  // panel via CSS while React still thinks it is open - which would leave the
  // body scroll-locked with nothing on screen to explain why.
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    function onChange(e) {
      if (!e.matches) closeNow();
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') closeAnimated();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Stop the page scrolling behind the backdrop. Phone-only, so there is no
  // desktop scrollbar to remove and therefore no layout shift from doing this.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? closeAnimated() : setOpen(true))}
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className={cn(
          // h-10 w-10 is the 40x40 minimum hit area; the icons inside are 20px.
          'relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          // Named properties, never `transition: all`. `transform` rather than
          // `scale`: Tailwind 3 compiles scale-* into a transform, so naming
          // `scale` here would transition a property nothing is setting.
          'text-muted-foreground transition-[background-color,color,transform] hover:bg-accent hover:text-foreground',
          'active:scale-[0.96] sm:hidden',
          className
        )}
      >
        {/* Both icons stay mounted and cross-fade. Toggling which one renders
            would give the outgoing icon no exit, so the swap would pop. */}
        <NavIcon icon={Menu} shown={!open} />
        <NavIcon icon={X} shown={open} />
      </button>

      {mounted && (
        <>
          {/* Sits under the panel but over the page. `top-full` puts it below
              the header bar, so the header - and the toggle that closes this -
              stays visible and tappable.
              ABSOLUTE, NOT FIXED, and that is load-bearing: the landing header
              is `backdrop-blur`, and backdrop-filter makes an element the
              containing block for its position:fixed descendants. A `fixed
              inset-0 top-16` backdrop therefore resolved against the 64px-tall
              header instead of the viewport and computed to exactly zero
              height - present in the DOM, invisible on screen. Anchoring to the
              header on purpose sidesteps that entirely; h-screen then covers
              the viewport below it, and the sticky header keeps it in place
              while the page scrolls. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={closeAnimated}
            className={cn(
              'absolute inset-x-0 top-full z-40 h-screen cursor-default bg-foreground/20 sm:hidden',
              'motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-swift-out',
              open ? 'opacity-100' : 'opacity-0'
            )}
          />

          <nav
            id={id}
            aria-label={label}
            className={cn(
              'absolute inset-x-0 top-full z-50 border-b bg-background shadow-soft-md sm:hidden',
              open
                ? 'motion-safe:animate-nav-panel-in'
                : 'motion-safe:animate-nav-panel-out motion-reduce:hidden'
            )}
          >
            <ul className="flex flex-col gap-1 p-2">
              {items.map((item, i) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={closeAnimated}
                    className={({ isActive }) =>
                      cn(
                        // min-h-[44px] keeps every row a comfortable tap target
                        // even though the text alone is shorter than that.
                        'flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium',
                        'transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <span
                        className={cn(
                          'flex items-center gap-3',
                          open && 'motion-safe:animate-nav-item-in'
                        )}
                        // Staggered so the list reads as a sequence rather than
                        // one block appearing. Capped so a ten-item admin menu
                        // does not make the last row arrive noticeably late.
                        style={open ? { animationDelay: `${Math.min(i, 6) * 35}ms` } : undefined}
                      >
                        {item.icon && (
                          <item.icon
                            className="h-4 w-4 shrink-0"
                            strokeWidth={isActive ? 2.4 : 2}
                            aria-hidden="true"
                          />
                        )}
                        {item.label}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
            {children && <div className="border-t px-3 py-3">{children}</div>}
          </nav>
        </>
      )}
    </>
  );
}

// One icon of the cross-fade pair. Absolutely positioned so both occupy the
// same cell; scale 0.25 -> 1, opacity 0 -> 1 and blur 4px -> 0 are the values
// the design guidance specifies for an icon swap.
function NavIcon({ icon: Icon, shown }) {
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        'absolute h-5 w-5',
        'motion-safe:transition-[opacity,transform,filter] motion-safe:duration-300',
        'motion-safe:ease-swift-out',
        shown ? 'scale-100 opacity-100 blur-none' : 'scale-[0.25] opacity-0 blur-[4px]'
      )}
    />
  );
}
