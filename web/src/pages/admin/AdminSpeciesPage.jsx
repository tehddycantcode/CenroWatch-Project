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
import ConfirmDialog, { useConfirm } from '@/components/ui/confirm-dialog';

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
// Where the animal lives, as distinct from BIOMES above, which is the ecosystem
// it is found in. Both are kept because neither determines the other - three
// species share Lakeshore_Wetland and split across all three habitats.
const HABITATS = ['Aquatic', 'Land', 'Air'];
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
  habitat: '',
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

// How many extra photos one species may carry. Mirrors MAX_GALLERY_PHOTOS in
// backend/src/services/species.service.js, which is what actually enforces it -
// this copy only decides when to stop offering the picker, so an Admin is not
// told "no" by a 422 after choosing files.
const MAX_GALLERY_PHOTOS = 8;

// Extra sample photographs for one species. One animal rarely looks like one
// picture - a python coiled is a different silhouette from one stretched out,
// and a juvenile monitor lizard does not read like an adult - so a resident
// checking what is in front of them needs more than one angle.
//
// The species' PRIMARY photo is not managed here: it lives in the row's own
// cell above, because it is the thumbnail in the resident picker and the card
// image in the guide, and replacing it is a different act from adding an angle.
function GalleryManager({ row, busy, onAdd, onRemove }) {
  const photos = row.photos || [];
  const [credit, setCredit] = useState('');
  const [caption, setCaption] = useState('');
  const full = photos.length >= MAX_GALLERY_PHOTOS;

  function pick(e) {
    const files = Array.from(e.target.files || []);
    // Cleared so choosing the SAME files again still fires a change event.
    e.target.value = '';
    if (files.length) onAdd(row.species_id, files, credit.trim(), caption.trim());
    setCaption('');
  }

  return (
    <div className="mt-5 border-t pt-4">
      <h4 className="text-sm font-semibold">Sample photos</h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Extra angles shown beside the main photo on the species guide and the wildlife form.
        {' '}
        {photos.length} of {MAX_GALLERY_PHOTOS} used.
      </p>

      {photos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3">
          {photos.map((p) => (
            <li key={p.species_photo_id} className="w-32">
              {/* Through fileUrl(): the API signs these paths, which makes them
                  authorised, not absolute. */}
              <img
                src={fileUrl(p.photo_path)}
                alt={p.caption ? `${row.name} - ${p.caption}` : `${row.name} sample photo`}
                className="h-20 w-32 rounded border object-cover"
              />
              {p.caption && <p className="mt-1 truncate text-[11px] text-foreground" title={p.caption}>{p.caption}</p>}
              <p className="truncate text-[10px] text-muted-foreground" title={p.photo_credit}>{p.photo_credit}</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-0.5 h-6 px-0 text-xs text-destructive"
                disabled={busy}
                onClick={() => onRemove(row.species_id, p.species_photo_id, row.name)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="mt-3 text-xs text-muted-foreground">
          This species has the maximum of {MAX_GALLERY_PHOTOS} sample photos. Remove one before adding another.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <FormField
            id={`gal-credit-${row.species_id}`}
            label="Photo credit"
            // Stated rather than implied: an Admin choosing eight files from
            // different sources must know ONE credit is being applied to all of
            // them, or the attribution it records is wrong for seven of them.
            hint="Applies to every file in this upload. Upload separately if they have different sources."
          >
            <Input
              id={`gal-credit-${row.species_id}`}
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              placeholder="Photographer, licence"
              className="h-8 w-56 text-xs"
              maxLength={255}
            />
          </FormField>
          <FormField id={`gal-caption-${row.species_id}`} label="Caption" hint="Optional, e.g. juvenile, coiled, in flight.">
            <Input
              id={`gal-caption-${row.species_id}`}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="juvenile"
              className="h-8 w-40 text-xs"
              maxLength={255}
            />
          </FormField>
          <div>
            <input
              type="file"
              accept="image/*"
              multiple
              aria-label={`Add sample photos for ${row.name}`}
              // Gated on the credit for the same reason the primary upload is:
              // the server refuses without one, and finding that out after
              // choosing eight files is worse than not being able to pick yet.
              disabled={busy || !credit.trim()}
              onChange={pick}
              className="block text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
            />
            {!credit.trim() && (
              <p className="mt-1 text-[10px] text-muted-foreground">Add a credit to enable upload.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SpeciesRow({ row, busy, onField, onPhoto, onAddPhotos, onRemovePhoto }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const isSentinel = row.name === 'Other';
  const id = row.species_id;
  const set = (patch) => onField(id, patch);
  // Seeded rows already carry a credit, so pre-fill rather than making an Admin
  // retype one that is already correct. Rows only mount after the first load
  // resolves, so row.photo_credit is present by then.
  const [credit, setCredit] = useState(row.photo_credit || '');

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
    if (file) onPhoto(id, file, credit.trim());
  }

  // Attribution for the reference photo. The server REQUIRES it on upload - the
  // catalogue's photos are CC BY / CC BY-SA, which must be credited wherever
  // they are shown, and this field is shown on the public species guide and the
  // resident identification card. The file picker is disabled while this is
  // empty so the rule is visible here instead of arriving as a 422 after the
  // Admin has already chosen a file.
  function saveCreditIfChanged() {
    const next = credit.trim();
    // Only worth a PATCH once a photo exists; before that the value rides along
    // with the upload itself.
    if (row.photo_path && next && next !== (row.photo_credit || '')) {
      set({ photo_credit: next });
    }
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
            <Input
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              onBlur={saveCreditIfChanged}
              disabled={busy}
              placeholder="Photographer, licence"
              aria-label={`Photo credit for ${row.name}`}
              title='Required to upload a photo. For example "Juan Dela Cruz, CC BY-SA 4.0", or "CENRO Cabuyao" for your own photo.'
              className="mt-1.5 h-7 w-28 text-xs"
            />
            <input
              type="file"
              accept="image/*"
              aria-label={`Upload a reference photo for ${row.name}`}
              // Gated on the credit, not just on `busy`: the server refuses an
              // upload without one, and discovering that after picking a file
              // is a worse experience than not being able to pick yet.
              disabled={busy || !credit.trim()}
              onChange={pickPhoto}
              className="mt-1.5 block w-28 text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
            />
            {!credit.trim() && (
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                Add a credit to enable upload.
              </p>
            )}
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
          {/* No blank option once a category IS set, because clearing it is
              refused by the server: resolveSpecies() falls back to a
              client-sent category for a row whose own category is null, so a
              real species left without one would hand that decision to
              whatever a reporter's app posts. Same approach as the "Other"
              row's disabled toggles - the server refuses it anyway, and an
              Admin should not have to find that out from an error.

              The blank DOES stay when the row has no category yet. That is a
              real state, not a hypothetical: the backfill migration created
              species from existing reports without one, and production still
              has rows in that shape. Hiding the blank for those would show
              "Bird" for a row whose category is actually empty - displaying a
              value nobody chose. */}
          <EnumSelect
            label={`Category for ${row.name}`}
            value={row.category}
            options={CATEGORIES}
            blank={row.category ? null : '--'}
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
            label={`Habitat for ${row.name}`}
            value={row.habitat}
            options={HABITATS}
            disabled={busy}
            onChange={(v) => set({ habitat: v })}
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

            {/* Outside the details <form>: a file picker inside it would submit
                the whole form on Enter, and these upload immediately anyway. */}
            <GalleryManager
              row={row}
              busy={busy}
              onAdd={onAddPhotos}
              onRemove={onRemovePhoto}
            />
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
  const [confirmProps, ask] = useConfirm();

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
    // Only retiring asks. The checkbox is controlled by the stored value, so
    // declining leaves it ticked with nothing to undo.
    if (patch.is_active === false) {
      const ok = await ask({
        title: 'Retire this species?',
        body: 'It disappears from the wildlife form. Reports already filed against it keep it and stay readable.',
        confirmLabel: 'Retire',
        destructive: true,
      });
      if (!ok) return;
    }
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

  async function uploadPhoto(species_id, file, credit) {
    const fd = new FormData();
    fd.append('photo', file);
    // Sent in the SAME request as the file, because the server stores the two
    // together - a photo cannot be saved without its attribution.
    fd.append('photo_credit', credit || '');
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

  async function addGalleryPhotos(species_id, files, credit, caption) {
    const fd = new FormData();
    // All parts named `photos`: multer's .array('photos', 8) refuses any other
    // field name with "Unexpected file field".
    for (const f of files) fd.append('photos', f);
    // ONE credit for the whole batch, and the UI says so. Per-file credits
    // would invite copying the first one down a list of eight, which produces
    // confident WRONG attribution; different sources are separate uploads.
    fd.append('photo_credit', credit || '');
    if (caption) fd.append('caption', caption);
    setBusy(true);
    try {
      await adminApi.addSpeciesPhotos(species_id, fd);
      reload();
      setError('');
    } catch (e) {
      setError(e.message || 'Could not add the sample photos.');
    } finally {
      setBusy(false);
    }
  }

  async function removeGalleryPhoto(species_id, photoId, speciesName) {
    const ok = await ask({
      title: 'Remove this sample photo?',
      body: `It stops appearing for ${speciesName} on the species guide and the wildlife form, and the file is deleted. The species keeps its main photo.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await adminApi.removeSpeciesPhoto(species_id, photoId);
      reload();
      setError('');
    } catch (e) {
      setError(e.message || 'Could not remove the photo.');
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
        habitat: form.habitat || undefined,
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
            <FormField id="sp-habitat" label="Habitat" hint="Optional. Whether it lives in the water, on land, or in the air.">
              <Select id="sp-habitat" value={form.habitat} onChange={setF('habitat')}>
                <option value="">Not recorded</option>
                {HABITATS.map((h) => <option key={h} value={h}>{h}</option>)}
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
              columns={['Photo', 'Name', 'Category', 'Biome', 'Habitat', 'Indicator', 'Hazard', 'Endangered', 'Used by', 'Active']}
            />
            <tbody className="divide-y">
              {rows.map((row) => (
                <SpeciesRow
                  key={row.species_id}
                  row={row}
                  busy={busy}
                  onField={saveField}
                  onPhoto={uploadPhoto}
                  onAddPhotos={addGalleryPhotos}
                  onRemovePhoto={removeGalleryPhoto}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
