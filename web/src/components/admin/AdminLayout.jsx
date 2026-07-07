import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { CenroLogo } from '@/components/ui/cenro-logo';
import { BackButton } from '@/components/ui/back-button';

const navItems = [
  { to: '/admin/dashboard', label: 'Dashboard', end: true },
  { to: '/admin/analytics', label: 'GIS' },
  { to: '/admin/complaints', label: 'Complaints' },
  { to: '/admin/wildlife', label: 'Wildlife' },
  { to: '/admin/requests', label: 'Requests' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/archive', label: 'Archive' },
  { to: '/admin/audit-logs', label: 'Audit' },
  { to: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="accent-bar-top" />
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <BackButton fallback="/admin/dashboard" />
            <Link to="/admin/dashboard" className="flex items-center gap-2.5">
              <CenroLogo />
              <span className="whitespace-nowrap text-lg font-bold tracking-tight">
                CENROWATCH <span className="text-muted-foreground">· Admin</span>
              </span>
            </Link>
          </div>

          <nav className="hidden flex-wrap items-center gap-1 md:flex">
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
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{user?.first_name} {user?.last_name}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABELS[user?.role] || 'Administrator'}</div>
            </div>
            <button
              onClick={onLogout}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Mobile / narrow nav */}
        <nav className="flex flex-wrap items-center gap-1 border-t px-4 py-2 md:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn('rounded-md px-2.5 py-1.5 text-xs font-medium', isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')
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
