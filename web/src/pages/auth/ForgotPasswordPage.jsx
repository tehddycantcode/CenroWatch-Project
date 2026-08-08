import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '@/lib/api';
import AuthShell from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    // The form is noValidate, so without this a malformed address would spend
    // one of the few attempts the /auth rate limiter allows per window.
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setFieldErrors({ email: 'Enter a valid email.' });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      // The server responds the same way whether or not the email exists.
      setSent(true);
    } catch (err) {
      // Show the server's per-field message ("A valid email is required.")
      // instead of the bare "Validation failed." envelope wrapped around it.
      const mapped = {};
      if (Array.isArray(err.errors)) {
        for (const { field, message } of err.errors) mapped[field] = message;
      }
      setFieldErrors(mapped);
      setError(
        Object.keys(mapped).length ? '' : err.message || 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="We'll email you a link to reset it"
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
          We&apos;ve sent an email to <strong>{email.trim()}</strong>. If an account uses this
          address, the email has a reset link that expires in 1 hour. If no account uses it, the
          email will say so. Please check your inbox and your spam folder.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          <FormField id="email" label="Email" error={fieldErrors.email}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </FormField>
          <Button type="submit" className="w-full" loading={submitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
