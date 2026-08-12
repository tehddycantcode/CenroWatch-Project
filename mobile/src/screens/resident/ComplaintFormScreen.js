import { useRef, useState } from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { COMPLAINT_TYPES } from '../../lib/reports';
import { FORM_TL } from '../../lib/tagalog';
import useBarangays from '../../lib/useBarangays';
import { colors, radius } from '../../theme';
import ReportFormShell, { Field } from '../../components/ReportFormShell';
import Select from '../../components/Select';
import BarangayPicker from '../../components/BarangayPicker';
import PhotoPicker from '../../components/PhotoPicker';
import LocationField from '../../components/LocationField';

// Local YYYY-MM-DD without relying on Intl (Hermes has limited Intl support).
const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export default function ComplaintFormScreen() {
  const { token } = useAuth();
  const barangays = useBarangays();

  const [form, setForm] = useState({ complaint_type: '', description: '', barangay_id: '', address_details: '', observed_at: todayStr() });
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const photoRef = useRef(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  function validate() {
    const e = {};
    if (!form.complaint_type) e.complaint_type = 'Select a complaint type.';
    if (!form.barangay_id) e.barangay_id = 'Please select a barangay.';
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
    fd.append('description', form.description.trim());
    fd.append('barangay_id', String(form.barangay_id));
    if (form.address_details.trim()) fd.append('address_details', form.address_details.trim());
    if (form.observed_at) fd.append('observed_at', form.observed_at);
    if (location.latitude != null) {
      fd.append('latitude', String(location.latitude));
      fd.append('longitude', String(location.longitude));
    }
    fd.append('photo', photoRef.current); // required

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
    >
      <Select
        label="Complaint type"
        hint={FORM_TL.complaint_type}
        options={COMPLAINT_TYPES}
        value={form.complaint_type}
        onChange={set('complaint_type')}
        placeholder="Select a complaint type"
        error={fieldErrors.complaint_type}
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

      <Field label="Date issue was observed" hint={`When you saw it (YYYY-MM-DD). Defaults to today. / ${FORM_TL.observed_at}`} error={fieldErrors.observed_at}>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.placeholder}
          value={form.observed_at}
          onChangeText={set('observed_at')}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
      </Field>

      <Field label="Location" hint={`Optional: pin where it happened. / ${FORM_TL.location}`}>
        <LocationField value={location} onChange={setLocation} />
      </Field>

      <Field label="Photo (required)" hint={`Attach at least one photo as evidence. / ${FORM_TL.photo}`} error={fieldErrors.photo}>
        <PhotoPicker
          onChange={(f) => {
            photoRef.current = f;
            if (f) setFieldErrors((p) => ({ ...p, photo: undefined }));
          }}
        />
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
});
