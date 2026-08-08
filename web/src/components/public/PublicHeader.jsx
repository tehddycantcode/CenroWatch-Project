import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { roleHome } from '@/lib/roles';
import { CenroLogo } from '@/components/ui/cenro-logo';

// Shared by every public page (landing, map, feed, wildlife, track, anonymous
// report). Signed-in visitors reach these pages from inside the app, so the
// call to action is their dashboard, not a Login link.
export default function PublicHeader() {
  const { isAuthenticated, user, loading } = useAuth();

  return (
    <header className="border-b bg-background">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" aria-label="CENROWATCH home">
          <CenroLogo withWordmark />
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium text-muted-foreground">
          <Link to="/map" className="hover:text-foreground">Heat Map</Link>
          <Link to="/feed" className="hover:text-foreground">Reports</Link>
          <Link to="/wildlife" className="hover:text-foreground">Wildlife</Link>
          <Link to="/track" className="hover:text-foreground">Track</Link>
          <Link to="/report-anonymous" className="hover:text-foreground">Report Anonymously</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          {/* The session resolves asynchronously; hold the space instead of
              flashing "Login" at someone who is already signed in. */}
          {loading ? (
            <span className="h-9 w-28" aria-hidden="true" />
          ) : (
            <Link
              to={isAuthenticated ? roleHome(user.role) : '/login'}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {isAuthenticated ? 'My Dashboard' : 'Login'}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
