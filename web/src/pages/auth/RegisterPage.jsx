import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { roleHome } from '@/lib/roles';
import { barangayApi } from '@/lib/api';
import AuthShell from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { PrivacyDisclosure } from '@/components/PrivacyNotice';

const EMPTY = {
  first_name: '',
  last_name: '',
  email: '',
  contact_number: '',
  barangay_id: '',
  password: '',
  confirm_password: '',
  privacy_consent: false,
};

export default function RegisterPage() {
  const { register, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [barangays, setBarangays] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    barangayApi
      .list()
      .then((res) => setBarangays(res.data.barangays))
      .catch(() => setBarangays([])); // dropdown still renders; field is optional
  }, []);

  if (isAuthenticated) return <Navigate to={roleHome(user.role)} replace />;

  const update = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  function validate() {
    const errs = {};
    if (!form.first_name.trim()) errs.first_name = 'First name is required.';
    if (!form.last_name.trim()) errs.last_name = 'Last name is required.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email.';
    if (form.password.length < 8) errs.password = 'At least 8 characters.';
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password))
      errs.password = 'Use both letters and numbers.';
    if (form.confirm_password !== form.password) errs.confirm_password = 'Passwords do not match.';
    if (!form.privacy_consent) errs.privacy_consent = 'Consent is required to register.';
    return errs;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const u = await register({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        contact_number: form.contact_number.trim() || undefined,
        barangay_id: form.barangay_id ? Number(form.barangay_id) : undefined,
        password: form.password,
        privacy_consent: true,
      });
      navigate(roleHome(u.role), { replace: true });
    } catch (err) {
      // Map server-side express-validator errors back onto the fields.
      if (Array.isArray(err.errors)) {
        const mapped = {};
        for (const { field, message } of err.errors) mapped[field] = message;
        setFieldErrors((prev) => ({ ...prev, ...mapped }));
      }
      setError(err.message || 'Unable to create account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Join CENROWATCH to help protect Cabuyao"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <FormField id="first_name" label="First name" error={fieldErrors.first_name}>
            <Input id="first_name" placeholder="Juan" value={form.first_name} onChange={update('first_name')} />
          </FormField>
          <FormField id="last_name" label="Last name" error={fieldErrors.last_name}>
            <Input id="last_name" placeholder="Dela Cruz" value={form.last_name} onChange={update('last_name')} />
          </FormField>
        </div>

        <FormField id="email" label="Email" error={fieldErrors.email}>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com"
            value={form.email} onChange={update('email')} />
        </FormField>

        <FormField id="contact_number" label="Contact number" error={fieldErrors.contact_number} hint="Optional">
          <Input id="contact_number" placeholder="09xx xxx xxxx" value={form.contact_number}
            onChange={update('contact_number')} />
        </FormField>

        <FormField id="barangay_id" label="Barangay" error={fieldErrors.barangay_id}>
          <Select id="barangay_id" value={form.barangay_id} onChange={update('barangay_id')}>
            <option value="">Select your barangay</option>
            {barangays.map((b) => (
              <option key={b.barangay_id} value={b.barangay_id}>
                {b.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField id="password" label="Password" error={fieldErrors.password} hint="At least 8 characters, with a letter and a number">
          <PasswordInput id="password" autoComplete="new-password" placeholder="••••••••"
            value={form.password} onChange={update('password')} />
        </FormField>

        <FormField id="confirm_password" label="Confirm password" error={fieldErrors.confirm_password}>
          <PasswordInput id="confirm_password" autoComplete="new-password" placeholder="Re-enter password"
            value={form.confirm_password} onChange={update('confirm_password')} />
        </FormField>

        <div className="space-y-2.5">
          <PrivacyDisclosure />
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
            <Checkbox checked={form.privacy_consent} onChange={update('privacy_consent')} />
            <span>
              I have read the privacy notice and consent to the processing of my personal data in
              accordance with R.A. 10173 (Data Privacy Act of 2012).
            </span>
          </label>
          {fieldErrors.privacy_consent && (
            <p className="text-xs font-medium text-destructive">{fieldErrors.privacy_consent}</p>
          )}
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? 'Creating account…' : 'Create Account'}
        </Button>
      </form>
    </AuthShell>
  );
}
