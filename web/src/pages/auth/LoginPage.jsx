import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { roleHome } from '@/lib/roles';
import AuthShell from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { FormField } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';

export default function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Unchecked by default, and that default is the whole feature. Defaulting it
  // on would mean almost nobody ever unticks it, and a resident signing in at a
  // barangay hall or an internet cafe would leave a week-long session behind on
  // a machine they do not own.
  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Set when AuthContext signed us out because the JWT expired (see
  // SESSION_EXPIRED_EVENT). ProtectedRoute deep links share the same state.from.
  const expired = Boolean(location.state?.expired);

  // Already signed in — go straight to the role home.
  if (isAuthenticated) return <Navigate to={roleHome(user.role)} replace />;

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const u = await login(form);
      const from = location.state?.from;
      // Return to the exact page (including query string, e.g. queue filters).
      // ProtectedRoute still role-guards it, so a different account bounces
      // safely to its own home.
      const dest = from ? `${from.pathname}${from.search || ''}` : roleHome(u.role);
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue"
      footer={
        <>
          New to CENROWATCH?{' '}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? (
          <Alert>{error}</Alert>
        ) : expired ? (
          <Alert variant="info">Your session has expired. Please sign in again.</Alert>
        ) : null}

        <FormField id="email" label="Email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={update('email')}
            required
          />
        </FormField>

        <FormField id="password" label="Password">
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={form.password}
            onChange={update('password')}
            required
          />
        </FormField>

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="remember" className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <input
              id="remember"
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
              checked={form.remember}
              onChange={(e) => setForm((f) => ({ ...f, remember: e.target.checked }))}
            />
            Keep me signed in
          </label>
          <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </Button>
      </form>
    </AuthShell>
  );
}
