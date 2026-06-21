import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/icons';

// Show a friendly duration next to *_minutes settings.
function minutesHint(key, value) {
  if (!key.endsWith('_minutes')) return null;
  const m = Number(value);
  if (!Number.isFinite(m)) return null;
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  return ['≈', d ? `${d}d` : '', h ? `${h}h` : '', min ? `${min}m` : ''].filter(Boolean).join(' ');
}

function SettingRow({ setting, onSaved }) {
  const [value, setValue] = useState(setting.setting_value);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = value !== setting.setting_value;

  async function save() {
    setMsg('');
    setSaving(true);
    try {
      await adminApi.settings.update(setting.setting_key, value);
      setMsg('Saved');
      onSaved();
    } catch (e) {
      setMsg(e.message || 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <div className="font-medium text-foreground">{setting.setting_key}</div>
        {setting.description && <div className="text-xs text-muted-foreground">{setting.description}</div>}
      </div>
      <div className="flex items-center gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-32" />
        {minutesHint(setting.setting_key, value) && (
          <span className="w-24 text-xs text-muted-foreground">{minutesHint(setting.setting_key, value)}</span>
        )}
        <Button size="sm" disabled={!dirty} loading={saving} onClick={save}>Save</Button>
        {msg && <span className={`text-xs ${msg === 'Saved' ? 'text-primary' : 'text-destructive'}`}>{msg}</span>}
      </div>
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">System Settings</h1>
        <p className="mt-1 text-muted-foreground">Citizens Charter SLA durations and other tunables</p>
      </div>
      <Card className="divide-y">
        {settings.map((s) => (
          <SettingRow key={s.setting_key} setting={s} onSaved={load} />
        ))}
      </Card>
    </div>
  );
}
