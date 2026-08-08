import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { complaintApi } from '@/lib/api';
import { COMPLAINT_TYPES } from '@/lib/reports';
import { FORM_TL } from '@/lib/tagalog';
import ReportFormShell from '@/components/resident/ReportFormShell';
import BarangaySelect from '@/components/resident/BarangaySelect';
import PhotoField from '@/components/resident/PhotoField';
import LocationField from '@/components/resident/LocationField';
import { FormField } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

// Local YYYY-MM-DD (en-CA renders ISO date), used as today's default + max.
const todayStr = () => new Date().toLocaleDateString('en-CA');

export default function ComplaintFormPage() {
  const [form, setForm] = useState({ barangay_id: '', complaint_type: '', description: '', observed_at: todayStr() });
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const photoRef = useRef(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const errs = {};
    if (!form.barangay_id) errs.barangay_id = 'Please select a barangay.';
    if (!form.complaint_type) errs.complaint_type = 'Please choose a complaint type.';
    if (form.description.trim().length < 10) errs.description = 'Describe the issue (at least 10 characters).';
    if (!photoRef.current) errs.photo = 'A photo is required. Please attach at least one.';
    return errs;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    const fd = new FormData();
    fd.append('barangay_id', form.barangay_id);
    fd.append('complaint_type', form.complaint_type);
    fd.append('description', form.description.trim());
    if (form.observed_at) fd.append('observed_at', form.observed_at);
    if (location.latitude != null) {
      fd.append('latitude', location.latitude);
      fd.append('longitude', location.longitude);
    }
    fd.append('photo', photoRef.current); // required

    setSubmitting(true);
    try {
      const res = await complaintApi.create(fd);
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
      title="Report a Complaint"
      subtitle="Help protect Cabuyao's environment"
      icon={Trash2}
      tone="amber"
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      success={success}
      submitLabel="Submit Report"
    >
      <FormField
        id="complaint_type"
        label="Complaint type"
        hint={FORM_TL.complaint_type}
        error={fieldErrors.complaint_type}
      >
        <Select id="complaint_type" value={form.complaint_type} onChange={set('complaint_type')}>
          <option value="">Select a type</option>
          {COMPLAINT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </FormField>

      <FormField
        id="barangay_id"
        label="Barangay"
        hint={FORM_TL.barangay}
        error={fieldErrors.barangay_id}
      >
        <BarangaySelect value={form.barangay_id} onChange={set('barangay_id')} />
      </FormField>

      <FormField
        id="description"
        label="Description"
        hint={FORM_TL.description}
        error={fieldErrors.description}
      >
        <Textarea
          id="description"
          rows={4}
          placeholder="What happened? Include details like time, smell, or how long it has been going on."
          value={form.description}
          onChange={set('description')}
        />
      </FormField>

      <FormField
        id="observed_at"
        label="Date issue was observed"
        hint={`When did you actually see the problem? Defaults to today. / ${FORM_TL.observed_at}`}
      >
        <Input
          id="observed_at"
          type="date"
          max={todayStr()}
          value={form.observed_at}
          onChange={set('observed_at')}
        />
      </FormField>

      <FormField label="Location" hint={`Optional: pin where it happened. / ${FORM_TL.location}`}>
        <LocationField value={location} onChange={setLocation} />
      </FormField>

      <FormField
        label="Photo (required)"
        hint={`Attach at least one photo as evidence. / ${FORM_TL.photo}`}
        error={fieldErrors.photo}
      >
        <PhotoField
          onChange={(f) => {
            photoRef.current = f;
            if (f) setFieldErrors((p) => ({ ...p, photo: undefined }));
          }}
        />
      </FormField>
    </ReportFormShell>
  );
}
