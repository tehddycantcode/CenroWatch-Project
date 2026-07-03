import { Link } from 'react-router-dom';
import { CenroLogo } from '@/components/ui/cenro-logo';

export default function PublicHeader() {
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
          <Link
            to="/login"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}
