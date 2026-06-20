import { Link } from 'react-router-dom';

export default function PublicHeader() {
  return (
    <header className="border-b bg-background">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            CW
          </span>
          <span className="text-lg font-bold tracking-tight">CENROWATCH</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium text-muted-foreground">
          <Link to="/map" className="hover:text-foreground">Live Map</Link>
          <Link to="/feed" className="hover:text-foreground">Reports</Link>
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
