import { useState } from 'react';
import { wildlifeApi, fileUrl } from '@/lib/api';
import { ANIMAL_CONDITIONS, humanize } from '@/lib/reports';
import { FORM_TL } from '@/lib/tagalog';
import { useSpecies } from '@/lib/useSpecies';
import { withOtherDetail, OTHER_DETAIL_MAX, DESCRIPTION_MAX } from '@/lib/otherCategory';
import { Bird } from 'lucide-react';
import ReportFormShell from '@/components/resident/ReportFormShell';
import BarangaySelect from '@/components/resident/BarangaySelect';
import PhotoField from '@/components/resident/PhotoField';
import LocationField from '@/components/resident/LocationField';
import { FormField } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function WildlifeFormPage() {
  const [form, setForm] = useState({
    species_category: '',
    animal_condition: '',
    description: '',
    barangay_id: '',
  });
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const [photo, setPhoto] = useState(null);
  // A catalogue species NAME, the literal 'Other', or '' before a pick. The
  // single source for which species is selected: it is what gets posted as
  // species_name, so there is no second copy in `form` to fall out of step.
  const [speciesChoice, setSpeciesChoice] = useState('');
  // What the resident types when the animal is not in the list. It is NOT posted
  // as species_name - that is a foreign key - fullDescription folds it into the
  // description's first line instead.
  const [otherDetail, setOtherDetail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const {
    common, endangered, byName,
    loading, error: speciesError,
  } = useSpecies();

  // The picked catalogue row, or null.
  const selected = byName[speciesChoice] || null;
  const isOther = speciesChoice === 'Other';

  // The description as the server receives it. species_name is a foreign key into
  // the catalogue, so a name typed under "Other" cannot go in it. It becomes the
  // description's first line instead, where it is the first thing staff read -
  // the same fold the complaint form does for its "Other" type.
  const fullDescription = isOther
    ? withOtherDetail(form.description.trim(), otherDetail)
    : form.description.trim();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const errs = {};
    if (!speciesChoice) errs.species_name = 'Select a species.';
    // Required only for "Other", which has no category of its own. The three
    // options are a question a resident who saw the animal can answer.
    if (isOther && !form.species_category) {
      errs.species_category = 'Tell us whether it is a bird, mammal or reptile.';
    }
    // The typed species name is deliberately NOT required. A resident who cannot
    // identify the animal is exactly who "Other" exists for, and demanding a
    // name would push them into guessing - which is worse than "Other" for both
    // the record and the staff reading it.
    if (!form.animal_condition) errs.animal_condition = 'Select the animal condition.';
    if (location.latitude == null || location.longitude == null) errs.location = 'Please pin the location on the map.';
    if (!form.barangay_id) errs.barangay_id = 'Please select a barangay.';
    if (form.description.trim().length < 10) errs.description = 'Describe the sighting (at least 10 characters).';
    // The typed name is prepended to the description, and the server caps that at
    // DESCRIPTION_MAX. Checked here so a long report fails on the field the
    // resident can actually see, rather than as a 422 about something else.
    if (fullDescription.length > DESCRIPTION_MAX) {
      errs.description = `Description is too long (limit ${DESCRIPTION_MAX} characters).`;
    }
    return errs;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    const fd = new FormData();
    // Always a catalogue name or 'Other', because that is all the picker offers.
    fd.append('species_name', speciesChoice);
    // The server derives the category from the species. This is only the
    // resident's answer for "Other", which has none of its own.
    if (isOther && form.species_category) fd.append('species_category', form.species_category);
    fd.append('animal_condition', form.animal_condition);
    fd.append('description', fullDescription);
    fd.append('barangay_id', form.barangay_id);
    // is_endangered is deliberately NOT sent: the server derives it from the species.
    if (location.latitude != null) {
      fd.append('latitude', location.latitude);
      fd.append('longitude', location.longitude);
    }
    if (photo) fd.append('photo', photo);

    setSubmitting(true);
    try {
      const res = await wildlifeApi.create(fd);
      setSuccess(res.data.turnover.reference_id);
    } catch (err) {
      if (Array.isArray(err.errors)) {
        const m = {};
        for (const { field, message } of err.errors) m[field] = message;
        setFieldErrors((p) => ({ ...p, ...m }));
      }
      setError(err.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ReportFormShell
      title="Wildlife Turnover"
      subtitle="Report a sighting or turn over rescued wildlife"
      icon={Bird}
      tone="violet"
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      success={success}
      submitLabel="Submit Report"
    >
      <FormField
        id="species_choice"
        label="Species"
        hint={FORM_TL.species_name}
        error={fieldErrors.species_name}
      >
        {speciesError ? (
          // A picker with no options cannot be submitted, so this is stated
          // rather than shown as an empty dropdown.
          <p role="alert" className="text-sm text-destructive">{speciesError}</p>
        ) : (
          <Select id="species_choice" value={speciesChoice} onChange={(e) => setSpeciesChoice(e.target.value)}>
            <option value="">{loading ? 'Loading species\u2026' : 'Select a species'}</option>
            {common.length > 0 && (
              <optgroup label="Common species">
                {common.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </optgroup>
            )}
            {endangered.length > 0 && (
              <optgroup label="Endangered or protected species">
                {endangered.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </optgroup>
            )}
            <option value="Other">Other (not in this list)&hellip;</option>
          </Select>
        )}
      </FormField>

      {selected && !isOther && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          {selected.photo_path && (
            <figure className="mb-2">
              <img
                src={fileUrl(selected.photo_path)}
                alt={`Reference photograph of the ${selected.name}`}
                className="h-40 w-full rounded-md object-cover"
              />
              {/* The credit travels with the photo. The seeded photos are CC BY or
                  CC BY-SA, which require attribution wherever they are shown. */}
              {selected.photo_credit && (
                <figcaption className="mt-1 text-xs text-muted-foreground">Photo: {selected.photo_credit}</figcaption>
              )}
            </figure>
          )}
          <p className="font-medium">
            {selected.name}
            {selected.scientific_name && <span className="ml-1 font-normal italic text-muted-foreground">{selected.scientific_name}</span>}
          </p>
          {selected.local_name && <p className="text-muted-foreground">Also called &ldquo;{selected.local_name}&rdquo;</p>}
          {selected.body_description && <p className="mt-1">{selected.body_description}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            {[
              selected.category,
              selected.biome && `Usually found in: ${humanize(selected.biome)}`,
              selected.indicator && humanize(selected.indicator),
            ].filter(Boolean).join(' \u00b7 ')}
          </p>
          {selected.is_endangered && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              Protected species. This report goes to priority review, and its exact location is
              hidden on the public map.
            </p>
          )}
        </div>
      )}

      {/* READ-ONLY, not hidden. The server derives this from the species, so an
          editable box would be a lie - but a resident should still be able to
          notice they picked the wrong animal. The only case where a human picks
          is "Other", which has no category of its own. */}
      {selected && selected.category && (
        <FormField label="Category">
          <p className="rounded-md border bg-muted px-3 py-2 text-sm">
            {selected.category}
            <span className="ml-2 text-xs text-muted-foreground">Set automatically from the species you selected.</span>
          </p>
        </FormField>
      )}

      {isOther && (
        <>
          <FormField id="species_category" label="What kind of animal is it?" error={fieldErrors.species_category}>
            <Select id="species_category" value={form.species_category} onChange={set('species_category')}>
              <option value="">Select one</option>
              <option value="Bird">Bird</option>
              <option value="Mammal">Mammal</option>
              <option value="Reptile">Reptile</option>
            </Select>
          </FormField>

          <FormField id="species_other" label="Species name (if you know it)">
            <Input
              id="species_other"
              placeholder="e.g. Sea turtle, Tarsier"
              maxLength={OTHER_DETAIL_MAX}
              value={otherDetail}
              onChange={(e) => setOtherDetail(e.target.value)}
            />
          </FormField>
        </>
      )}

      <FormField
        id="animal_condition"
        label="Animal condition"
        hint={FORM_TL.animal_condition}
        error={fieldErrors.animal_condition}
      >
        <Select id="animal_condition" value={form.animal_condition} onChange={set('animal_condition')}>
          <option value="">Select condition</option>
          {ANIMAL_CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
      </FormField>

      <FormField id="barangay_id" label="Barangay" hint={FORM_TL.barangay} error={fieldErrors.barangay_id}>
        <BarangaySelect value={form.barangay_id} onChange={set('barangay_id')} />
      </FormField>

      <FormField id="description" label="Description" hint={FORM_TL.description} error={fieldErrors.description}>
        <Textarea id="description" rows={4} placeholder="Describe the animal and the situation." value={form.description} onChange={set('description')} />
      </FormField>

      {/* There is no "I believe this is an endangered species" checkbox. Endangered
          status comes from the species catalogue: it drives public-map coordinate
          obfuscation, and a reporter must not decide whether a rescue site is
          hidden from a poacher. The server ignores is_endangered if anything still
          sends it. */}

      <FormField label="Location" hint={`Required: pin where it was found. / ${FORM_TL.location}`} error={fieldErrors.location}>
        <LocationField value={location} onChange={setLocation} required />
      </FormField>

      <FormField label="Photo" hint={`Optional: helps identify the species. / ${FORM_TL.photo}`}>
        <PhotoField onChange={setPhoto} />
      </FormField>
    </ReportFormShell>
  );
}
