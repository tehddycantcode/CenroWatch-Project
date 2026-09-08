import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { adminApi } from '@/lib/api';
import {
  SETTING_GROUPS,
  UNITS,
  metaFor,
  bestUnit,
  humanDuration,
  isSlaKey,
} from '@/lib/settings';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/icons';

function SettingRow({ setting, onSaved }) {
  const meta = metaFor(setting.setting_key);
  const sla = isSlaKey(setting.setting_key);

  // SLA values are edited in whichever unit reads cleanly, then converted back
  // to minutes on save so the API contract is unchanged.
  const [unit, setUnit] = useState(() => (sla ? bestUnit(setting.setting_value) : UNITS[0]));
  const [amount, setAmount] = useState(() =>
    sla ? String(Number(setting.setting_value) / bestUnit(setting.setting_value).factor) : setting.setting_value
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const minutes = sla ? Math.round(Number(amount) * unit.factor) : amount;
  const valid = !sla || (Number.isFinite(Number(amount)) && Number(amount) > 0);
  const dirty = String(minutes) !== String(setting.setting_value);

  async function save() {
    setMsg('');
    setSaving(true);
    try {
      await adminApi.settings.update(setting.setting_key, String(minutes));
      setMsg('Saved');
      onSaved();
    } catch (e) {
      setMsg(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-xl">
          <div className="font-medium text-foreground">{meta.label}</div>
          {meta.description && <p className="mt-0.5 text-sm text-muted-foreground">{meta.description}</p>}
          {setting.updated_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Last changed {new Date(setting.updated_at).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-9 w-24 tabular-nums"
            inputMode={sla ? 'numeric' : 'text'}
            aria-label={meta.label}
          />
          {sla && (
            <Select
              value={unit.id}
              onChange={(e) => setUnit(UNITS.find((u) => u.id === e.target.value))}
              className="h-9 w-28"
              aria-label="Unit"
            >
              {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </Select>
          )}
          <Button size="sm" disabled={!dirty || !valid} loading={saving} onClick={save}>Save</Button>
          {msg && (
            <span className={`text-xs ${msg === 'Saved' ? 'text-primary' : 'text-destructive'}`}>{msg}</span>
          )}
        </div>
      </div>

      {sla && valid && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-accent/40 px-3 py-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span className="font-medium text-foreground">{humanDuration(minutes)}</span>
          {/* No absolute date here any more. The clock runs in working time, so
              "due on <date>" cannot be computed without the working-day
              calculator, and duplicating that in the frontend would give the
              system two copies of one date algorithm. */}
          <span>of working time, counted Monday to Friday</span>
        </div>
      )}
    </div>
  );
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  const load = () => adminApi.settings.list().then((r) => setSettings(r.data.settings)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!settings) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  const groups = SETTING_GROUPS
    .map((g) => ({ ...g, items: settings.filter((s) => metaFor(s.setting_key).group === g.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">System Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Service standards CENRO staff are measured against, tunable without a code change.
        </p>
      </div>

      {groups.map((g) => (
        <section key={g.id} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{g.title}</h2>
            <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{g.blurb}</p>
          </div>
          <Card className="divide-y">
            {g.items.map((s) => <SettingRow key={s.setting_key} setting={s} onSaved={load} />)}
          </Card>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        Changes apply to reports whose clock starts after the change. A report that already has a
        deadline keeps it, so past compliance figures do not shift. Complaints and service requests
        get their deadline when they are approved; wildlife turnovers get it at submission.
      </p>
    </div>
  );
}
