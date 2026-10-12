import { useMemo, useState } from 'react';
import { View, Text, TextInput, Image, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api, fileUrl } from '../../api/client';
import { ANIMAL_CONDITIONS, TURNOVER_METHODS, humanize } from '../../lib/reports';
import { FORM_TL } from '../../lib/tagalog';
import useBarangays from '../../lib/useBarangays';
import useSpecies from '../../lib/useSpecies';
import { withOtherDetail, OTHER_DETAIL_MAX, DESCRIPTION_MAX } from '../../lib/otherCategory';
import { HAZARD_LABEL, hasHazard } from '../../lib/speciesLabels';
import { colors, radius } from '../../theme';
import ReportFormShell, { Field } from '../../components/ReportFormShell';
import Select from '../../components/Select';
import BarangayPicker from '../../components/BarangayPicker';
import PhotoPicker from '../../components/PhotoPicker';
import LocationField from '../../components/LocationField';
import ConfirmDialog, { useConfirm } from '../../components/ConfirmDialog';
import PreviewableImage from '../../components/PreviewableImage';

// The three options offered for "Other", mirroring the SpeciesCategory enum.
// Hoisted so the array keeps referential equality across renders.
const OTHER_CATEGORIES = [
  { value: 'Bird', label: 'Bird' },
  { value: 'Mammal', label: 'Mammal' },
  { value: 'Reptile', label: 'Reptile' },
];

// One selectable species. accessibilityRole="radio" plus the checked state is
// what tells a screen reader this is one choice among several, rather than a
// list of buttons that each do something.
function SpeciesOption({ value, checked, onPick, title, subtitle, photo }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={[styles.option, checked && styles.optionActive]}
      onPress={() => onPick(value)}
    >
      {photo ? (
        <Image source={{ uri: fileUrl(photo) }} style={styles.optionThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.optionThumb, styles.optionThumbEmpty]} />
      )}
      <View style={{ flex: 1 }}>
        {/* Two lines, not one: measured on the web picker at 375px, "Black-crowned
            Night Heron" and "Southeast Asian Box Turtle" both overran a single
            line, and a clipped species name is the one thing on this form a
            resident cannot afford to misread. */}
        <Text style={[styles.optionTitle, checked && styles.optionTitleActive]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.optionSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

// The hazard badge and the species' own handling note, shown ON THE FORM and
// not only on the website's public species guide. The person filling this in is
// the one standing near the animal; they have no reason to have opened a guide
// page first, and "keep your distance" is worth nothing on a screen they never
// reach. Renders nothing when the catalogue row has neither.
function SafetyNote({ species }) {
  const hazard = hasHazard(species.hazard);
  if (!hazard && !species.handling_note) return null;
  return (
    <View style={{ gap: 6, marginTop: 6 }}>
      {hazard ? (
        <Text style={styles.hazardBadge}>
          {HAZARD_LABEL[species.hazard] || humanize(species.hazard)}
        </Text>
      ) : null}
      {species.handling_note ? (
        <View style={styles.handlingBox}>
          <Text style={styles.handlingText}>
            <Text style={styles.handlingLead}>Safe handling: </Text>
            {species.handling_note}
          </Text>
          <Text style={styles.idMeta}>{FORM_TL.species_handling}</Text>
        </View>
      ) : null}
    </View>
  );
}

// A heading plus its rows. Renders nothing when the search has emptied the
// group, so a filtered list never shows a heading over no options.
function SpeciesGroup({ title, subtitle, tone, rows, value, onPick }) {
  if (!rows.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.groupHeader, tone]}>
        {title}
        {subtitle ? <Text style={styles.groupHeaderSub}>{`  ${subtitle}`}</Text> : null}
      </Text>
      {rows.map((s) => (
        <SpeciesOption
          key={s.name}
          value={s.name}
          checked={value === s.name}
          onPick={onPick}
          title={s.name}
          subtitle={s.local_name ? `“${s.local_name}”` : s.scientific_name}
          photo={s.photo_path}
        />
      ))}
    </View>
  );
}

export default function WildlifeFormScreen() {
  const { token } = useAuth();
  const barangays = useBarangays();

  const [form, setForm] = useState({
    species_category: '',
    animal_condition: '',
    turnover_method: '',
    description: '',
    barangay_id: '',
    address_details: '',
  });
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const [photo, setPhoto] = useState(null);
  // A catalogue species NAME, the literal 'Other', or '' before a pick. The
  // single source for which species is selected: it is what gets posted as
  // species_name, so there is no second copy in `form` to fall out of step.
  const [speciesChoice, setSpeciesChoice] = useState('');
  const [speciesQuery, setSpeciesQuery] = useState('');
  // What the resident types when the animal is not in the list. It is NOT posted
  // as species_name - that is a foreign key - fullDescription folds it into the
  // description's first line instead.
  const [otherDetail, setOtherDetail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmProps, ask] = useConfirm();
  const [success, setSuccess] = useState(null);

  const {
    common, endangered, byName,
    loading: speciesLoading, error: speciesError,
  } = useSpecies();

  // The two groups, kept apart and SHOWN on the form rather than folded inside a
  // dropdown a resident has to open before meeting them. Which group an animal
  // falls in changes what happens to the report - is_endangered drives priority
  // review and the coordinate obfuscation on the public map.
  // Filtered by what the resident typed, including the LOCAL name - "sawa" finds
  // Reticulated Python. A heading only appears for a group that still has rows,
  // and "Other" is always last so a filter that matches nothing is never a dead
  // end. The picked species stays listed so narrowing the search can never hide
  // the choice the resident already made.
  const q = speciesQuery.trim().toLowerCase();
  const { commonShown, endangeredShown, nothingMatches } = useMemo(() => {
    const matches = (s) => {
      if (!q || s.name === speciesChoice) return true;
      return [s.name, s.scientific_name, s.local_name]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q));
    };
    const c = common.filter(matches);
    const e = endangered.filter(matches);
    return {
      commonShown: c,
      endangeredShown: e,
      nothingMatches: Boolean(q) && !c.length && !e.length,
    };
  }, [common, endangered, q, speciesChoice]);

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
    // Required here and optional at the API - see the web form and the validator.
    if (!form.turnover_method) e.turnover_method = 'Tell us how the animal will reach CENRO.';
    if (!form.barangay_id) e.barangay_id = 'Please select a barangay.';
    // A pin OR a landmark - mirrors the API rule in
    // backend/src/validators/location.validators.js.
    const hasPin = location.latitude != null && location.longitude != null;
    if (!hasPin && !form.address_details.trim()) {
      e.location = 'Pin the location on the map, or describe the address and nearest landmark.';
    }
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

    // Asked only after validate() passes, so nobody confirms a form that is
    // about to be rejected, and before any FormData or submitting state.
    const ok = await ask({
      title: 'Ipadala na sa CENRO?',
      body: 'Matatanggap agad ito ng CENRO, at pwede mo itong sundan sa My Reports.',
      confirmLabel: 'Ipadala',
      cancelLabel: 'Hindi pa',
    });
    if (!ok) return;

    const fd = new FormData();
    // Always a catalogue name or 'Other', because that is all the picker offers.
    fd.append('species_name', speciesChoice);
    // The server derives the category from the species. This is only the
    // resident's answer for "Other", which has none of its own.
    if (isOther && form.species_category) fd.append('species_category', form.species_category);
    fd.append('animal_condition', form.animal_condition);
    fd.append('turnover_method', form.turnover_method);
    fd.append('description', fullDescription);
    fd.append('barangay_id', String(form.barangay_id));
    if (form.address_details.trim()) fd.append('address_details', form.address_details.trim());
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
        // `error` is still passed: without it, a Submit tap in this state sets
        // species_name = 'Select a species.' with nothing on screen to show it,
        // so the button would appear to do nothing at all.
        <Field label="Species" hint={FORM_TL.species_name} error={fieldErrors.species_name}>
          <Text style={styles.speciesError}>{speciesError}</Text>
        </Field>
      ) : (
        <>
          <Field label="Find a species" hint={FORM_TL.species_filter}>
            <TextInput
              style={styles.input}
              placeholder="e.g. python, sawa, Varanus"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              value={speciesQuery}
              onChangeText={setSpeciesQuery}
            />
          </Field>
          <Field label="Species" hint={FORM_TL.species_name} error={fieldErrors.species_name}>
            {speciesLoading ? (
              // The groups are empty until the catalogue arrives, so without this
              // the field would show only the "Other" row and read as a list with
              // one entry rather than one that has not loaded.
              <Text style={styles.idMeta}>Loading species…</Text>
            ) : (
              <View style={{ gap: 12 }}>
                <SpeciesGroup
                  title="Common species"
                  subtitle={FORM_TL.species_group_common}
                  rows={commonShown}
                  value={speciesChoice}
                  onPick={onSpeciesChoice}
                />
                <SpeciesGroup
                  title="Endangered or protected species"
                  subtitle={FORM_TL.species_group_endangered}
                  tone={styles.groupHeaderProtected}
                  rows={endangeredShown}
                  value={speciesChoice}
                  onPick={onSpeciesChoice}
                />
                {/* Always last and never filtered out, so a search that matches
                    nothing is not a dead end. */}
                <SpeciesOption
                  value="Other"
                  checked={speciesChoice === 'Other'}
                  onPick={onSpeciesChoice}
                  title="Other (not in this list)…"
                  subtitle={FORM_TL.species_other}
                />
              </View>
            )}
          </Field>
          {nothingMatches ? <Text style={styles.idMeta}>{FORM_TL.species_none}</Text> : null}
        </>
      )}

      {selected && !isOther ? (
        <View style={styles.idCard}>
          {/* No visible credit line here: it was clutter on the one screen a
              resident has to read quickly. The photos are CC BY / CC BY-SA and
              still require attribution, so it moves into the accessibility label
              and the public species guide on the web carries the full, readable
              credit list for every catalogue photo. Do not drop it from the
              label without putting the attribution somewhere a reader reaches. */}
          {selected.photo_path ? (
            <PreviewableImage
              source={{ uri: fileUrl(selected.photo_path) }}
              label={`Reference photograph of a ${selected.name}`}
              caption={selected.photo_credit ? `Photo: ${selected.photo_credit}` : undefined}
              style={styles.idPhoto}
            />
          ) : null}
          <Text style={styles.idName}>{selected.name}</Text>
          {selected.scientific_name ? <Text style={styles.idSci}>{selected.scientific_name}</Text> : null}
          {selected.local_name ? (
            <Text style={styles.idMeta}>{`${FORM_TL.species_also_called} “${selected.local_name}”`}</Text>
          ) : null}
          {selected.body_description ? <Text style={styles.idBody}>{selected.body_description}</Text> : null}
          <Text style={styles.idMeta}>
            {[
              selected.category,
              selected.biome && `${FORM_TL.species_found_in}: ${humanize(selected.biome)}`,
              selected.indicator && humanize(selected.indicator),
            ].filter(Boolean).join(' · ')}
          </Text>
          {selected.is_endangered ? (
            <Text style={styles.idProtected}>
              {FORM_TL.species_protected}
            </Text>
          ) : null}
          <SafetyNote species={selected} />
        </View>
      ) : null}

      {/* "Other" has a catalogue row of its own and it carries the most
          important handling note in the set - treat an unidentified animal as
          dangerous. The identification card is suppressed for it (there is no
          animal to identify), so without this the one person who does not know
          what they are looking at got no safety guidance at all. */}
      {isOther && byName.Other?.handling_note ? (
        <View style={styles.otherSafety}>
          <SafetyNote species={byName.Other} />
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

      {/* NO DEFAULT IS PRE-SELECTED. Either answer is a commitment - one says a
          person will walk into the office, the other books a trip for staff -
          and a pre-ticked option would record a commitment the reporter never
          made. Required here and optional at the API, so an installed APK that
          predates the question keeps working; see the validator's note. */}
      <Field
        label="How will the animal reach CENRO?"
        hint={FORM_TL.turnover_method}
        error={fieldErrors.turnover_method}
      >
        <View style={{ gap: 8 }}>
          {TURNOVER_METHODS.map((m) => {
            const active = form.turnover_method === m.value;
            return (
              <Pressable
                key={m.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={[styles.methodOption, active && styles.optionActive]}
                onPress={() => set('turnover_method')(m.value)}
              >
                <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{m.label}</Text>
                <Text style={styles.optionSub}>
                  {m.value === 'Walk_In' ? FORM_TL.turnover_walkin : FORM_TL.turnover_pickup}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

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

      <Field label="Location" hint={FORM_TL.location_found} error={fieldErrors.location}>
        <LocationField value={location} onChange={setLocation} required />
      </Field>

      <Field label="Address or landmark" hint={FORM_TL.address_details} error={fieldErrors.address_details}>
        <TextInput
          style={styles.input}
          placeholder="e.g. Beside the covered court, Purok 3"
          placeholderTextColor={colors.placeholder}
          maxLength={255}
          value={form.address_details}
          onChangeText={set('address_details')}
        />
      </Field>

      <Field label="Photo" hint={FORM_TL.photo_optional}>
        <PhotoPicker onChange={setPhoto} />
      </Field>
      <ConfirmDialog {...confirmProps} />
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
  // Safety guidance. Red for the hazard, matching the web form's red badge.
  hazardBadge: {
    alignSelf: 'flex-start',
    fontSize: 12, fontWeight: '700', color: '#991b1b',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm,
  },
  handlingBox: { gap: 4, backgroundColor: colors.tint, borderRadius: radius.sm, padding: 8 },
  handlingText: { fontSize: 12, color: colors.text },
  handlingLead: { fontWeight: '700' },
  otherSafety: {
    borderWidth: 1, borderColor: '#fcd34d', backgroundColor: '#fffbeb',
    borderRadius: radius.md, padding: 12,
  },
  // The two-group species picker, shown inline instead of inside a dropdown.
  groupHeader: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, color: colors.muted,
  },
  groupHeaderSub: { fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: colors.muted },
  // Amber, matching the web picker: a caution, not an error.
  groupHeaderProtected: { color: '#b45309' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.md,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.tint },
  // Same chrome as a species row but stacked, since the label is a sentence.
  methodOption: {
    gap: 3,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.md,
  },
  optionThumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.border },
  optionThumbEmpty: { backgroundColor: colors.tint },
  optionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  optionTitleActive: { color: colors.primary },
  optionSub: { fontSize: 12, color: colors.muted },
  idName: { fontSize: 15, fontWeight: '700', color: colors.text },
  idSci: { fontSize: 13, fontStyle: 'italic', color: colors.muted },
  idBody: { fontSize: 13, color: colors.text },
  idMeta: { fontSize: 12, color: colors.muted },
  // Amber, matching the web form's text-amber-700: a caution, not an error.
  idProtected: { fontSize: 12, fontWeight: '600', color: '#b45309', marginTop: 4 },
});
