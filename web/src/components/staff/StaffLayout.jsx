import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { LayoutGrid, Trash2, Bird, ClipboardList, PenSquare, LogOut, CircleUser } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { CenroLogo } from '@/components/ui/cenro-logo';
import { BackButton } from '@/components/ui/back-button';
import { MobileNav } from '@/components/ui/mobile-nav';

const navItems = [
  { to: '/staff/dashboard', label: 'Dashboard', end: true, icon: LayoutGrid },
  { to: '/staff/complaints', label: 'Complaints', icon: Trash2 },
  { to: '/staff/wildlife', label: 'Wildlife', icon: Bird },
  { to: '/staff/requests', label: 'Requests', icon: ClipboardList },
  { to: '/staff/log-walkin', label: 'Log Walk-in', icon: PenSquare },
];

export default function StaffLayout() {
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
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <BackButton fallback="/staff/dashboard" />
            <Link to="/staff/dashboard" className="flex items-center gap-2.5">
              <CenroLogo />
              {/* Seal only on phones. The wordmark is ~170px, which together
                  with "Log out" and the menu toggle pushed this header past a
                  320px screen and into horizontal scroll. */}
              <span className="hidden whitespace-nowrap text-lg font-bold tracking-tight sm:inline">
                CENROWATCH <span className="text-muted-foreground">· Staff</span>
              </span>
            </Link>
          </div>

          <nav className="hidden items-center gap-1 sm:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {/* The way in to /staff/account, rather than a sixth nav link: there
                is room for one here, but AdminLayout has none (see the width note
                in that file) and the two consoles should put this in the same
                place. The icon and border are not decoration - the first version
                was bare text with a hover underline and nobody could find it,
                because nobody hovers their own name to check whether it is a
                link. Kept identical to AdminLayout so the habit transfers. */}
            <Link
              to="/staff/account"
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
                  {ROLE_LABELS[user?.role] || 'CENRO Staff'}
                </span>
              </span>
            </Link>
            {/* Icon-only on phones, for the same width reason as the wordmark. */}
            <button
              type="button"
              onClick={onLogout}
              aria-label="Log out"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border transition-[background-color,scale] hover:bg-accent active:scale-[0.96] sm:h-auto sm:w-auto sm:px-3 sm:py-1.5"
            >
              <LogOut className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="hidden text-sm font-medium sm:inline">Log out</span>
            </button>
            <MobileNav id="staff-nav" items={navItems}>
              {/* The block above is `hidden sm:flex`, so on a phone this sheet is
                  the ONLY route to the account page - which makes it the place it
                  is most likely to be missed. Hence the explicit "Account and
                  password" label rather than just the name: inside a list of nav
                  links, a name on its own reads as a heading, not a destination.
                  The sheet closes itself on a pathname change (see
                  mobile-nav.jsx), so no onClick. */}
              <Link
                to="/staff/account"
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
      </header>

      <main className="container py-8">
        <Outlet />
      </main>
    </div>
  );
}
