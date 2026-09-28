import { useState } from 'react';
import { authApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { FormField } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';

// Self-service password change, for ANY signed-in role. Lifted out of the
// resident ProfilePage so the staff/admin Account page renders the same form
// rather than a second copy of it: POST /auth/change-password has never been
// role-gated (it sits behind `authenticate` alone), so there was never a reason
// for two implementations - only the resident page happened to have the UI.
export default function PasswordForm() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setMsg('');
    setError('');
    if (form.new_password.length < 8 || !/[A-Za-z]/.test(form.new_password) || !/[0-9]/.test(form.new_password)) {
      setError('New password must be at least 8 characters and include a letter and a number.');
      return;
    }
    if (form.new_password !== form.confirm) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      // No token handling here, unlike mobile: the server refreshes the HttpOnly
      // session cookie on this response, so this tab stays signed in by itself.
      // Every OTHER session, phone included, is signed out by the change.
      await authApi.changePassword({ current_password: form.current_password, new_password: form.new_password });
      setForm({ current_password: '', new_password: '', confirm: '' });
      setMsg('Password changed. Your other devices have been signed out.');
    } catch (err) {
      setError(err.message || 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Change password</h2>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
        <FormField id="current_password" label="Current password">
          <PasswordInput id="current_password" autoComplete="current-password" value={form.current_password} onChange={set('current_password')} required />
        </FormField>
        <div className="hidden sm:block" />
        <FormField id="new_password" label="New password" hint="≥ 8 chars, a letter and a number">
          <PasswordInput id="new_password" autoComplete="new-password" value={form.new_password} onChange={set('new_password')} required />
        </FormField>
        <FormField id="confirm" label="Confirm new password">
          <PasswordInput id="confirm" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
        </FormField>
        <div className="sm:col-span-2 flex items-center gap-3">
          <Button type="submit" loading={saving}>Update password</Button>
          {/* role="status" announces this to a screen reader politely, waiting
              for a pause. Errors use role="alert" (see components/ui/alert),
              which interrupts - right for a failure, wrong for a confirmation. */}
          {msg && <span role="status" className="text-sm text-primary">{msg}</span>}
        </div>
      </form>
    </Card>
  );
}
