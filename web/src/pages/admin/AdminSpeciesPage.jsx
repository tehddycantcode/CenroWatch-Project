import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, fileUrl } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { Card } from '@/components/ui/card';
import { TableHead } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/field';
import { Spinner } from '@/components/ui/icons';

// Admin-managed wildlife species catalogue.
//
// Reached from the Categories page rather than the sidebar: AdminLayout's
// navItems already holds ten entries against a measured ~1203px of a 1280px
// header (see the note in AdminLayout.jsx), and an eleventh would overflow. The
// two screens are the same kind of thing - reference data an Admin edits without
// a redeploy - so they sit together.
//
// Nothing here deletes. species_name is the foreign key every wildlife report is
// stored against (ON DELETE RESTRICT), so a species is RETIRED instead: it
// leaves the resident's picker and every existing record stays readable.

const CATEGORIES = ['Bird', 'Mammal', 'Reptile'];
const BIOMES = ['Forest', 'Freshwater', 'Lakeshore_Wetland', 'Agricultural', 'Urban', 'Cave'];
const INDICATORS = ['Common', 'Native', 'Endemic', 'Near_Threatened', 'Vulnerable', 'Endangered', 'Critically_Endangered'];
const HAZARDS = ['None', 'Venomous', 'Aggressive', 'Disease_Risk', 'Powerful_Bite_Or_Talons'];

// The server refuses a rename outright (species.service.updateSpecies) because
// the name also appears in exported PDFs and audit payloads that cannot be
// rewritten. Said here so an Admin reads it before trying.
const NAME_LOCKED = 'The name is the key reports are stored under and cannot be changed. Retire this species and add a replacement instead.';

const SENTINEL_NOTE = 'This entry is what lets a resident report an animal that is not in the list. It stays active and stays marked endangered.';

const EMPTY_CREATE = {
  name: '',
  scientific_name: '',
  local_name: '',
  category: '',
  biome: '',
  indicator: '',
  hazard: 'None',
  is_endangered: false,
  body_description: '',
  handling_note: '',
};

// One styled <select> for all four enum columns. `blank` is the "not recorded"
// option: biome and indicator are descriptive and may legitimately be empty,
// and the seeded `Other` sentinel has no category at all.
function EnumSelect({ label, value, options, blank = '--', disabled, onChange, className = 'h-9 w-40' }) {
  return (
    <Select
      aria-label={label}
      value={value || ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {blank && <option value="">{blank}</option>}
      {options.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
    </Select>
  );
}

function SpeciesRow({ row, busy, onField, onPhoto }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const isSentinel = row.name === 'Other';
  const id = row.species_id;
  const set = (patch) => onField(id, patch);

  // Opened fresh from the row every time, so a reload between edits cannot leave
  // a stale draft sitting over newer values.
  function toggleDetails() {
    if (open) {
      setOpen(false);
      return;
    }
    setDraft({
      scientific_name: row.scientific_name || '',
      local_name: row.local_name || '',
      body_description: row.body_description || '',
      handling_note: row.handling_note || '',
      sort_order: String(row.sort_order ?? 0),
    });
    setOpen(true);
  }

  async function saveDetails(e) {
    e.preventDefault();
    await onField(id, {
      scientific_name: draft.scientific_name.trim(),
      local_name: draft.local_name.trim(),
      body_description: draft.body_description.trim(),
      handling_note: draft.handling_note.trim(),
      // Sent as the typed STRING, not Number(). The validator parses '10'
      // happily and 422s on 'abc', whereas Number('abc') is NaN, which
      // JSON.stringify turns into null - and the service would then read that
      // as 0 and silently reorder the picker while reporting success.
      sort_order: draft.sort_order.trim() === '' ? undefined : draft.sort_order.trim(),
    });
    setOpen(false);
  }

  function pickPhoto(e) {
    const file = e.target.files && e.target.files[0];
    // Cleared so choosing the SAME file again still fires a change event.
    e.target.value = '';
    if (file) onPhoto(id, file);
  }

  return (
    <>
      <tr className="hover:bg-accent/20">
        <td className="px-4 py-3">
          <div className="w-28">
            {row.photo_path ? (
              // Through fileUrl(), never the bare stored path: the API SIGNS the
              // path, which makes it authorised, not absolute. The local storage
              // driver returns a relative /uploads/... that would resolve against
              // this app's origin - fine behind Vite's dev proxy, a 404 on the
              // deployed site, where the API is a different origin.
              <img
                src={fileUrl(row.photo_path)}
                alt={`${row.name} reference photo`}
                className="h-14 w-24 rounded border object-cover"
              />
            ) : (
              <div className="flex h-14 w-24 items-center justify-center rounded border border-dashed text-xs text-muted-foreground">
                No photo
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              aria-label={`Upload a reference photo for ${row.name}`}
              disabled={busy}
              onChange={pickPhoto}
              className="mt-1.5 block w-28 text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
            />
          </div>
        </td>

        <td className="px-4 py-3">
          <div className="min-w-44 max-w-64">
            {/* Read-only, with the reason in the tooltip. */}
            <span className="font-medium text-foreground" title={NAME_LOCKED}>{row.name}</span>
            {row.scientific_name && <div className="text-xs italic text-muted-foreground">{row.scientific_name}</div>}
            {row.local_name && <div className="text-xs text-muted-foreground">{row.local_name}</div>}
            {isSentinel && <p className="mt-1 text-xs text-muted-foreground">{SENTINEL_NOTE}</p>}
            <Button size="sm" variant="ghost" className="mt-1 h-7 px-0 text-xs" onClick={toggleDetails}>
              {open ? 'Close details' : 'Edit details'}
            </Button>
          </div>
        </td>

        <td className="px-4 py-3">
          <EnumSelect
            label={`Category for ${row.name}`}
            value={row.category}
            options={CATEGORIES}
            disabled={busy}
            onChange={(v) => set({ category: v })}
            className="h-9 w-32"
          />
        </td>
        <td className="px-4 py-3">
          <EnumSelect
            label={`Biome for ${row.name}`}
            value={row.biome}
            options={BIOMES}
            disabled={busy}
            onChange={(v) => set({ biome: v })}
          />
        </td>
        <td className="px-4 py-3">
          <EnumSelect
            label={`Indicator for ${row.name}`}
            value={row.indicator}
            options={INDICATORS}
            disabled={busy}
            onChange={(v) => set({ indicator: v })}
            className="h-9 w-44"
          />
        </td>
        <td className="px-4 py-3">
          <EnumSelect
            label={`Hazard for ${row.name}`}
            value={row.hazard}
            options={HAZARDS}
            blank={null}
            disabled={busy}
            onChange={(v) => set({ hazard: v })}
            className="h-9 w-48"
          />
        </td>

        {/* The two sentinel-guarded flags. Disabled rather than hidden, with the
            reason stated in the Name cell. The server refuses both of these
            anyway, but an Admin should not have to discover that through an
            error message. */}
        <td className="px-4 py-3">
          <Checkbox
            aria-label={`Mark ${row.name} endangered`}
            title={isSentinel ? SENTINEL_NOTE : 'Endangered species have their location obfuscated on the public map.'}
            checked={row.is_endangered}
            disabled={isSentinel || busy}
            onChange={(e) => set({ is_endangered: e.target.checked })}
          />
        </td>

        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
          {row.in_use === 0 ? 'none yet' : `${row.in_use} report${row.in_use === 1 ? '' : 's'}`}
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Checkbox
              aria-label={`Keep ${row.name} in the resident picker`}
              title={isSentinel ? SENTINEL_NOTE : 'Retiring a species hides it from the wildlife form and leaves every report filed against it intact.'}
              checked={row.is_active}
              disabled={isSentinel || busy}
              onChange={(e) => set({ is_active: e.target.checked })}
            />
            {!row.is_active && <Badge tone="gray">Retired</Badge>}
          </div>
        </td>
      </tr>

      {open && draft && (
        <tr className="bg-muted/20">
          <td colSpan={9} className="px-4 py-4">
            <form onSubmit={saveDetails} className="grid gap-4 sm:grid-cols-2">
              <FormField id={`sci-${id}`} label="Scientific name">
                <Input
                  id={`sci-${id}`}
                  value={draft.scientific_name}
                  onChange={(e) => setDraft((d) => ({ ...d, scientific_name: e.target.value }))}
                  maxLength={200}
                />
              </FormField>
              <FormField id={`loc-${id}`} label="Local name" hint="The Tagalog or Cabuyao name, e.g. Musang.">
                <Input
                  id={`loc-${id}`}
                  value={draft.local_name}
                  onChange={(e) => setDraft((d) => ({ ...d, local_name: e.target.value }))}
                  maxLength={200}
                />
              </FormField>
              <FormField
                id={`body-${id}`}
                label="What it looks like"
                hint="What a resident checks the animal against when choosing from the list."
              >
                <Textarea
                  id={`body-${id}`}
                  rows={3}
                  value={draft.body_description}
                  onChange={(e) => setDraft((d) => ({ ...d, body_description: e.target.value }))}
                />
              </FormField>
              <FormField id={`note-${id}`} label="Handling note" hint="What to do, and what not to do, on finding one.">
                <Textarea
                  id={`note-${id}`}
                  rows={3}
                  value={draft.handling_note}
                  onChange={(e) => setDraft((d) => ({ ...d, handling_note: e.target.value }))}
                />
              </FormField>
              <FormField id={`sort-${id}`} label="Sort order" hint="Lower first in the resident picker. Ties fall back to the name.">
                <Input
                  id={`sort-${id}`}
                  value={draft.sort_order}
                  onChange={(e) => setDraft((d) => ({ ...d, sort_order: e.target.value }))}
                  inputMode="numeric"
                />
              </FormField>
              <div className="flex items-end gap-3">
                <Button type="submit" loading={busy}>Save details</Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminSpeciesPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Separate from `rows`, which starts as a legitimate empty array: without it
  // the first paint of a slow load is indistinguishable from an empty catalogue.
  const [loaded, setLoaded] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_CREATE);
  const [addErr, setAddErr] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    adminApi.listSpecies()
      .then((r) => { setRows(r.data.species || []); setError(''); })
      .catch((e) => setError(e.message || 'Could not load the species catalogue.'))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // One handler for every field, so a row edit is a PATCH of just what changed.
  // adminApi.updateSpecies invalidates the PUBLIC species cache, which is what
  // stops a species retired here lingering in the wildlife form for the rest of
  // the session.
  async function saveField(species_id, patch) {
    setBusy(true);
    try {
      await adminApi.updateSpecies(species_id, patch);
      reload();
      setError('');
    } catch (e) {
      // The service writes these messages to be read by an Admin - the
      // last-active-species and "Other" refusals in particular explain WHY.
      setError(e.message || 'Could not update the species.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(species_id, file) {
    const fd = new FormData();
    fd.append('photo', file);
    setBusy(true);
    try {
      await adminApi.setSpeciesPhoto(species_id, fd);
      reload();
    } catch (e) {
      setError(e.message || 'Could not upload the photo.');
    } finally {
      setBusy(false);
    }
  }

  async function addSpecies(e) {
    e.preventDefault();
    setAddErr('');
    setSaving(true);
    try {
      await adminApi.createSpecies({
        name: form.name.trim(),
        scientific_name: form.scientific_name.trim() || undefined,
        local_name: form.local_name.trim() || undefined,
        category: form.category,
        biome: form.biome || undefined,
        indicator: form.indicator || undefined,
        hazard: form.hazard || 'None',
        is_endangered: form.is_endangered,
        body_description: form.body_description.trim() || undefined,
        handling_note: form.handling_note.trim() || undefined,
      });
      setForm(EMPTY_CREATE);
      setShowAdd(false);
      reload();
    } catch (err) {
      // Surfaced verbatim: the 409 on a duplicate name and every 422 from the
      // validator are written to be shown to whoever is filling this in.
      setAddErr(err.message || 'Could not add that species.');
    } finally {
      setSaving(false);
    }
  }

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (error && !loaded) return <p className="text-sm text-destructive">{error}</p>;
  if (!loaded) {
    return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Wildlife species</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          The species a resident chooses from when reporting an animal, and the rows that decide each
          report&rsquo;s category, hazard and whether its location is hidden on the public map. Changes take
          effect immediately, with no redeploy. A species is retired rather than deleted, so reports
          already filed against one keep their record.
        </p>
        <Link
          to="/admin/categories"
          className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Categories &amp; barangays
        </Link>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          A resident never sets the category or the endangered flag themselves &mdash; both are read off
          the row they picked, so what is recorded here is what every report inherits.
        </p>
        <Button size="sm" onClick={() => setShowAdd((s) => !s)}>{showAdd ? 'Close' : '+ Add species'}</Button>
      </div>

      {showAdd && (
        <Card className="p-5">
          <form onSubmit={addSpecies} className="grid gap-4 sm:grid-cols-2">
            <FormField id="sp-name" label="Name" hint={NAME_LOCKED}>
              <Input id="sp-name" value={form.name} onChange={setF('name')} maxLength={200} required />
            </FormField>
            <FormField id="sp-category" label="Category" hint="Required. Every report filed against this species inherits it.">
              <Select id="sp-category" value={form.category} onChange={setF('category')} required>
                <option value="">Choose a category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormField>
            <FormField id="sp-scientific" label="Scientific name" hint="Optional, e.g. Anas luzonica.">
              <Input id="sp-scientific" value={form.scientific_name} onChange={setF('scientific_name')} maxLength={200} />
            </FormField>
            <FormField id="sp-local" label="Local name" hint="Optional, e.g. Musang.">
              <Input id="sp-local" value={form.local_name} onChange={setF('local_name')} maxLength={200} />
            </FormField>
            <FormField id="sp-biome" label="Biome" hint="Optional. Where in Cabuyao it is normally found.">
              <Select id="sp-biome" value={form.biome} onChange={setF('biome')}>
                <option value="">Not recorded</option>
                {BIOMES.map((b) => <option key={b} value={b}>{humanize(b)}</option>)}
              </Select>
            </FormField>
            <FormField id="sp-indicator" label="Indicator" hint="Optional. The conservation status shown on the species guide.">
              <Select id="sp-indicator" value={form.indicator} onChange={setF('indicator')}>
                <option value="">Not recorded</option>
                {INDICATORS.map((i) => <option key={i} value={i}>{humanize(i)}</option>)}
              </Select>
            </FormField>
            <FormField id="sp-hazard" label="Hazard" hint="What a resident has to be warned about on approaching it.">
              <Select id="sp-hazard" value={form.hazard} onChange={setF('hazard')}>
                {HAZARDS.map((h) => <option key={h} value={h}>{humanize(h)}</option>)}
              </Select>
            </FormField>
            <div className="flex items-start gap-2 sm:pt-7">
              <Checkbox
                id="sp-endangered"
                checked={form.is_endangered}
                onChange={(e) => setForm((f) => ({ ...f, is_endangered: e.target.checked }))}
              />
              <label htmlFor="sp-endangered" className="text-sm text-muted-foreground">
                Endangered &mdash; hides the exact location of every report filed against this species on
                the public map.
              </label>
            </div>
            <FormField
              id="sp-body"
              label="What it looks like"
              hint="What a resident checks the animal against when choosing from the list."
            >
              <Textarea id="sp-body" rows={3} value={form.body_description} onChange={setF('body_description')} />
            </FormField>
            <FormField id="sp-note" label="Handling note" hint="What to do, and what not to do, on finding one.">
              <Textarea id="sp-note" rows={3} value={form.handling_note} onChange={setF('handling_note')} />
            </FormField>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit" loading={saving} disabled={!form.name.trim() || !form.category}>Add species</Button>
              <span className="text-xs text-muted-foreground">A photo is uploaded from the row once the species exists.</span>
              {addErr && <span className="text-sm text-destructive">{addErr}</span>}
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        {/* The Card's overflow-hidden clips the table's WIDTH as well as its
            corners, and overflow-x is hidden rather than auto - so without this
            wrapper the right-hand columns are unreachable on a phone and the
            page shows no scrollbar to say so. */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <TableHead
              columns={['Photo', 'Name', 'Category', 'Biome', 'Indicator', 'Hazard', 'Endangered', 'Used by', 'Active']}
            />
            <tbody className="divide-y">
              {rows.map((row) => (
                <SpeciesRow key={row.species_id} row={row} busy={busy} onField={saveField} onPhoto={uploadPhoto} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
