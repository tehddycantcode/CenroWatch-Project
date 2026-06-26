import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/ui/brand-mark';
import NotificationBell from '@/components/resident/NotificationBell';

const navItems = [
  { to: '/resident/dashboard', label: 'Dashboard' },
  { to: '/resident/my-reports', label: 'My Reports' },
  { to: '/resident/profile', label: 'Profile' },
  { to: '/map', label: 'Live Map' },
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
          <Link to="/resident/dashboard">
            <BrandMark withWordmark />
          </Link>

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
            <button
              onClick={onLogout}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <Outlet />
      </main>
    </div>
  );
}
