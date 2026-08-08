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
      {/* Stacks on phones. As one row these seven destinations were 742px wide
          in a 320px viewport, so every public page scrolled sideways. The nav
          wraps instead of hiding behind a menu: on a civic site the ways to
          report should stay visible. */}
      <div className="container flex flex-col gap-2.5 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
        <Link to="/" aria-label="CENROWATCH home" className="shrink-0">
          <CenroLogo withWordmark />
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-muted-foreground">
          <Link to="/map" className="whitespace-nowrap hover:text-foreground">Heat Map</Link>
          <Link to="/feed" className="whitespace-nowrap hover:text-foreground">Reports</Link>
          <Link to="/wildlife" className="whitespace-nowrap hover:text-foreground">Wildlife</Link>
          <Link to="/track" className="whitespace-nowrap hover:text-foreground">Track</Link>
          <Link to="/report-anonymous" className="whitespace-nowrap hover:text-foreground">Report Anonymously</Link>
          <Link to="/privacy" className="whitespace-nowrap hover:text-foreground">Privacy</Link>
          {/* The session resolves asynchronously; hold the space instead of
              flashing "Login" at someone who is already signed in. */}
          {loading ? (
            <span className="h-9 w-28" aria-hidden="true" />
          ) : (
            <Link
              to={isAuthenticated ? roleHome(user.role) : '/login'}
              className="whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {isAuthenticated ? 'My Dashboard' : 'Login'}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
