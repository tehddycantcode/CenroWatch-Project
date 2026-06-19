import { Link } from 'react-router-dom';

// Generic placeholder used for routes that will be built in later sprints.
export default function Placeholder({ title, sprint, area }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
      {area && (
        <span className="mb-3 rounded-full bg-accent px-3 py-1 text-xs font-medium uppercase tracking-wide text-accent-foreground">
          {area}
        </span>
      )}
      <h1 className="text-3xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        This screen is part of CENROWATCH and is planned for{' '}
        <span className="font-semibold text-primary">{sprint}</span>.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        ← Back to home
      </Link>
    </div>
  );
}
