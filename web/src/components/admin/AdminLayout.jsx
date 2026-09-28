import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, MapPin, Trash2, Bird, ClipboardList,
  Users, Archive, ScrollText, Tags, Settings, LogOut, CircleUser,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { CenroLogo } from '@/components/ui/cenro-logo';
import { BackButton } from '@/components/ui/back-button';
import { MobileNav } from '@/components/ui/mobile-nav';

const navItems = [
  { to: '/admin/dashboard', label: 'Dashboard', end: true, icon: LayoutGrid },
  { to: '/admin/analytics', label: 'GIS', icon: MapPin },
  { to: '/admin/complaints', label: 'Complaints', icon: Trash2 },
  { to: '/admin/wildlife', label: 'Wildlife', icon: Bird },
  { to: '/admin/requests', label: 'Requests', icon: ClipboardList },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/archive', label: 'Archive', icon: Archive },
  { to: '/admin/audit-logs', label: 'Audit', icon: ScrollText },
  { to: '/admin/categories', label: 'Categories', icon: Tags },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="accent-bar-top" />
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="container flex h-16 items-center justify-between gap-3">
          <div className="flex shrink-0 items-center gap-1">
            <BackButton fallback="/admin/dashboard" />
            <Link to="/admin/dashboard" className="flex items-center gap-2.5">
              <CenroLogo />
              {/* Seal only on phones: the wordmark plus "Log out" plus the menu
                  toggle did not fit a 320px screen.
                  text-base up to 2xl, where the nav has spare width again: the
                  wordmark measures 194px at text-lg and 172px at text-base, and
                  those 22px are the difference between the inline nav fitting
                  at 1280 and wrapping. */}
              <span className="hidden whitespace-nowrap text-base font-bold tracking-tight sm:inline 2xl:text-lg">
                CENROWATCH
                {/* The suffix costs 48px and is the least load-bearing text in
                    the bar - every link beside it is an /admin route, and the
                    name block already reads "Administrator". Dropping it below
                    2xl is what takes the 1280 slack from 13px to 61px. */}
                <span className="hidden text-muted-foreground 2xl:inline"> · Admin</span>
              </span>
            </Link>
          </div>

          {/* MEASURED, NOT GUESSED. Inside the container's padding there are
              1352px at most (the container caps at 1400px). The pieces measure:
              nav text 537px, brand 292px at text-lg, name block 144px, Log out
              76px. At the original px-3/gap-1 the nav spent 276px on padding
              and gaps alone - more than half its own width - which put the row
              at 1370px and wrapped "Settings" onto a second line inside a bar
              fixed at h-16, dragging the name and the button with it.
              px-2 and gap-0.5 give that 122px back, text-[13px] another 38px,
              and the smaller wordmark 22px. The row now measures ~1203px and
              fits at 1280 with room to spare; 2xl restores the full text-sm
              nav and text-lg wordmark, which fit once the container is wider.
              Below xl the same links render as a second row (further down) -
              at 1024 the one-row version needs ~1069px against 976px available,
              so there is no arrangement of these ten links that fits beside the
              brand on a tablet. */}
          <nav aria-label="Admin" className="hidden items-center gap-0.5 xl:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'whitespace-nowrap rounded-md px-2 py-2 text-[13px] font-medium transition-colors',
                    // Text only at 2xl - px stays at 2 because bumping the
                    // padding as well put the widest layout back to 33px slack.
                    '2xl:text-sm',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex min-w-0 shrink-0 items-center gap-3">
            {/* THE LINK TO /admin/account. An eleventh nav item would break the
                arithmetic measured above (the row sits at ~1203px against 1280),
                so the account page hangs off the name block instead.
                IT MUST STILL LOOK LIKE A CONTROL. The first version of this was
                bare text with only a hover underline, and it was undiscoverable -
                nobody hovers their own name to see if it is clickable, so the
                page may as well not have existed. The icon and the border are
                what make it findable, and they are affordable: re-measured at
                1280 with them, the row is 1161px against 1265px available and the
                bar is still exactly h-16. max-w is 11rem because 9rem clipped
                "System Administrator" to "System Administrat...", which looks
                broken rather than tidy. Re-measure here if the nav ever grows. */}
            <Link
              to="/admin/account"
              title="Account settings"
              aria-label="Your account and password"
              className="hidden min-w-0 shrink-0 items-center gap-2 rounded-md border px-2 py-1 transition-colors hover:bg-accent sm:flex"
            >
              <CircleUser className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 max-w-[11rem] text-right">
                <span className="block truncate text-sm font-medium leading-tight">
                  {user?.first_name} {user?.last_name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {ROLE_LABELS[user?.role] || 'Administrator'}
                </span>
              </span>
            </Link>
            {/* Icon-only on phones, for the same width reason as the wordmark. */}
            <button
              type="button"
              onClick={onLogout}
              aria-label="Log out"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-[background-color,scale] hover:bg-accent active:scale-[0.96] sm:h-auto sm:w-auto sm:px-3 sm:py-1.5"
            >
              <LogOut className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="hidden whitespace-nowrap text-sm font-medium sm:inline">Log out</span>
            </button>
            <MobileNav id="admin-nav" items={navItems}>
              {/* The block above is `hidden sm:flex`, so on a phone this sheet is
                  the ONLY route to the account page - which makes it the place it
                  is most likely to be missed. Hence the explicit "Account and
                  password" label rather than just the name: inside a list of nav
                  links, a name on its own reads as a heading, not a destination.
                  The sheet closes itself on a pathname change (see
                  mobile-nav.jsx), so no onClick. */}
              <Link
                to="/admin/account"
                className="-mx-1 flex items-center gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-accent"
              >
                <CircleUser className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium leading-tight">
                    {user?.first_name} {user?.last_name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Account and password
                  </span>
                </span>
              </Link>
            </MobileNav>
          </div>
        </div>

        {/* Second row for 640-1279px ONLY - above that the nav sits in the bar
            itself (above), which is where it belongs.
            This band exists because the arithmetic runs out, not as a
            preference: at 1024px the container holds 976px, while the tightest
            one-row arrangement of these ten links still measures ~1069px with
            the name block already hidden. Shrinking the text further to force
            it would cost more than the second row does.
            Phones (<640px) keep the MobileNav sheet above - ten links stacked
            would eat a third of the screen on every page. That matches the
            contract documented in mobile-nav.jsx: the sheet is an addition for
            phones, and this is the inline nav it requires for `sm` and up. */}
        <nav
          aria-label="Admin sections"
          className="hidden items-center gap-1 overflow-x-auto border-t px-6 py-2 sm:flex xl:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  'lg:px-3 lg:text-sm',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="container py-8">
        <Outlet />
      </main>
    </div>
  );
}
