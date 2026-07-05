import { fileUrl } from '@/lib/api';

// Small presentational helpers shared by the three staff detail pages.

export function Rows({ rows }) {
  return (
    <dl className="grid grid-cols-2 gap-4">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm text-foreground">{value === 0 ? 0 : value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReporterCard({ user }) {
  if (!user) return null;
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Reporter</div>
      <div className="mt-1 font-medium text-foreground">{user.first_name} {user.last_name}</div>
      {user.email && <div className="text-sm text-muted-foreground">{user.email}</div>}
      {user.contact_number && <div className="text-sm text-muted-foreground">{user.contact_number}</div>}
    </div>
  );
}

export function Attachment({ path }) {
  const url = fileUrl(path);
  if (!url) return null;
  const isPdf = /\.pdf$/i.test(path);
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Attachment</div>
      {isPdf ? (
        <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
          View document (PDF)
        </a>
      ) : (
        <img src={url} alt="attachment" className="max-h-80 rounded-lg img-outline" />
      )}
    </div>
  );
}
