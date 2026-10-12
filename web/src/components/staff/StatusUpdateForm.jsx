import { useState } from 'react';
import { humanize } from '@/lib/reports';
import { FormField } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import ConfirmDialog, { useConfirm } from '@/components/ui/confirm-dialog';

// Statuses that end a report's life. Reaching one stops the SLA clock and tells
// the resident, so it is worth a question first.
const TERMINAL = ['Resolved', 'Rejected', 'Completed', 'Released', 'Transferred', 'Deceased'];

// Status-update panel shared by the three detail pages. `extraFields` are
// resource-specific inputs (e.g. resolution notes, transfer destination,
// scheduled date) shown only for the relevant target status.
export default function StatusUpdateForm({ statuses, current, extraFields = [], onSubmit }) {
  // Hold only the staff member's pending choice; the displayed value is derived
  // from `current` whenever they have not picked one. The three detail pages all
  // refetch the record while this form stays mounted (its own save, the archive
  // control, `onChanged={load}`), so a copy captured at mount would go stale and
  // re-submit an outdated status over whatever the record actually holds now.
  const [picked, setPicked] = useState(null);
  const status = picked ?? current;
  const [note, setNote] = useState('');
  const [extra, setExtra] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // false | 'changed' | 'saved' - only a real status change sends an email, so
  // the success line must say which happened.
  const [ok, setOk] = useState(false);
  const [confirmProps, ask] = useConfirm();

  const visibleExtras = extraFields.filter((f) => !f.visibleFor || f.visibleFor.includes(status));

  // A required extra field blocks submission here as well as in the API, so a
  // staff member is told before they wait for a round trip. Only block when the
  // status is actually CHANGING, matching both the API guard and the
  // confirmation below - otherwise a record closed before proof was required
  // can never be edited again.
  const missingRequired = status !== current && visibleExtras.some((f) => f.required && !extra[f.name]);

  async function submit(e) {
    e.preventDefault();
    if (TERMINAL.includes(status) && status !== current) {
      // Only when the status is actually changing: the copy below says the
      // resident is emailed, which is false for a re-save that only adds a note.
      // A terminal status stops the SLA clock, emails the resident, and is how
      // the office says it is finished with the report. It can be changed
      // afterwards, but the resident has already been told.
      const confirmed = await ask({
        title: `Mark this report as ${humanize(status)}?`,
        body: 'This closes the report and stops its deadline clock. If they filed through an account, we email them to tell them. You can change the status afterwards, but they will already have been told.',
        confirmLabel: `Mark ${humanize(status)}`,
        destructive: true,
      });
      if (!confirmed) return;
    }
    setError('');
    setOk(false);
    const hasFile = visibleExtras.some((f) => f.type === 'file' && extra[f.name]);
    let payload;
    if (hasFile) {
      payload = new FormData();
      payload.append('status', status);
      if (note.trim()) payload.append('note', note.trim());
      for (const f of visibleExtras) {
        const v = extra[f.name];
        if (!v) continue;
        // The file rides under the name the route's multer expects, not the
        // field's own name - the server turns it into a path.
        payload.append(f.type === 'file' ? 'proof' : f.name, v);
      }
    } else {
      payload = { status };
      if (note.trim()) payload.note = note.trim();
      for (const f of visibleExtras) {
        if (extra[f.name]) payload[f.name] = extra[f.name];
      }
    }
    setSubmitting(true);
    try {
      const wasStatusChange = status !== current;
      await onSubmit(payload);
      setOk(wasStatusChange ? 'changed' : 'saved');
      setNote('');
      // Fall back to the record again so the select shows the refetched status.
      setPicked(null);
    } catch (err) {
      setError(err.message || 'Update failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField id="status" label="Update status">
        <Select id="status" value={status} onChange={(e) => setPicked(e.target.value)}>
          {statuses.map((s) => (
            <option key={s} value={s}>{humanize(s)}</option>
          ))}
        </Select>
      </FormField>

      {visibleExtras.map((f) => (
        <FormField key={f.name} id={f.name} label={f.label} hint={f.hint}>
          {f.type === 'textarea' ? (
            <Textarea
              id={f.name}
              rows={3}
              value={extra[f.name] || ''}
              onChange={(e) => setExtra((x) => ({ ...x, [f.name]: e.target.value }))}
            />
          ) : f.type === 'file' ? (
            <input
              id={f.name}
              type="file"
              accept="image/*"
              onChange={(e) => setExtra((x) => ({ ...x, [f.name]: e.target.files?.[0] || null }))}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
          ) : (
            <Input
              id={f.name}
              type={f.type || 'text'}
              min={f.min}
              value={extra[f.name] || ''}
              onChange={(e) => setExtra((x) => ({ ...x, [f.name]: e.target.value }))}
            />
          )}
        </FormField>
      ))}

      <FormField id="note" label="Note to resident" hint="Included in the status-change email (optional).">
        <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. An inspector will visit within 3 working days." />
      </FormField>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {ok && (
        <p className="text-sm font-medium text-primary">
          {ok === 'changed'
            ? 'Status updated. If the reporter has an account, they have been emailed.'
            : 'Saved.'}
        </p>
      )}

      <Button type="submit" loading={submitting} disabled={missingRequired}>Save update</Button>
      <ConfirmDialog {...confirmProps} />
    </form>
  );
}
