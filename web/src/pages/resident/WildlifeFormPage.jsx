import { useState } from 'react';
import { wildlifeApi } from '@/lib/api';
import { ANIMAL_CONDITIONS } from '@/lib/reports';
import { SPECIES } from '@/lib/species';
import { Bird } from 'lucide-react';
import ReportFormShell from '@/components/resident/ReportFormShell';
import BarangaySelect from '@/components/resident/BarangaySelect';
import PhotoField from '@/components/resident/PhotoField';
import LocationField from '@/components/resident/LocationField';
import { FormField } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

export default function WildlifeFormPage() {
  const [form, setForm] = useState({
    species_name: '',
    species_category: '',
    animal_condition: '',
    description: '',
    barangay_id: '',
    is_endangered: false,
  });
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const [photo, setPhoto] = useState(null);
  const [speciesChoice, setSpeciesChoice] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const otherSpecies = speciesChoice === '__other__';

  // Common species are sorted alphabetically for the dropdown.
  const speciesOptions = [...SPECIES].sort((a, b) => a.name.localeCompare(b.name));

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  // Picking a known species fills its name and (if blank) auto-fills the category.
  // "Other" clears the name so the resident can type a custom one.
  function onSpeciesChoice(e) {
    const val = e.target.value;
    setSpeciesChoice(val);
    if (val === '__other__' || !val) {
      setForm((f) => ({ ...f, species_name: '' }));
      return;
    }
    const sp = SPECIES.find((s) => s.name === val);
    setForm((f) => ({
      ...f,
      species_name: val,
      species_category: f.species_category || (sp ? sp.group : ''),
    }));
  }

  function validate() {
    const errs = {};
    if (!form.species_name.trim()) errs.species_name = 'Species name is required.';
    if (!form.animal_condition) errs.animal_condition = 'Select the animal condition.';
    if (!form.barangay_id) errs.barangay_id = 'Please select a barangay.';
    if (form.description.trim().length < 10) errs.description = 'Describe the sighting (at least 10 characters).';
    return errs;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    const fd = new FormData();
    fd.append('species_name', form.species_name.trim());
    if (form.species_category.trim()) fd.append('species_category', form.species_category.trim());
    fd.append('animal_condition', form.animal_condition);
    fd.append('description', form.description.trim());
    fd.append('barangay_id', form.barangay_id);
    fd.append('is_endangered', form.is_endangered ? 'true' : 'false');
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
      <FormField id="species_choice" label="Species" error={otherSpecies ? undefined : fieldErrors.species_name}>
        <Select id="species_choice" value={speciesChoice} onChange={onSpeciesChoice}>
          <option value="">Select a species</option>
          {speciesOptions.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
          <option value="__other__">Other (specify)…</option>
        </Select>
      </FormField>

      {otherSpecies && (
        <FormField id="species_name" label="Species name" error={fieldErrors.species_name}>
          <Input
            id="species_name"
            placeholder="e.g. Sea turtle, Tarsier"
            value={form.species_name}
            onChange={set('species_name')}
          />
        </FormField>
      )}

      <FormField id="species_category" label="Category" hint="Optional: e.g. Reptile, Bird, Mammal">
        <Input id="species_category" placeholder="Reptile / Bird / Mammal…" value={form.species_category} onChange={set('species_category')} />
      </FormField>

      <FormField id="animal_condition" label="Animal condition" error={fieldErrors.animal_condition}>
        <Select id="animal_condition" value={form.animal_condition} onChange={set('animal_condition')}>
          <option value="">Select condition</option>
          {ANIMAL_CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
      </FormField>

      <FormField id="barangay_id" label="Barangay" error={fieldErrors.barangay_id}>
        <BarangaySelect value={form.barangay_id} onChange={set('barangay_id')} />
      </FormField>

      <FormField id="description" label="Description" error={fieldErrors.description}>
        <Textarea id="description" rows={4} placeholder="Describe the animal and the situation." value={form.description} onChange={set('description')} />
      </FormField>

      <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <Checkbox checked={form.is_endangered} onChange={set('is_endangered')} />
        <span>I believe this is an endangered or protected species (flags it for priority review).</span>
      </label>

      <FormField label="Location" hint="Optional: pin where it was found">
        <LocationField value={location} onChange={setLocation} />
      </FormField>

      <FormField label="Photo" hint="Optional: helps identify the species">
        <PhotoField onChange={setPhoto} />
      </FormField>
    </ReportFormShell>
  );
}
