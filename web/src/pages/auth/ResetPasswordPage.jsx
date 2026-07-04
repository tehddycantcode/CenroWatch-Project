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
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setError('Password must be at least 8 characters and include a letter and a number.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, form.password);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not reset your password.');
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
          <FormField id="password" label="New password" hint="≥ 8 chars, a letter and a number">
            <PasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.password}
              onChange={update('password')}
              required
            />
          </FormField>
          <FormField id="confirm" label="Confirm new password">
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
