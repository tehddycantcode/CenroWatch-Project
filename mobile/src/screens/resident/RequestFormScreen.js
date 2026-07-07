import { useState } from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { REQUEST_TYPES } from '../../lib/reports';
import useBarangays from '../../lib/useBarangays';
import { colors, radius } from '../../theme';
import ReportFormShell, { Field } from '../../components/ReportFormShell';
import Select from '../../components/Select';
import BarangayPicker from '../../components/BarangayPicker';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function RequestFormScreen() {
  const { token } = useAuth();
  const barangays = useBarangays();

  const [form, setForm] = useState({
    request_type: '',
    description: '',
    barangay_id: '',
    requested_quantity: '',
    preferred_schedule: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  function validate() {
    const e = {};
    if (!form.request_type) e.request_type = 'Select a service type.';
    if (!form.barangay_id) e.barangay_id = 'Please select a barangay.';
    if (form.description.trim().length < 10) e.description = 'Describe your request (at least 10 characters).';
    if (form.preferred_schedule.trim() && !DATE_RE.test(form.preferred_schedule.trim()))
      e.preferred_schedule = 'Use the format YYYY-MM-DD.';
    return e;
  }

  async function onSubmit() {
    setError('');
    const e = validate();
    setFieldErrors(e);
    if (Object.keys(e).length) return;

    const fd = new FormData();
    fd.append('request_type', form.request_type);
    fd.append('description', form.description.trim());
    fd.append('barangay_id', String(form.barangay_id));
    if (form.requested_quantity.trim()) fd.append('requested_quantity', form.requested_quantity.trim());
    if (form.preferred_schedule.trim()) fd.append('preferred_schedule', form.preferred_schedule.trim());

    setSubmitting(true);
    try {
      const res = await api.requests.create(fd, token);
      setSuccess(res.data.request.tracking_id);
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
      headerTitle="Request a Service"
      title="Environmental Service Request"
      subtitle="Seedlings, garbage hauling, creek cleaning, education"
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      success={success}
    >
      <Select
        label="Service type"
        options={REQUEST_TYPES}
        value={form.request_type}
        onChange={set('request_type')}
        placeholder="Select a service"
        error={fieldErrors.request_type}
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
          placeholder="Tell us what you need and any helpful detail."
          placeholderTextColor={colors.placeholder}
          value={form.description}
          onChangeText={set('description')}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </Field>

      <Field label="Quantity" hint="Optional: e.g. number of seedlings">
        <TextInput
          style={styles.input}
          placeholder="e.g. 25"
          placeholderTextColor={colors.placeholder}
          value={form.requested_quantity}
          onChangeText={(v) => set('requested_quantity')(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
        />
      </Field>

      <Field label="Preferred date" hint="Optional: format YYYY-MM-DD" error={fieldErrors.preferred_schedule}>
        <TextInput
          style={styles.input}
          placeholder="2026-06-25"
          placeholderTextColor={colors.placeholder}
          value={form.preferred_schedule}
          onChangeText={set('preferred_schedule')}
          keyboardType="numbers-and-punctuation"
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
