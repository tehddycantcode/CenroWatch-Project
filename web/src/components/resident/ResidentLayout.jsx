import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { LayoutGrid, FileText, User, MapPin, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { CenroLogo } from '@/components/ui/cenro-logo';
import { BackButton } from '@/components/ui/back-button';
import NotificationBell from '@/components/resident/NotificationBell';

// `short` is what the phone bar shows: one word, so the label can never wrap
// onto a second line inside a tap target.
const navItems = [
  { to: '/resident/dashboard', label: 'Dashboard', short: 'Home', icon: LayoutGrid },
  { to: '/resident/my-reports', label: 'My Reports', short: 'Reports', icon: FileText },
  { to: '/resident/profile', label: 'Profile', short: 'Profile', icon: User },
  { to: '/map', label: 'Heat Map', short: 'Map', icon: MapPin },
];

export default function ResidentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <BackButton fallback="/resident/dashboard" />
            {/* Seal only on phones. The "CENROWATCH" wordmark is ~150px, which
                pushed the notification bell and log-out control off a 320px
                screen. */}
            <Link to="/resident/dashboard" aria-label="CENROWATCH home">
              <CenroLogo withWordmark className="hidden sm:inline-flex" />
              <CenroLogo className="sm:hidden" />
            </Link>
          </div>

          <nav className="hidden items-center gap-1 sm:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
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
            <NotificationBell />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{user?.first_name} {user?.last_name}</div>
              <div className="text-xs text-muted-foreground">Resident</div>
            </div>
            {/* Icon-only on phones: the full-width label pushed the header past
                320px. The bottom bar carries navigation now, so this is the
                only control that has to fit here. */}
            <button
              type="button"
              onClick={onLogout}
              aria-label="Log out"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors hover:bg-accent sm:h-auto sm:w-auto sm:px-3 sm:py-1.5"
            >
              <LogOut className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="hidden text-sm font-medium sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Phone navigation. The desktop nav above is `hidden sm:flex`, so without
          this a resident on a phone had NO way to reach My Reports, Profile, or
          the map - only the back button. Most residents file from a phone, so
          this sits at the bottom where a thumb reaches. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <div className="grid grid-cols-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium leading-none transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')}
                    strokeWidth={isActive ? 2.4 : 2}
                    aria-hidden="true"
                  />
                  <span className="whitespace-nowrap">{item.short}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Bottom padding clears the fixed phone nav so it never covers a submit
          button at the end of a report form. */}
      <main className="container py-8 pb-28 sm:pb-8">
        <Outlet />
      </main>
    </div>
  );
}
