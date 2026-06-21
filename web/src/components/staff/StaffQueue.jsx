import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { humanize } from '@/lib/reports';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/icons';

// Generic staff queue: status + search filters, a column-driven table, and
// simple pagination. Each queue page supplies the resource API and columns.
export default function StaffQueue({ title, resource, statuses, columns, rowKey, rowLink }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({ status: '', search: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    resource
      .list({ status: applied.status, search: applied.search, page, limit: 20 })
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [resource, applied, page]);

  function applyFilters(e) {
    e.preventDefault();
    setPage(1);
    setApplied({ status, search: search.trim() });
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl">{title}</h1>
        <form onSubmit={applyFilters} className="flex flex-wrap items-center gap-2">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 w-44"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{humanize(s)}</option>
            ))}
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID or text…"
            className="h-9 w-56"
          />
          <Button type="submit" size="sm" variant="outline">Filter</Button>
        </form>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No records match these filters.</Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {columns.map((c) => (
                  <th key={c.header} className={cnHead(c)}>{c.header}</th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-accent/30">
                  {columns.map((c) => (
                    <td key={c.header} className={cnCell(c)}>{c.render(row)}</td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <Link to={rowLink(row)} className="text-sm font-medium text-primary hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount} · {total} total
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const cnHead = (c) => `px-4 py-3 font-medium ${c.className || ''}`;
const cnCell = (c) => `px-4 py-3 ${c.className || ''}`;
