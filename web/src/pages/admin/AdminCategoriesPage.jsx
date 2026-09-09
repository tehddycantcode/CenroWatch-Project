import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/field';
import { Spinner } from '@/components/ui/icons';

// Report categories and barangays: the lists CENRO can change without a
// developer. Both were previously fixed - the categories as Prisma enums
// compiled into the app, the barangays as seed data with no admin screen - so
// adding one meant a schema migration and a redeploy.
//
// Nothing here deletes. A category or barangay with reports against it cannot be
// removed without making that history unreadable, and the database refuses it
// outright (the foreign keys are ON DELETE RESTRICT). Retiring hides it from the
// report forms and leaves every existing record intact, which is what an office
// actually wants when a category stops being used.

function Row({ children }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">{children}</div>;
}

function CategorySection({ kind, title, blurb, rows, onChanged, onError }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [addErr, setAddErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  const idOf = (r) => (kind === 'complaint' ? r.complaint_type_id : r.request_type_id);

  async function add(e) {
    e.preventDefault();
    setAddErr('');
    setSaving(true);
    try {
      await adminApi.categories.create(kind, {
        name: name.trim(),
        label: label.trim() || undefined,
        sort_order: rows.length + 1,
      });
      setName('');
      setLabel('');
      setShowAdd(false);
      onChanged();
    } catch (err) {
      setAddErr(err.message || 'Could not add that category.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(row) {
    setBusyId(idOf(row));
    onError('');
    try {
      await adminApi.categories.update(kind, idOf(row), { is_active: !row.is_active });
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{blurb}</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd((s) => !s)}>{showAdd ? 'Close' : '+ Add category'}</Button>
      </div>

      {showAdd && (
        <Card className="p-5">
          <form onSubmit={add} className="grid gap-4 sm:grid-cols-2">
            <FormField
              id={`${kind}-name`}
              label="Name"
              hint="Letters, numbers and underscores, e.g. Illegal_Dumping. This is stored on every report and cannot be changed later."
            >
              <Input id={`${kind}-name`} value={name} onChange={(e) => setName(e.target.value)} required />
            </FormField>
            <FormField
              id={`${kind}-label`}
              label="Display name"
              hint={`Optional. Leave blank to show "${name ? humanize(name.trim()) : 'the name with underscores as spaces'}".`}
            >
              <Input id={`${kind}-label`} value={label} onChange={(e) => setLabel(e.target.value)} />
            </FormField>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" loading={saving} disabled={!name.trim()}>Add category</Button>
              {addErr && <span className="text-sm text-destructive">{addErr}</span>}
            </div>
          </form>
        </Card>
      )}

      <Card className="divide-y">
        {rows.map((r) => (
          <Row key={idOf(r)}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{r.label || humanize(r.name)}</span>
                {!r.is_active && <Badge tone="gray">Retired</Badge>}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                <code>{r.name}</code>
                {' · '}
                {r.in_use === 0 ? 'not used by any report yet' : `used by ${r.in_use} report${r.in_use === 1 ? '' : 's'}`}
                {r.sla_setting_key && ` · SLA from ${r.sla_setting_key}`}
              </div>
            </div>
            <Button
              size="sm"
              variant={r.is_active ? 'outline' : 'default'}
              loading={busyId === idOf(r)}
              onClick={() => toggle(r)}
            >
              {r.is_active ? 'Retire' : 'Restore'}
            </Button>
          </Row>
        ))}
      </Card>
    </section>
  );
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState(null);
  const [barangays, setBarangays] = useState(null);
  const [error, setError] = useState('');

  const [showAddBgy, setShowAddBgy] = useState(false);
  const [bgy, setBgy] = useState({ name: '', latitude: '', longitude: '' });
  const [savingBgy, setSavingBgy] = useState(false);
  const [bgyErr, setBgyErr] = useState('');
  const [busyBgy, setBusyBgy] = useState(null);

  const load = useCallback(() => {
    Promise.all([adminApi.categories.list(), adminApi.barangays.list()])
      .then(([c, b]) => {
        setCategories(c.data);
        setBarangays(b.data.barangays);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addBarangay(e) {
    e.preventDefault();
    setBgyErr('');
    setSavingBgy(true);
    try {
      await adminApi.barangays.create({
        name: bgy.name.trim(),
        latitude: bgy.latitude === '' ? undefined : Number(bgy.latitude),
        longitude: bgy.longitude === '' ? undefined : Number(bgy.longitude),
      });
      setBgy({ name: '', latitude: '', longitude: '' });
      setShowAddBgy(false);
      load();
    } catch (err) {
      setBgyErr(err.message || 'Could not add that barangay.');
    } finally {
      setSavingBgy(false);
    }
  }

  async function toggleBarangay(b) {
    setBusyBgy(b.barangay_id);
    setError('');
    try {
      await adminApi.barangays.update(b.barangay_id, { is_active: !b.is_active });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyBgy(null);
    }
  }

  if (error && !categories) return <p className="text-sm text-destructive">{error}</p>;
  if (!categories || !barangays) {
    return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Categories &amp; Barangays</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          The lists residents choose from when they file a report. Changes take effect immediately, with
          no redeploy. Categories are retired rather than deleted, so reports already filed under one
          keep their record.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <CategorySection
        kind="complaint"
        title="Complaint types"
        blurb="What a resident can report as an environmental complaint."
        rows={categories.complaint_types}
        onChanged={load}
        onError={setError}
      />

      <CategorySection
        kind="request"
        title="Service request types"
        blurb="What a resident can request from CENRO. A type with an SLA setting gets a Citizens Charter deadline when it is approved; the others never get one."
        rows={categories.request_types}
        onChanged={load}
        onError={setError}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Barangays</h2>
            <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
              Cabuyao&rsquo;s barangays, used for registration and for every report&rsquo;s location. Adding,
              moving or retiring one redraws the GIS map boundaries for all of them, because each
              barangay&rsquo;s area is derived from where its neighbours sit.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAddBgy((s) => !s)}>{showAddBgy ? 'Close' : '+ Add barangay'}</Button>
        </div>

        {showAddBgy && (
          <Card className="p-5">
            <form onSubmit={addBarangay} className="grid gap-4 sm:grid-cols-3">
              <FormField id="bgy-name" label="Name">
                <Input id="bgy-name" value={bgy.name} onChange={(e) => setBgy((s) => ({ ...s, name: e.target.value }))} required />
              </FormField>
              <FormField id="bgy-lat" label="Latitude" hint="Optional, e.g. 14.2756">
                <Input id="bgy-lat" value={bgy.latitude} onChange={(e) => setBgy((s) => ({ ...s, latitude: e.target.value }))} inputMode="decimal" />
              </FormField>
              <FormField id="bgy-lng" label="Longitude" hint="Optional, e.g. 121.1245">
                <Input id="bgy-lng" value={bgy.longitude} onChange={(e) => setBgy((s) => ({ ...s, longitude: e.target.value }))} inputMode="decimal" />
              </FormField>
              <div className="flex items-center gap-3 sm:col-span-3">
                <Button type="submit" loading={savingBgy} disabled={!bgy.name.trim()}>Add barangay</Button>
                {bgyErr && <span className="text-sm text-destructive">{bgyErr}</span>}
              </div>
            </form>
          </Card>
        )}

        <Card className="divide-y">
          {barangays.map((b) => (
            <Row key={b.barangay_id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{b.name}</span>
                  {!b.is_active && <Badge tone="gray">Retired</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {b.in_use === 0 ? 'no reports yet' : `${b.in_use} report${b.in_use === 1 ? '' : 's'}`}
                  {b.residents > 0 && ` · ${b.residents} resident${b.residents === 1 ? '' : 's'}`}
                  {b.latitude != null && b.longitude != null
                    ? ` · ${b.latitude.toFixed(4)}, ${b.longitude.toFixed(4)}`
                    : ' · no coordinates (excluded from the map)'}
                </div>
              </div>
              <Button
                size="sm"
                variant={b.is_active ? 'outline' : 'default'}
                loading={busyBgy === b.barangay_id}
                onClick={() => toggleBarangay(b)}
              >
                {b.is_active ? 'Retire' : 'Restore'}
              </Button>
            </Row>
          ))}
        </Card>
      </section>
    </div>
  );
}
