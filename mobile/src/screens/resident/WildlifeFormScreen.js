import { useMemo, useState } from 'react';
import { View, Text, TextInput, Image, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api, fileUrl } from '../../api/client';
import { ANIMAL_CONDITIONS, humanize } from '../../lib/reports';
import { FORM_TL } from '../../lib/tagalog';
import useBarangays from '../../lib/useBarangays';
import useSpecies from '../../lib/useSpecies';
import { withOtherDetail, OTHER_DETAIL_MAX, DESCRIPTION_MAX } from '../../lib/otherCategory';
import { colors, radius } from '../../theme';
import ReportFormShell, { Field } from '../../components/ReportFormShell';
import Select from '../../components/Select';
import BarangayPicker from '../../components/BarangayPicker';
import PhotoPicker from '../../components/PhotoPicker';
import LocationField from '../../components/LocationField';

// The three options offered for "Other", mirroring the SpeciesCategory enum.
// Hoisted so the array keeps referential equality across renders.
const OTHER_CATEGORIES = [
  { value: 'Bird', label: 'Bird' },
  { value: 'Mammal', label: 'Mammal' },
  { value: 'Reptile', label: 'Reptile' },
];

export default function WildlifeFormScreen() {
  const { token } = useAuth();
  const barangays = useBarangays();

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
    loading: speciesLoading, error: speciesError,
  } = useSpecies();

  // One flat list with header entries, which the Select renders as
  // non-pressable section headings (web gets this from <optgroup>).
  const speciesOptions = useMemo(() => {
    const out = [];
    if (common.length) {
      out.push({ header: true, label: 'Common species' });
      out.push(...common.map((s) => ({ value: s.name, label: s.name })));
    }
    if (endangered.length) {
      out.push({ header: true, label: 'Endangered or protected species' });
      out.push(...endangered.map((s) => ({ value: s.name, label: s.name })));
    }
    out.push({ value: 'Other', label: 'Other (not in this list)…' });
    return out;
  }, [common, endangered]);

  // The picked catalogue row, or null.
  const selected = byName[speciesChoice] || null;
  const isOther = speciesChoice === 'Other';

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // The description as the server receives it. species_name is a foreign key into
  // the catalogue, so a name typed under "Other" cannot go in it. It becomes the
  // description's first line instead, where it is the first thing staff read -
  // the same fold the complaint form does for its "Other" type.
  const fullDescription = isOther
    ? withOtherDetail(form.description.trim(), otherDetail)
    : form.description.trim();

  // No category copying any more - the server derives it from the catalogue.
  // The only category a human picks is the 3-way one shown for "Other", which
  // has no category of its own.
  function onSpeciesChoice(v) {
    setSpeciesChoice(v);
    setForm((f) => ({ ...f, species_category: '' }));
    setOtherDetail('');
  }

  function validate() {
    const e = {};
    if (!speciesChoice) e.species_name = 'Select a species.';
    // Required only for "Other", which has no category of its own. The three
    // options are a question a resident who saw the animal can answer.
    if (isOther && !form.species_category) {
      e.species_category = 'Tell us whether it is a bird, mammal or reptile.';
    }
    // The typed species name is deliberately NOT required. A resident who cannot
    // identify the animal is exactly who "Other" exists for, and demanding a
    // name would push them into guessing - which is worse than "Other" for both
    // the record and the staff reading it.
    if (!form.animal_condition) e.animal_condition = 'Select the animal condition.';
    if (!form.barangay_id) e.barangay_id = 'Please select a barangay.';
    if (location.latitude == null || location.longitude == null) e.location = 'Please pin the location on the map.';
    // 10 characters is the SERVER's rule (wildlife.validators.js: 10-5000), so a
    // shorter description is a 422 rather than an accepted report. Checked here
    // rather than weakened to "not empty".
    if (form.description.trim().length < 10) e.description = 'Describe the sighting (at least 10 characters).';
    // The typed name is prepended to the description, and the server caps that at
    // DESCRIPTION_MAX. Checked here so a long report fails on the field the
    // resident can actually see, rather than as a 422 about something else.
    if (fullDescription.length > DESCRIPTION_MAX) {
      e.description = `Description is too long (limit ${DESCRIPTION_MAX} characters).`;
    }
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit() {
    setError('');
    if (!validate()) return;

    const fd = new FormData();
    // Always a catalogue name or 'Other', because that is all the picker offers.
    fd.append('species_name', speciesChoice);
    // The server derives the category from the species. This is only the
    // resident's answer for "Other", which has none of its own.
    if (isOther && form.species_category) fd.append('species_category', form.species_category);
    fd.append('animal_condition', form.animal_condition);
    fd.append('description', fullDescription);
    fd.append('barangay_id', String(form.barangay_id));
    // is_endangered is deliberately NOT sent - derived from the catalogue.
    if (location.latitude != null) {
      fd.append('latitude', String(location.latitude));
      fd.append('longitude', String(location.longitude));
    }
    // Third argument is the multipart filename: the API derives the stored
    // file's extension from it.
    if (photo) fd.append('photo', photo.file, photo.name);

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
      {speciesError ? (
        // A picker with no options cannot be submitted, so this is stated
        // rather than shown as an empty dropdown.
        <Field label="Species" hint={FORM_TL.species_name}>
          <Text style={styles.speciesError}>{speciesError}</Text>
        </Field>
      ) : (
        <Select
          label="Species"
          hint={FORM_TL.species_name}
          options={speciesOptions}
          value={speciesChoice}
          onChange={onSpeciesChoice}
          placeholder={speciesLoading ? 'Loading species…' : 'Select a species'}
          error={fieldErrors.species_name}
        />
      )}

      {selected && !isOther ? (
        <View style={styles.idCard}>
          {selected.photo_path ? (
            <View>
              <Image
                source={{ uri: fileUrl(selected.photo_path) }}
                style={styles.idPhoto}
                resizeMode="cover"
                accessibilityLabel={`Reference photograph of a ${selected.name}`}
              />
              {/* The credit travels with the photo. The seeded photos are CC BY
                  or CC BY-SA, which require attribution wherever they are
                  shown - a phone screen included. */}
              {selected.photo_credit ? (
                <Text style={styles.idCredit}>Photo: {selected.photo_credit}</Text>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.idName}>{selected.name}</Text>
          {selected.scientific_name ? <Text style={styles.idSci}>{selected.scientific_name}</Text> : null}
          {selected.local_name ? (
            <Text style={styles.idMeta}>{`Also called “${selected.local_name}”`}</Text>
          ) : null}
          {selected.body_description ? <Text style={styles.idBody}>{selected.body_description}</Text> : null}
          <Text style={styles.idMeta}>
            {[
              selected.category,
              selected.biome && `Usually found in: ${humanize(selected.biome)}`,
              selected.indicator && humanize(selected.indicator),
            ].filter(Boolean).join(' · ')}
          </Text>
          {selected.is_endangered ? (
            <Text style={styles.idProtected}>
              Protected species. This report goes to priority review, and its exact location is hidden
              on the public map.
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* READ-ONLY, not hidden. The server derives this from the species, so an
          editable box would be a lie - but a resident should still be able to
          notice they picked the wrong animal. The only case where a human picks
          is "Other", which has no category of its own. */}
      {selected && selected.category ? (
        <Field label="Category" hint="Set automatically from the species you selected.">
          <Text style={styles.readOnly}>{selected.category}</Text>
        </Field>
      ) : null}

      {isOther ? (
        <Select
          label="What kind of animal is it?"
          options={OTHER_CATEGORIES}
          value={form.species_category}
          onChange={set('species_category')}
          placeholder="Select one"
          error={fieldErrors.species_category}
        />
      ) : null}

      {isOther ? (
        <Field label="Species name (if you know it)">
          <TextInput
            style={styles.input}
            placeholder="e.g. Sea turtle, Tarsier"
            placeholderTextColor={colors.placeholder}
            maxLength={OTHER_DETAIL_MAX}
            value={otherDetail}
            onChangeText={setOtherDetail}
          />
        </Field>
      ) : null}

      <Select
        label="Animal condition"
        hint={FORM_TL.animal_condition}
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
        hint={FORM_TL.barangay}
        error={fieldErrors.barangay_id}
      />

      <Field label="Description" hint={FORM_TL.description} error={fieldErrors.description}>
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

      {/* There is no "I believe this is an endangered species" checkbox. Endangered
          status comes from the species catalogue: it drives public-map coordinate
          obfuscation, and a reporter must not decide whether a rescue site is
          hidden from a poacher. The server ignores is_endangered if anything still
          sends it. */}

      <Field label="Location" hint={`Required: pin where it was found. / ${FORM_TL.location}`} error={fieldErrors.location}>
        <LocationField value={location} onChange={setLocation} required />
      </Field>

      <Field label="Photo" hint={`Optional: helps identify the species. / ${FORM_TL.photo}`}>
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
  // Same shape as `input`, so the derived category reads as a field the resident
  // simply cannot type in rather than as loose body text.
  readOnly: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.tint,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.text,
  },
  speciesError: { fontSize: 13, color: colors.danger, fontWeight: '500' },
  // The identification card: the reference photo and the catalogue's own words,
  // so a resident can check they picked the right animal before submitting.
  idCard: {
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
  },
  idPhoto: {
    width: '100%',
    height: 160,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  idCredit: { fontSize: 11, color: colors.muted, marginTop: 4 },
  idName: { fontSize: 15, fontWeight: '700', color: colors.text },
  idSci: { fontSize: 13, fontStyle: 'italic', color: colors.muted },
  idBody: { fontSize: 13, color: colors.text },
  idMeta: { fontSize: 12, color: colors.muted },
  // Amber, matching the web form's text-amber-700: a caution, not an error.
  idProtected: { fontSize: 12, fontWeight: '600', color: '#b45309', marginTop: 4 },
});
