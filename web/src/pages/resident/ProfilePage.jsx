import { useState } from 'react';
import { authApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import BarangaySelect from '@/components/resident/BarangaySelect';
import PasswordForm from '@/components/PasswordForm';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';

function ProfileForm() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    contact_number: user?.contact_number || '',
    barangay_id: user?.barangay_id ? String(user.barangay_id) : '',
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setMsg('');
    setError('');
    setSaving(true);
    try {
      const res = await authApi.updateProfile({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        contact_number: form.contact_number.trim(),
        barangay_id: form.barangay_id === '' ? '' : Number(form.barangay_id),
      });
      updateUser(res.data.user);
      setMsg('Profile updated.');
    } catch (err) {
      setError(err.message || 'Could not update your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Profile</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">Your email ({user?.email}) is used to sign in and can&apos;t be changed here.</p>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
        <FormField id="first_name" label="First name">
          <Input id="first_name" value={form.first_name} onChange={set('first_name')} required />
        </FormField>
        <FormField id="last_name" label="Last name">
          <Input id="last_name" value={form.last_name} onChange={set('last_name')} required />
        </FormField>
        <FormField id="contact_number" label="Contact number" hint="Optional">
          <Input id="contact_number" value={form.contact_number} onChange={set('contact_number')} />
        </FormField>
        <FormField id="barangay_id" label="Barangay" hint="Optional">
          <BarangaySelect value={form.barangay_id} onChange={set('barangay_id')} />
        </FormField>
        <div className="sm:col-span-2 flex items-center gap-3">
          <Button type="submit" loading={saving}>Save changes</Button>
          {/* role="status" announces this to a screen reader politely, waiting
              for a pause. Errors use role="alert" (see components/ui/alert),
              which interrupts - right for a failure, wrong for a confirmation. */}
          {msg && <span role="status" className="text-sm text-primary">{msg}</span>}
        </div>
      </form>
    </Card>
  );
}

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">My Account</h1>
        <p className="mt-1 text-muted-foreground">Update your details or change your password</p>
      </div>
      <ProfileForm />
      <PasswordForm />
    </div>
  );
}
