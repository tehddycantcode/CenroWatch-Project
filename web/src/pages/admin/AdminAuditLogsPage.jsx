import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import { fmtDate } from '@/lib/staff';
import { Card } from '@/components/ui/card';
import { TableHead } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';

export default function AdminAuditLogsPage() {
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .auditLogs({ search: applied, page, limit: 30 })
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 30));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Audit Log</h1>
          <p className="mt-1 text-muted-foreground">{total} recorded actions</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(search.trim()); }} className="flex items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by action or table…" className="h-9 w-64" />
          <Button type="submit" size="sm" variant="outline">Filter</Button>
        </form>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead columns={['When', 'Actor', 'Action', 'Target', 'Details']} />
              <tbody className="divide-y">
                {items.map((log) => (
                  <tr key={log.log_id} className="align-top hover:bg-accent/20">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtDate(log.performed_at)}</td>
                    <td className="px-4 py-3">
                      {log.user ? (
                        <span className="text-foreground">{log.user.first_name} {log.user.last_name}</span>
                      ) : (
                        <span className="text-muted-foreground">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><Badge tone="gray">{log.action}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{log.target_table}{log.target_id ? ` #${log.target_id}` : ''}</td>
                    <td className="px-4 py-3">
                      <code className="block max-w-md truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground" title={JSON.stringify(log.data_generated_json)}>
                        {JSON.stringify(log.data_generated_json)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Page {page} of {pageCount}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
