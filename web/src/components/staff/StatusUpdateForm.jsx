import { useState } from 'react';
import { humanize } from '@/lib/reports';
import { FormField } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
  const [ok, setOk] = useState(false);

  const visibleExtras = extraFields.filter((f) => !f.visibleFor || f.visibleFor.includes(status));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setOk(false);
    const payload = { status };
    if (note.trim()) payload.note = note.trim();
    for (const f of visibleExtras) {
      if (extra[f.name]) payload[f.name] = extra[f.name];
    }
    setSubmitting(true);
    try {
      await onSubmit(payload);
      setOk(true);
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
          ) : (
            <Input
              id={f.name}
              type={f.type || 'text'}
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
      {ok && <p className="text-sm font-medium text-primary">Status updated and the resident was notified.</p>}

      <Button type="submit" loading={submitting}>Save update</Button>
    </form>
  );
}
