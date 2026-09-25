import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ClipboardList, CircleCheck } from 'lucide-react';
import { staffApi } from '@/lib/api';
import { useCategories } from '@/lib/useCategories';
import { isOtherCategory, withOtherDetail, OTHER_DETAIL_MAX, DESCRIPTION_MAX } from '@/lib/otherCategory';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { IconChip } from '@/components/ui/icon-chip';
import { FormField } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import BarangaySelect from '@/components/resident/BarangaySelect';
import PhotoField from '@/components/resident/PhotoField';
import LocationField from '@/components/resident/LocationField';

// Intake channels — mirror ComplaintReceivedVia in schema.prisma.
const RECEIVED_VIA = [
  { value: 'Walk_In', label: 'Walk-in' },
  { value: 'Phone_Call', label: 'Phone call' },
  { value: 'Email', label: 'Email' },
  { value: 'Facebook_Messenger', label: 'Facebook Messenger' },
  { value: 'Logbook_Record', label: 'Logbook record' },
];

// Local YYYY-MM-DD (en-CA renders ISO date), used as today's default + max.
const todayStr = () => new Date().toLocaleDateString('en-CA');

function SuccessCard({ trackingId }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Card className="space-y-4 p-8 text-center">
        <div className="flex justify-center">
          <IconChip icon={CircleCheck} tone="forest" size="lg" />
        </div>
        <h2 className="font-display text-2xl">Walk-in complaint logged</h2>
        <p className="text-muted-foreground">Reference number</p>
        <div className="text-2xl font-bold tracking-wide text-primary">{trackingId}</div>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link to={`/staff/complaints/${trackingId}`}>
            <Button>Open complaint</Button>
          </Link>
          <Link to="/staff/complaints">
            <Button variant="outline">Back to queue</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default function LogWalkInPage() {
  // Categories come from the API, not a compiled-in array, so an Admin can
  // add or retire one without a redeploy. categoriesError is surfaced next to
  // the field below: an empty dropdown with no explanation would look like the
  // form is broken rather than like the list failed to load.
  const { complaintTypes, error: categoriesError } = useCategories();

  const [form, setForm] = useState({
    complaint_type: '',
    barangay_id: '',
    description: '',
    received_via: 'Walk_In',
    reporter_name: '',
    reporter_contact: '',
    observed_at: todayStr(),
  });
  const [anonymous, setAnonymous] = useState(false);
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const [photo, setPhoto] = useState(null);
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
    if (!form.complaint_type) errs.complaint_type = 'Please choose a complaint type.';
    if (!form.barangay_id) errs.barangay_id = 'Please select a barangay.';
    if (form.description.trim().length < 10) errs.description = 'Describe the concern (at least 10 characters).';
    if (needsOther && !form.type_other.trim()) {
      errs.type_other = 'Please describe the type of complaint.';
    }
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
    fd.append('complaint_type', form.complaint_type);
    fd.append('barangay_id', form.barangay_id);
    // complaint_type is a foreign key, so the typed detail rides in the
    // description instead - as its first line. See lib/otherCategory.js.
    fd.append('description', withOtherDetail(form.description.trim(), form.type_other));
    fd.append('received_via', form.received_via);
    fd.append('is_anonymous', String(anonymous));
    if (!anonymous) {
      if (form.reporter_name.trim()) fd.append('reporter_name', form.reporter_name.trim());
      if (form.reporter_contact.trim()) fd.append('reporter_contact', form.reporter_contact.trim());
    }
    if (form.observed_at) fd.append('observed_at', form.observed_at);
    if (location.latitude != null) {
      fd.append('latitude', location.latitude);
      fd.append('longitude', location.longitude);
    }
    if (photo) fd.append('photo', photo);

    setSubmitting(true);
    try {
      const res = await staffApi.complaints.createWalkIn(fd);
      setSuccess(res.data.complaint.tracking_id);
    } catch (err) {
      if (Array.isArray(err.errors)) {
        const m = {};
        for (const { field, message } of err.errors) m[field] = message;
        setFieldErrors((p) => ({ ...p, ...m }));
      }
      setError(err.message || 'Could not log the complaint.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) return <SuccessCard trackingId={success} />;

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/staff/complaints" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Complaints
      </Link>

      <Card className="mt-4 overflow-hidden border-t-2 border-t-brand-accent">
        <div className="flex items-center gap-4 border-b bg-eco-band p-6">
          <IconChip icon={ClipboardList} tone="amber" size="lg" />
          <div>
            <h1 className="font-display text-2xl">Log a Walk-in Report</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Record a complaint a resident filed in person at the CENRO office.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-6" noValidate>
          {error && <Alert>{error}</Alert>}

          <FormField id="complaint_type" label="Complaint type" error={fieldErrors.complaint_type || categoriesError}>
            <Select id="complaint_type" value={form.complaint_type} onChange={setType}>
              <option value="">Select a type</option>
              {complaintTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </FormField>

          {needsOther && (
            <FormField id="type_other" label="Please specify" error={fieldErrors.type_other}>
              <Input
                id="type_other"
                placeholder="e.g. Dead fish in the creek"
                maxLength={OTHER_DETAIL_MAX}
                value={form.type_other}
                onChange={set('type_other')}
              />
            </FormField>
          )}

          <FormField id="barangay_id" label="Barangay" error={fieldErrors.barangay_id}>
            <BarangaySelect value={form.barangay_id} onChange={set('barangay_id')} />
          </FormField>

          <FormField id="description" label="Description" error={fieldErrors.description}>
            <Textarea
              id="description"
              rows={4}
              placeholder="What did the resident report? Include time, location, smell, or how long it has been going on."
              value={form.description}
              onChange={set('description')}
            />
          </FormField>

          <FormField id="received_via" label="Received via" hint="How the report reached the office.">
            <Select id="received_via" value={form.received_via} onChange={set('received_via')}>
              {RECEIVED_VIA.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </FormField>

          {/* Walk-in reporter identity */}
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            Reporter wishes to stay anonymous (don&apos;t record their name)
          </label>

          {!anonymous && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="reporter_name" label="Reporter name" hint="Optional">
                <Input
                  id="reporter_name"
                  placeholder="e.g. Maria Santos"
                  value={form.reporter_name}
                  onChange={set('reporter_name')}
                />
              </FormField>
              <FormField id="reporter_contact" label="Reporter contact" hint="Optional: phone or email">
                <Input
                  id="reporter_contact"
                  placeholder="e.g. 0917 000 0000"
                  value={form.reporter_contact}
                  onChange={set('reporter_contact')}
                />
              </FormField>
            </div>
          )}

          <FormField id="observed_at" label="Date issue was observed" hint="When the resident saw the problem. Defaults to today.">
            <Input
              id="observed_at"
              type="date"
              max={todayStr()}
              value={form.observed_at}
              onChange={set('observed_at')}
            />
          </FormField>

          <FormField label="Location" hint="Optional: pin where it happened">
            <LocationField value={location} onChange={setLocation} />
          </FormField>

          <FormField label="Photo" hint="Optional: attach evidence if the resident provided one">
            <PhotoField onChange={setPhoto} />
          </FormField>

          <Button type="submit" className="w-full" loading={submitting}>
            Log complaint
          </Button>
        </form>
      </Card>
    </div>
  );
}
