import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { ANIMAL_CONDITIONS, WILDLIFE_SPECIES } from '../../lib/reports';
import useBarangays from '../../lib/useBarangays';
import { colors, radius } from '../../theme';
import ReportFormShell, { Field } from '../../components/ReportFormShell';
import Select from '../../components/Select';
import BarangayPicker from '../../components/BarangayPicker';
import PhotoPicker from '../../components/PhotoPicker';
import LocationField from '../../components/LocationField';
import Checkbox from '../../components/Checkbox';

export default function WildlifeFormScreen() {
  const { token } = useAuth();
  const barangays = useBarangays();

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

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Picking a known species fills its name and (if blank) auto-fills the category.
  // "Other" clears the name so the resident can type a custom one.
  function onSpeciesChoice(v) {
    setSpeciesChoice(v);
    if (v === '__other__' || !v) {
      setForm((f) => ({ ...f, species_name: '' }));
      return;
    }
    const sp = WILDLIFE_SPECIES.find((s) => s.value === v);
    setForm((f) => ({
      ...f,
      species_name: v,
      species_category: f.species_category || (sp && sp.group ? sp.group : ''),
    }));
  }

  function validate() {
    const e = {};
    if (!form.species_name.trim()) e.species_name = 'Species name is required.';
    if (!form.animal_condition) e.animal_condition = 'Select the animal condition.';
    if (!form.barangay_id) e.barangay_id = 'Please select a barangay.';
    if (form.description.trim().length < 10) e.description = 'Describe the sighting (at least 10 characters).';
    return e;
  }

  async function onSubmit() {
    setError('');
    const e = validate();
    setFieldErrors(e);
    if (Object.keys(e).length) return;

    const fd = new FormData();
    fd.append('species_name', form.species_name.trim());
    if (form.species_category.trim()) fd.append('species_category', form.species_category.trim());
    fd.append('animal_condition', form.animal_condition);
    fd.append('description', form.description.trim());
    fd.append('barangay_id', String(form.barangay_id));
    fd.append('is_endangered', form.is_endangered ? 'true' : 'false');
    if (location.latitude != null) {
      fd.append('latitude', String(location.latitude));
      fd.append('longitude', String(location.longitude));
    }
    if (photo) fd.append('photo', photo);

    setSubmitting(true);
    try {
      const res = await api.wildlife.create(fd, token);
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
      headerTitle="Wildlife Turnover"
      title="Wildlife Turnover"
      subtitle="Report a sighting or turn over rescued wildlife"
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      success={success}
    >
      <Select
        label="Species"
        options={WILDLIFE_SPECIES}
        value={speciesChoice}
        onChange={onSpeciesChoice}
        placeholder="Select a species"
        error={otherSpecies ? undefined : fieldErrors.species_name}
      />

      {otherSpecies ? (
        <Field label="Species name" error={fieldErrors.species_name}>
          <TextInput
            style={styles.input}
            placeholder="e.g. Sea turtle, Tarsier"
            placeholderTextColor={colors.placeholder}
            value={form.species_name}
            onChangeText={set('species_name')}
          />
        </Field>
      ) : null}

      <Field label="Category" hint="Optional: e.g. Reptile, Bird, Mammal">
        <TextInput
          style={styles.input}
          placeholder="Reptile / Bird / Mammal…"
          placeholderTextColor={colors.placeholder}
          value={form.species_category}
          onChangeText={set('species_category')}
        />
      </Field>

      <Select
        label="Animal condition"
        options={ANIMAL_CONDITIONS}
        value={form.animal_condition}
        onChange={set('animal_condition')}
        placeholder="Select condition"
        error={fieldErrors.animal_condition}
      />

      <BarangayPicker
        items={barangays}
        value={form.barangay_id}
        onChange={set('barangay_id')}
        error={fieldErrors.barangay_id}
      />

      <Field label="Description" error={fieldErrors.description}>
        <TextInput
          style={styles.textarea}
          placeholder="Describe the animal and the situation."
          placeholderTextColor={colors.placeholder}
          value={form.description}
          onChangeText={set('description')}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </Field>

      <View style={styles.flag}>
        <Checkbox checked={form.is_endangered} onChange={set('is_endangered')}>
          I believe this is an endangered or protected species (flags it for priority review).
        </Checkbox>
      </View>

      <Field label="Location" hint="Optional: pin where it was found">
        <LocationField value={location} onChange={setLocation} />
      </Field>

      <Field label="Photo" hint="Optional: helps identify the species">
        <PhotoPicker onChange={setPhoto} />
      </Field>
    </ReportFormShell>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
  },
  textarea: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  flag: {
    backgroundColor: colors.tint,
    borderRadius: radius.md,
    padding: 14,
  },
});
