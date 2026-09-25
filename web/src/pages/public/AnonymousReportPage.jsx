import { useState } from 'react';
import { Link } from 'react-router-dom';
import { complaintApi } from '@/lib/api';
import { useCategories } from '@/lib/useCategories';
import { isOtherCategory, withOtherDetail, OTHER_DETAIL_MAX, DESCRIPTION_MAX } from '@/lib/otherCategory';
import { FORM_TL, COPY_TL } from '@/lib/tagalog';
import PublicHeader from '@/components/public/PublicHeader';
import BarangaySelect from '@/components/resident/BarangaySelect';
import PhotoField from '@/components/resident/PhotoField';
import LocationField from '@/components/resident/LocationField';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { FormField } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

function SuccessCard({ trackingId }) {
  return (
    <Card className="mx-auto max-w-xl space-y-4 p-8 text-center">
      <div className="text-4xl">🕵️</div>
      <h2 className="font-display text-2xl">Anonymous report submitted</h2>
      <p className="text-muted-foreground">
        We did not record your identity. Save this reference number. It is the only way to follow up
        on your report.
      </p>
      <div className="text-2xl font-bold tracking-wide text-primary">{trackingId}</div>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <Link to={`/track?id=${trackingId}`}>
          <Button>Track this report</Button>
        </Link>
        <Link to="/">
          <Button variant="outline">Back to home</Button>
        </Link>
      </div>
    </Card>
  );
}

export default function AnonymousReportPage() {
  // Categories come from the API, not a compiled-in array, so an Admin can
  // add or retire one without a redeploy. categoriesError is surfaced next to
  // the field below: an empty dropdown with no explanation would look like the
  // form is broken rather than like the list failed to load.
  const { complaintTypes, error: categoriesError } = useCategories();

  const [form, setForm] = useState({ barangay_id: '', complaint_type: '', description: '', type_other: '' });
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const [photo, setPhoto] = useState(null);
  const [consent, setConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const needsOther = isOtherCategory(form.complaint_type);

  // Changing the type clears anything typed under "Other", so switching back
  // to a normal category cannot submit a stale detail line.
  const setType = (e) =>
    setForm((f) => ({ ...f, complaint_type: e.target.value, type_other: '' }));

  function validate() {
    const errs = {};
    if (!form.barangay_id) errs.barangay_id = 'Please select a barangay.';
    if (!form.complaint_type) errs.complaint_type = 'Please choose a complaint type.';
    if (form.description.trim().length < 10) errs.description = 'Describe the issue (at least 10 characters).';
    if (needsOther && !form.type_other.trim()) {
      errs.type_other = 'Please describe the type of complaint.';
    }
    if (withOtherDetail(form.description.trim(), form.type_other).length > DESCRIPTION_MAX) {
      errs.description = `Description is too long (limit ${DESCRIPTION_MAX} characters).`;
    }
    if (!consent) errs.consent = 'Please acknowledge the privacy notice.';
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
    // complaint_type is a foreign key, so the typed detail rides in the
    // description instead - as its first line. See lib/otherCategory.js.
    fd.append('description', withOtherDetail(form.description.trim(), form.type_other));
    fd.append('consent', 'true');
    if (location.latitude != null) {
      fd.append('latitude', location.latitude);
      fd.append('longitude', location.longitude);
    }
    if (photo) fd.append('photo', photo);

    setSubmitting(true);
    try {
      const res = await complaintApi.createAnonymous(fd);
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
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="container py-10">
        {success ? (
          <SuccessCard trackingId={success} />
        ) : (
          <div className="mx-auto max-w-xl">
            <div className="mb-6">
              <Link to="/" className="text-sm font-medium text-primary hover:underline">← Home</Link>
              <h1 className="mt-2 font-display text-3xl">Report Anonymously</h1>
              <p className="mt-1 text-muted-foreground">
                For whistleblowers. No account is needed and your identity is never recorded.
              </p>
            </div>

            <Card className="p-6">
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                {error && <Alert>{error}</Alert>}

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                  Because this report is anonymous, CENRO cannot contact you for clarification. Include as much
                  detail as you safely can. Use the reference number you receive to check the status later.
                  <span className="mt-1.5 block text-muted-foreground/80">{COPY_TL.anonymousHint}</span>
                </div>

                <FormField
                  id="complaint_type"
                  label="Complaint type"
                  hint={FORM_TL.complaint_type}
                  error={fieldErrors.complaint_type || categoriesError}
                >
                  <Select id="complaint_type" value={form.complaint_type} onChange={setType}>
                    <option value="">Select a type</option>
                    {complaintTypes.map((t) => (
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
                      placeholder="e.g. Dead fish in the creek"
                      maxLength={OTHER_DETAIL_MAX}
                      value={form.type_other}
                      onChange={set('type_other')}
                    />
                  </FormField>
                )}

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
                    placeholder="What happened? Include details like location, time, smell, or how long it has been going on. Avoid including your own name."
                    value={form.description}
                    onChange={set('description')}
                  />
                </FormField>

                <FormField label="Location" hint="Optional: pin where it happened">
                  <LocationField value={location} onChange={setLocation} />
                </FormField>

                <FormField label="Photo" hint="Optional: adds evidence. Avoid photos that could identify you.">
                  <PhotoField onChange={setPhoto} />
                </FormField>

                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span className={fieldErrors.consent ? 'text-destructive' : 'text-muted-foreground'}>
                    I understand this report is submitted anonymously under CENRO&apos;s whistleblower policy,
                    that my identity is not collected, and that the details I provide may be used to investigate
                    the concern (R.A. 10173 compliant).{' '}
                    <Link to="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                      Read the privacy notice
                    </Link>
                    .
                  </span>
                </label>

                <Button type="submit" className="w-full" loading={submitting}>
                  Submit anonymously
                </Button>
              </form>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
