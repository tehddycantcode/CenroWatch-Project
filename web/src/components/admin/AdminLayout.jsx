import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, MapPin, Trash2, Bird, ClipboardList,
  Users, Archive, ScrollText, Tags, Settings, LogOut,
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
            {/* max-w caps this at 160px. "System Administrator" measures 144px
                and is unaffected; a longer name is clipped rather than allowed
                to wrap, which is what used to push the 64px bar out of shape. */}
            <div className="hidden min-w-0 max-w-[10rem] text-right sm:block">
              <div className="truncate text-sm font-medium leading-tight">
                {user?.first_name} {user?.last_name}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {ROLE_LABELS[user?.role] || 'Administrator'}
              </div>
            </div>
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
              <div className="text-sm font-medium leading-tight">
                {user?.first_name} {user?.last_name}
              </div>
              <div className="text-xs text-muted-foreground">
                {ROLE_LABELS[user?.role] || 'Administrator'}
              </div>
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
