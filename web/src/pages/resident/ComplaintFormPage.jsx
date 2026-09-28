import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { complaintApi } from '@/lib/api';
import { useCategories } from '@/lib/useCategories';
import { isOtherCategory, withOtherDetail, OTHER_DETAIL_MAX, DESCRIPTION_MAX } from '@/lib/otherCategory';
import { FORM_TL } from '@/lib/tagalog';
import ReportFormShell from '@/components/resident/ReportFormShell';
import BarangaySelect from '@/components/resident/BarangaySelect';
import PhotoField from '@/components/resident/PhotoField';
import LocationField from '@/components/resident/LocationField';
import { FormField } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Link } from 'react-router-dom';

// Local YYYY-MM-DD (en-CA renders ISO date), used as today's default + max.
const todayStr = () => new Date().toLocaleDateString('en-CA');

export default function ComplaintFormPage() {
  // Categories come from the API, not a compiled-in array, so an Admin can
  // add or retire one without a redeploy. categoriesError is surfaced next to
  // the field below: an empty dropdown with no explanation would look like the
  // form is broken rather than like the list failed to load.
  const { complaintTypes, error: categoriesError } = useCategories();

  const [form, setForm] = useState({ barangay_id: '', complaint_type: '', description: '', type_other: '', observed_at: todayStr() });
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const photoRef = useRef(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  // Not in `form`, because it is not a field about the incident - it changes who
  // the report belongs to. Kept separate so nothing that spreads `form` can
  // carry it somewhere it does not belong.
  const [anonymous, setAnonymous] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const needsOther = isOtherCategory(form.complaint_type);

  // Changing the type clears anything typed under "Other", so switching back to
  // a normal category cannot submit a stale detail line.
  const setType = (e) =>
    setForm((f) => ({ ...f, complaint_type: e.target.value, type_other: '' }));

  function validate() {
    const errs = {};
    if (!form.barangay_id) errs.barangay_id = 'Please select a barangay.';
    if (!form.complaint_type) errs.complaint_type = 'Please choose a complaint type.';
    if (needsOther && !form.type_other.trim()) {
      errs.type_other = 'Please describe the type of complaint.';
    }
    if (form.description.trim().length < 10) errs.description = 'Describe the issue (at least 10 characters).';
    // The detail is prepended to the description, and the server caps that at
    // DESCRIPTION_MAX. Checked here so a long report fails on the field the
    // resident can actually see, rather than as a 422 about something else.
    if (withOtherDetail(form.description.trim(), form.type_other).length > DESCRIPTION_MAX) {
      errs.description = `Description is too long (limit ${DESCRIPTION_MAX} characters).`;
    }
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
    // complaint_type is a foreign key, so the typed detail rides in the
    // description instead - as its first line. See lib/otherCategory.js.
    fd.append('description', withOtherDetail(form.description.trim(), form.type_other));
    if (form.observed_at) fd.append('observed_at', form.observed_at);
    if (location.latitude != null) {
      fd.append('latitude', location.latitude);
      fd.append('longitude', location.longitude);
    }
    fd.append('photo', photoRef.current); // required
    // String(), because multipart carries no booleans - the validator's
    // .toBoolean() turns it back on the server. Sent either way so the value is
    // always explicit rather than inferred from the field being absent.
    fd.append('is_anonymous', String(anonymous));

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
      submitLabel={anonymous ? 'Submit Anonymously' : 'Submit Report'}
      anonymous={anonymous}
    >
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

      {/* EVERY CLAUSE BELOW IS A PROMISE THE CODE KEEPS - check before editing.
          user_id is stored NULL, so: the report cannot appear in My Reports
          (that query filters on user_id), no receipt or status email is sent
          (both are addressed by looking the user up), and no audit row records
          who filed it. "We cannot link it back even if you ask" is literally
          true - there is nothing stored to link. The last paragraph is a
          WARNING about a limitation rather than a promise: photo metadata is
          not stripped anywhere in the pipeline today. */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <label className="flex items-start gap-2.5 text-sm font-medium">
          <Checkbox
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            aria-describedby="anonymous-consequences"
          />
          <span>File this report anonymously</span>
        </label>

        {anonymous && (
          <div id="anonymous-consequences" className="mt-3 space-y-2 border-t pt-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">CENRO will not know who filed this, and that is permanent.</strong>{' '}
              It will not appear in My Reports, you will get no email or app updates about it, and we
              cannot link it back to your account later even if you ask us to.
            </p>
            <p>
              Save the reference number on the next screen. It is the only way to check the status, and
              it shows status only &mdash; not the photo or CENRO&apos;s notes.
            </p>
            <p>
              A photo is still required. Avoid anything that identifies you: your face, your home, your
              vehicle, a plate number. Photo files can also carry the location and the phone they were
              taken with.
            </p>
            <p>
              <Link to="/report-anonymous" className="font-medium text-primary hover:underline">
                Prefer to file with no account at all?
              </Link>
            </p>
          </div>
        )}
      </div>
    </ReportFormShell>
  );
}
