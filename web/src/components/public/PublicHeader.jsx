import { Link } from 'react-router-dom';
import { LayoutGrid, MapPin, FileText, Bird, Search, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { roleHome } from '@/lib/roles';
import { CenroLogo } from '@/components/ui/cenro-logo';
import { MobileNav } from '@/components/ui/mobile-nav';

// Shared by every public page (landing, map, feed, wildlife, track, anonymous
// report). Signed-in visitors reach these pages from inside the app, so the
// call to action is their dashboard, not a Login link.

const publicItems = [
  { to: '/map', label: 'Heat Map', icon: MapPin },
  { to: '/feed', label: 'Reports', icon: FileText },
  { to: '/wildlife', label: 'Wildlife', icon: Bird },
  { to: '/track', label: 'Track', icon: Search },
  { to: '/report-anonymous', label: 'Report Anonymously', icon: EyeOff },
  { to: '/privacy', label: 'Privacy', icon: ShieldCheck },
];

export default function PublicHeader() {
  const { isAuthenticated, user, loading } = useAuth();

  // Dashboard leads the list because it is the way back INTO the app from a
  // public page. It is role-aware: an Admin browsing the public map lands on
  // /admin/dashboard, not the resident one. While the session is still
  // resolving it is left out rather than guessed at - pointing it at /login
  // for a visitor who turns out to be signed in would send them somewhere they
  // do not need to go.
  const navItems = loading
    ? publicItems
    : [
        { to: isAuthenticated ? roleHome(user.role) : '/login', label: 'Dashboard', icon: LayoutGrid },
        ...publicItems,
      ];

  // Sign-in only. This button used to read "My Dashboard" once signed in, which
  // would now say the same thing as the Dashboard nav item beside it and point
  // at the same route. One affordance per destination: signed in, Dashboard
  // lives in the nav; signed out, this is the way in.
  //
  // The session resolves asynchronously, so the space is held rather than
  // flashing "Login" at someone who turns out to be signed in already.
  const cta = loading ? (
    <span className="h-9 w-28" aria-hidden="true" />
  ) : isAuthenticated ? null : (
    <Link
      to="/login"
      className="whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      Login
    </Link>
  );

  return (
    // `relative` is required, not cosmetic: the phone nav panel is positioned
    // against this header, and on the map page the next sibling is a full-bleed
    // absolutely positioned map. Without the stacking context from z-30 that
    // map paints over the open menu.
    <header className="relative z-30 border-b bg-background">
      {/* One row at every width now. These seven destinations are 742px wide in
          a 320px viewport, so below `sm` they move into the menu rather than
          wrapping onto a second line - on the map page that second line was
          eating a third of the screen the map is supposed to fill. */}
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link to="/" aria-label="CENROWATCH home" className="shrink-0">
          <CenroLogo withWordmark />
        </Link>

        <nav className="hidden flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-muted-foreground sm:flex">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className="whitespace-nowrap hover:text-foreground">
              {item.label}
            </Link>
          ))}
          {cta}
        </nav>

        <div className="flex items-center gap-1 sm:hidden">
          {cta}
          <MobileNav id="public-header-nav" items={navItems} />
        </div>
      </div>
    </header>
  );
}
