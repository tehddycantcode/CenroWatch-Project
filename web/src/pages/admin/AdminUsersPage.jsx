import { useEffect, useState, useCallback } from 'react';
import { adminApi, barangayApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/lib/roles';
import { Card } from '@/components/ui/card';
import { TableHead } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';

// Administrator accounts are not created or granted from this screen (only the
// bootstrap admin holds that role), so it is not offered when creating or
// editing a user. The filter still lists it so existing admins stay findable.
const ASSIGNABLE_ROLES = ['Resident', 'CENRO_Staff'];
const FILTER_ROLES = ['Resident', 'CENRO_Staff', 'Admin'];
const EMPTY = { first_name: '', last_name: '', email: '', password: '', role: 'CENRO_Staff', contact_number: '', barangay_id: '' };

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [barangays, setBarangays] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({ role: '', search: '' });
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  // Confirming an address on someone's behalf is an assertion that CENRO
  // established ownership off-system, so it takes two clicks. The row holding
  // this id is showing "is this really theirs?" rather than the plain button.
  const [confirmId, setConfirmId] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    adminApi.users
      .list({ role: applied.role, search: applied.search, limit: 100 })
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message));
  }, [applied]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { barangayApi.list().then((r) => setBarangays(r.data.barangays)).catch(() => {}); }, []);

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function createUser(e) {
    e.preventDefault();
    setFormErr('');
    setSaving(true);
    try {
      const body = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        contact_number: form.contact_number.trim() || undefined,
        barangay_id: form.barangay_id ? Number(form.barangay_id) : undefined,
      };
      await adminApi.users.create(body);
      setForm(EMPTY);
      setShowCreate(false);
      load();
    } catch (err) {
      setFormErr(err.message || 'Could not create the user.');
    } finally {
      setSaving(false);
    }
  }

  async function patch(id, body) {
    try {
      await adminApi.users.update(id, body);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmEmail(id) {
    setConfirming(true);
    setError('');
    try {
      await adminApi.users.verifyEmail(id);
      setConfirmId(null);
      load();
    } catch (err) {
      setError(err.message || 'Could not confirm that address.');
    } finally {
      setConfirming(false);
    }
  }

  if (error && !data) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl">User Accounts</h1>
        <div className="flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => { e.preventDefault(); setApplied({ role: roleFilter, search: search.trim() }); }}
            className="flex items-center gap-2"
          >
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-9 w-40">
              <option value="">All roles</option>
              {FILTER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email…" className="h-9 w-52" />
            <Button type="submit" size="sm" variant="outline">Filter</Button>
          </form>
          <Button size="sm" onClick={() => setShowCreate((s) => !s)}>{showCreate ? 'Close' : '+ Add user'}</Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showCreate && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Create account</h2>
          <form onSubmit={createUser} className="grid gap-4 sm:grid-cols-2">
            <FormField id="first_name" label="First name"><Input id="first_name" value={form.first_name} onChange={setF('first_name')} required /></FormField>
            <FormField id="last_name" label="Last name"><Input id="last_name" value={form.last_name} onChange={setF('last_name')} required /></FormField>
            <FormField id="email" label="Email"><Input id="email" type="email" value={form.email} onChange={setF('email')} required /></FormField>
            <FormField id="password" label="Temp password" hint="≥ 8 chars, a letter and a number"><Input id="password" value={form.password} onChange={setF('password')} required /></FormField>
            <FormField id="role" label="Role">
              <Select id="role" value={form.role} onChange={setF('role')}>
                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
            </FormField>
            <FormField id="barangay_id" label="Barangay" hint="Optional">
              <Select id="barangay_id" value={form.barangay_id} onChange={setF('barangay_id')}>
                <option value="">—</option>
                {barangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.name}</option>)}
              </Select>
            </FormField>
            <div className="sm:col-span-2 flex items-center gap-3">
              <Button type="submit" loading={saving}>Create user</Button>
              {formErr && <span className="text-sm text-destructive">{formErr}</span>}
            </div>
          </form>
        </Card>
      )}

      {/* An unverified resident who has also forgotten their password cannot
          reach any self-service route: confirming needs a sign-in, signing in
          needs the password, and a reset is refused to an unconfirmed address.
          The reset email tells them to contact CENRO -- this is where that call
          gets answered, so the instruction has to be visible to whoever is on
          the phone, not buried in a manual. */}
      <p className="text-sm text-muted-foreground">
        A resident who never opened their confirmation email cannot reset a forgotten password.
        Once you have checked who they are, use <span className="font-medium text-foreground">Mark confirmed</span> on
        their row to unlock it. Confirming is recorded against your account in the audit log.
      </p>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <TableHead columns={['Name', 'Email', 'Role', 'Status', '']} />
          <tbody className="divide-y">
            {data.items.map((u) => {
              const isMe = u.user_id === me?.user_id;
              return (
                <tr key={u.user_id} className="hover:bg-accent/20">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {u.first_name} {u.last_name}{isMe && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{u.email}</span>
                      {/* Only ever flagged when unverified. A "Confirmed" pill on
                          every other row would be noise on a screen whose normal
                          state is that everyone is confirmed. */}
                      {!u.email_verified_at && <Badge tone="amber">Unverified</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'Admin' ? (
                      // No dropdown for administrators: their role is not one of
                      // the assignable options, so a select would render the
                      // wrong value and one stray click would demote them.
                      <Badge tone="purple">{ROLE_LABELS.Admin}</Badge>
                    ) : (
                      <Select
                        value={u.role}
                        disabled={isMe}
                        onChange={(e) => patch(u.user_id, { role: e.target.value })}
                        className="h-8 w-36"
                      >
                        {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {!u.email_verified_at && (confirmId === u.user_id ? (
                        <>
                          <span className="text-xs text-muted-foreground">
                            Confirmed this address is theirs?
                          </span>
                          <Button size="sm" loading={confirming} onClick={() => confirmEmail(u.user_id)}>
                            Yes, confirm
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setConfirmId(u.user_id)}>
                          Mark confirmed
                        </Button>
                      ))}
                      {!isMe && (
                        <Button
                          size="sm"
                          variant={u.is_active ? 'outline' : 'default'}
                          onClick={() => patch(u.user_id, { is_active: !u.is_active })}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
