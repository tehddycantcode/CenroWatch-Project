import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/lib/roles';
import PasswordForm from '@/components/PasswordForm';
import { Card } from '@/components/ui/card';

// Account page for CENRO Staff and Admins, mounted at BOTH /staff/account and
// /admin/account (see App.jsx). One page at two paths rather than two pages:
// the chrome should match the console the person is already in, and an Admin
// satisfies both route groups, so an Admin who clicks their name in the staff
// header correctly gets the staff-layout version of this page.
//
// Read-only identity plus the password form, deliberately. PATCH /auth/me is
// role-agnostic and would work, but the fields it edits are resident-shaped -
// a barangay and a contact number mean nothing for a staff account - so
// half-wiring a profile editor here would raise more questions than it answers.
export default function AccountPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">My Account</h1>
        <p className="mt-1 text-muted-foreground">Your details and password</p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Details</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">Name</dt>
            <dd className="text-sm font-medium">{user?.first_name} {user?.last_name}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Role</dt>
            <dd className="text-sm font-medium">{ROLE_LABELS[user?.role] || user?.role}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm text-muted-foreground">Email</dt>
            <dd className="text-sm font-medium">{user?.email}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          An Administrator maintains these details. Ask one to change your name, email or role.
        </p>
      </Card>

      <PasswordForm />
    </div>
  );
}
