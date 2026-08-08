import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '@/lib/api';
import AuthShell from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { FormField } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const errs = {};
    if (form.password.length < 8) errs.password = 'At least 8 characters.';
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password))
      errs.password = 'Use both letters and numbers.';
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match.';
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
      await authApi.resetPassword(token, form.password);
      setDone(true);
    } catch (err) {
      // Put express-validator's per-field messages on the inputs. Anything
      // with no field on this form (an invalid or expired token) stays in the
      // banner, as does a plain error like the 400 for a spent link.
      const mapped = {};
      let banner = '';
      if (Array.isArray(err.errors)) {
        for (const { field, message } of err.errors) {
          if (field === 'password') mapped.password = message;
          else banner = message;
        }
      }
      setFieldErrors(mapped);
      setError(
        banner ||
          (Object.keys(mapped).length ? '' : err.message || 'Could not reset your password.'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Reset password"
      subtitle="Choose a new password for your account"
      footer={
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {!token ? (
        <Alert>This reset link is missing its token. Please use the link from your email, or request a new one.</Alert>
      ) : done ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
          Your password has been reset.{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link> with your new password.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          <FormField id="password" label="New password" error={fieldErrors.password}
            hint="At least 8 characters, with a letter and a number">
            <PasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.password}
              onChange={update('password')}
              required
            />
          </FormField>
          <FormField id="confirm" label="Confirm new password" error={fieldErrors.confirm}>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.confirm}
              onChange={update('confirm')}
              required
            />
          </FormField>
          <Button type="submit" className="w-full" loading={submitting}>
            Reset password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
