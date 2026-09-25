import { useState } from 'react';
import { requestApi } from '@/lib/api';
import { useCategories } from '@/lib/useCategories';
import { isOtherCategory, withOtherDetail, OTHER_DETAIL_MAX, DESCRIPTION_MAX } from '@/lib/otherCategory';
import { FORM_TL } from '@/lib/tagalog';
import { Sprout } from 'lucide-react';
import ReportFormShell from '@/components/resident/ReportFormShell';
import BarangaySelect from '@/components/resident/BarangaySelect';
import PhotoField from '@/components/resident/PhotoField';
import { FormField } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function ServiceRequestFormPage() {
  // Categories come from the API, not a compiled-in array, so an Admin can
  // add or retire one without a redeploy. categoriesError is surfaced next to
  // the field below: an empty dropdown with no explanation would look like the
  // form is broken rather than like the list failed to load.
  const { requestTypes, error: categoriesError } = useCategories();

  const [form, setForm] = useState({
    request_type: '',
    barangay_id: '',
    description: '',
    requested_quantity: '',
    preferred_schedule: '',
  });
  const [doc, setDoc] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const needsOther = isOtherCategory(form.request_type);

  // Changing the type clears anything typed under "Other", so switching back
  // to a normal category cannot submit a stale detail line.
  const setType = (e) =>
    setForm((f) => ({ ...f, request_type: e.target.value, type_other: '' }));

  function validate() {
    const errs = {};
    if (!form.request_type) errs.request_type = 'Please choose a request type.';
    if (needsOther && !form.type_other.trim()) {
      errs.type_other = 'Please describe the service you need.';
    }
    if (!form.barangay_id) errs.barangay_id = 'Please select a barangay.';
    if (form.description.trim().length < 10) errs.description = 'Describe your request (at least 10 characters).';
    // The detail is prepended to the description, and the server caps that at
    // DESCRIPTION_MAX. Checked here so a long request fails on the field the
    // resident can actually see, rather than as a 422 about something else.
    if (withOtherDetail(form.description.trim(), form.type_other).length > DESCRIPTION_MAX) {
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
    fd.append('request_type', form.request_type);
    fd.append('barangay_id', form.barangay_id);
    // request_type is a foreign key, so the typed detail rides in the
    // description instead - as its first line. See lib/otherCategory.js.
    fd.append('description', withOtherDetail(form.description.trim(), form.type_other));
    if (form.requested_quantity) fd.append('requested_quantity', form.requested_quantity);
    if (form.preferred_schedule) fd.append('preferred_schedule', form.preferred_schedule);
    if (doc) fd.append('document', doc);

    setSubmitting(true);
    try {
      const res = await requestApi.create(fd);
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
      title="Request a Service"
      subtitle="Seedlings, hauling, creek cleaning, and more"
      icon={Sprout}
      tone="primary"
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      success={success}
      submitLabel="Submit Request"
    >
      <FormField
        id="request_type"
        label="Service type"
        hint={FORM_TL.request_type}
        error={fieldErrors.request_type || categoriesError}
      >
        <Select id="request_type" value={form.request_type} onChange={setType}>
          <option value="">Select a service</option>
          {requestTypes.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </FormField>

      {needsOther && (
        <FormField
          id="type_other"
          label="Please specify"
          hint={FORM_TL.type_other}
          error={fieldErrors.type_other}
        >
          <Input
            id="type_other"
            placeholder="e.g. Tree trimming along the road"
            maxLength={OTHER_DETAIL_MAX}
            value={form.type_other}
            onChange={set('type_other')}
          />
        </FormField>
      )}

      <FormField id="barangay_id" label="Barangay" hint={FORM_TL.barangay} error={fieldErrors.barangay_id}>
        <BarangaySelect value={form.barangay_id} onChange={set('barangay_id')} />
      </FormField>

      <FormField id="description" label="Description" hint={FORM_TL.description} error={fieldErrors.description}>
        <Textarea id="description" rows={4} placeholder="Describe what you need and why." value={form.description} onChange={set('description')} />
      </FormField>

      {/* Stacks on a phone: two number/date inputs side by side at 320px
          leaves each about 130px wide, and the date picker overflows. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField id="requested_quantity" label="Quantity" hint={`Optional. / ${FORM_TL.quantity}`}>
          <Input id="requested_quantity" type="number" min="1" placeholder="e.g. 50" value={form.requested_quantity} onChange={set('requested_quantity')} />
        </FormField>
        <FormField id="preferred_schedule" label="Preferred date" hint={`Optional. / ${FORM_TL.schedule}`}>
          <Input id="preferred_schedule" type="date" value={form.preferred_schedule} onChange={set('preferred_schedule')} />
        </FormField>
      </div>

      <FormField
        label="Supporting document"
        hint={`Optional: image or PDF (e.g. a letter). / ${FORM_TL.document}`}
      >
        <PhotoField onChange={setDoc} accept="image/*,application/pdf" label="Tap to attach a file" />
      </FormField>
    </ReportFormShell>
  );
}
