import { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { useCategories } from '../../lib/useCategories';
import { isOtherCategory, withOtherDetail, OTHER_DETAIL_MAX, DESCRIPTION_MAX } from '../../lib/otherCategory';
import { todayISO } from '../../lib/calendar';
import { FORM_TL, COPY_TL } from '../../lib/tagalog';
import useBarangays from '../../lib/useBarangays';
import { colors, radius } from '../../theme';
import ReportFormShell, { Field } from '../../components/ReportFormShell';
import Select from '../../components/Select';
import BarangayPicker from '../../components/BarangayPicker';
import PhotoPicker from '../../components/PhotoPicker';
import DatePicker from '../../components/DatePicker';
import LocationField from '../../components/LocationField';
import Checkbox from '../../components/Checkbox';

// todayISO lives in lib/calendar now, alongside the rest of the picker's date
// arithmetic and with tests. It formats the LOCAL calendar day rather than the
// UTC one, which is the whole point: at UTC+8, a UTC-based version returns
// yesterday for anyone filing before 08:00.

export default function ComplaintFormScreen() {
  // Categories come from the API, not a compiled-in array, so a new one
  // appears on the next app launch with no store release.
  const { complaintTypes, error: categoriesError } = useCategories();

  const { token } = useAuth();
  const barangays = useBarangays();

  const [form, setForm] = useState({ complaint_type: '', type_other: '', description: '', barangay_id: '', address_details: '', observed_at: todayISO() });
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const photoRef = useRef(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  // Kept out of `form` on purpose: it is not a detail about the incident, it
  // decides who the report belongs to. Separate state means nothing that
  // spreads `form` can carry it somewhere it does not belong.
  const [anonymous, setAnonymous] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const needsOther = isOtherCategory(form.complaint_type);

  // Changing the type clears anything typed under "Other", so switching back
  // to a normal category cannot submit a stale detail line.
  const setType = (v) => setForm((f) => ({ ...f, complaint_type: v, type_other: '' }));

  function validate() {
    const e = {};
    if (!form.complaint_type) e.complaint_type = 'Select a complaint type.';
    if (needsOther && !form.type_other.trim()) e.type_other = 'Please describe the type of complaint.';
    if (withOtherDetail(form.description.trim(), form.type_other).length > DESCRIPTION_MAX) {
      e.description = `Description is too long (limit ${DESCRIPTION_MAX} characters).`;
    }
    if (!form.barangay_id) e.barangay_id = 'Please select a barangay.';
    if (location.latitude == null || location.longitude == null) e.location = 'Please pin the location on the map.';
    if (form.description.trim().length < 10) e.description = 'Describe the concern (at least 10 characters).';
    if (!photoRef.current) e.photo = 'A photo is required. Please attach at least one.';
    return e;
  }

  async function onSubmit() {
    setError('');
    const e = validate();
    setFieldErrors(e);
    if (Object.keys(e).length) return;

    const fd = new FormData();
    fd.append('complaint_type', form.complaint_type);
    // complaint_type is a foreign key, so the typed detail rides in the
    // description instead - as its first line. See lib/otherCategory.js.
    fd.append('description', withOtherDetail(form.description.trim(), form.type_other));
    fd.append('barangay_id', String(form.barangay_id));
    if (form.address_details.trim()) fd.append('address_details', form.address_details.trim());
    if (form.observed_at) fd.append('observed_at', form.observed_at);
    if (location.latitude != null) {
      fd.append('latitude', String(location.latitude));
      fd.append('longitude', String(location.longitude));
    }
    // Third argument is the multipart filename: the API derives the stored
    // file's extension from it.
    fd.append('photo', photoRef.current.file, photoRef.current.name); // required
    // String(), because multipart carries no booleans - the server validator's
    // .toBoolean() turns it back. Always sent, so the value is explicit rather
    // than inferred from the field being absent.
    fd.append('is_anonymous', String(anonymous));

    setSubmitting(true);
    try {
      const res = await api.complaints.create(fd, token);
      setSuccess(res.data.complaint.tracking_id);
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
      headerTitle="Report a Complaint"
      title="Environmental Complaint"
      subtitle="Report illegal dumping, burning, noise, pollution and more"
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      success={success}
      submitLabel={anonymous ? 'Submit Anonymously' : 'Submit Report'}
      anonymous={anonymous}
    >
      <Select
        label="Complaint type"
        hint={FORM_TL.complaint_type}
        options={complaintTypes}
        value={form.complaint_type}
        onChange={setType}
        placeholder="Select a complaint type"
        error={fieldErrors.complaint_type || categoriesError}
      />

      {needsOther ? (
        <Field label="Please specify" hint={FORM_TL.type_other} error={fieldErrors.type_other}>
          <TextInput
            style={styles.input}
            placeholder="e.g. Dead fish in the creek"
            placeholderTextColor={colors.placeholder}
            maxLength={OTHER_DETAIL_MAX}
            value={form.type_other}
            onChangeText={set('type_other')}
          />
        </Field>
      ) : null}

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
          placeholder="Describe what you observed, when, and where."
          placeholderTextColor={colors.placeholder}
          value={form.description}
          onChangeText={set('description')}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </Field>

      <Field label="Address details" hint="Optional: landmark or street">
        <TextInput
          style={styles.input}
          placeholder="e.g. near the creek behind the market"
          placeholderTextColor={colors.placeholder}
          value={form.address_details}
          onChangeText={set('address_details')}
        />
      </Field>

      <Field label="Date issue was observed" hint={`When you saw it. Defaults to today. / ${FORM_TL.observed_at}`} error={fieldErrors.observed_at}>
        {/* max=today because the API refuses an observed date in the future;
            the calendar should not offer one either. */}
        <DatePicker
          value={form.observed_at}
          onChange={set('observed_at')}
          max={todayISO()}
          placeholder="Select the date"
        />
      </Field>

      <Field label="Location" hint={`Required: pin where it happened. / ${FORM_TL.location}`} error={fieldErrors.location}>
        <LocationField value={location} onChange={setLocation} required />
      </Field>

      <Field label="Photo (required)" hint={`Attach at least one photo as evidence. / ${FORM_TL.photo}`} error={fieldErrors.photo}>
        <PhotoPicker
          onChange={(f) => {
            photoRef.current = f;
            if (f) setFieldErrors((p) => ({ ...p, photo: undefined }));
          }}
        />
      </Field>

      {/* EVERY CLAUSE BELOW IS A PROMISE THE CODE KEEPS - check before editing.
          user_id is stored NULL, so the report cannot appear in My Reports
          (that query filters on user_id), no email or push notification is
          sent (both are addressed by looking the user up), and no audit row
          records who filed it. The photo paragraph is a WARNING about a
          limitation, not a promise: nothing strips image metadata today. */}
      <View style={styles.anonBox}>
        <Checkbox
          checked={anonymous}
          onChange={setAnonymous}
          accessibilityLabel="File this report anonymously"
        >
          File this report anonymously
        </Checkbox>

        {anonymous ? (
          <View style={styles.anonDetail}>
            <Text style={styles.anonStrong}>
              CENRO will not know who filed this, and that is permanent.
            </Text>
            <Text style={styles.anonText}>
              It will not appear in My Reports, you will get no email or app updates about it,
              and we cannot link it back to your account later even if you ask us to.
            </Text>
            <Text style={styles.anonText}>
              Save the reference number on the next screen. It is the only way to check the
              status, and it shows status only - not the photo or CENRO{'’'}s notes.
            </Text>
            <Text style={styles.anonText}>
              A photo is still required. Avoid anything that identifies you: your face, your
              home, your vehicle, a plate number. Photo files can also carry the location and
              the phone they were taken with.
            </Text>
            <Text style={styles.anonText}>{COPY_TL.anonymousHint}</Text>
          </View>
        ) : null}
      </View>
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
  anonBox: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: 14,
    gap: 10,
  },
  anonDetail: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  anonStrong: { fontSize: 13, fontWeight: '700', color: colors.text, lineHeight: 19 },
  anonText: { fontSize: 13, color: colors.muted, lineHeight: 19 },
});
