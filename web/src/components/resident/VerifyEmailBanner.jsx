import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/lib/api';
import { COPY_TL } from '@/lib/tagalog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const COOLDOWN_SECONDS = 60;

// Shown until the resident confirms their address. Deliberately a banner and
// not a gate: the account works either way, so nobody is stopped from filing a
// report by a slow mailbox.
export default function VerifyEmailBanner() {
  const { user, updateUser } = useAuth();
  const [code, setCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [showChange, setShowChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!user || user.email_verified_at) return null;

  async function onVerify(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await authApi.verifyEmail(code.trim());
      updateUser(res.data.user);
    } catch (err) {
      setError(err.errors?.[0]?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await authApi.resendVerification();
      setNotice('A new code is on its way.');
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(err.errors?.[0]?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onChangeEmail(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await authApi.changeEmail(newEmail.trim());
      updateUser(res.data.user);
      setShowChange(false);
      setNewEmail('');
      setCode('');
      setNotice('Address updated. Check it for a new code.');
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(err.errors?.[0]?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Confirm your email address</p>
      <p className="text-sm text-amber-900/80">{COPY_TL.confirmEmail}</p>
      <p className="mt-1 text-sm text-amber-900/80">
        We sent a 6-digit code to <strong>{user.email}</strong>. CENRO sends your report
        updates there, so confirming it is what lets us reach you.
      </p>
      <p className="text-sm text-amber-900/70">{COPY_TL.confirmEmailWhy}</p>

      <form onSubmit={onVerify} className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          aria-label="Confirmation code"
          className="h-9 w-32 tracking-[0.3em]"
        />
        <Button type="submit" size="sm" loading={busy} disabled={busy || code.trim().length !== 6}>
          Confirm
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={busy}
          onClick={onResend}
          disabled={busy || cooldown > 0}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>
        <button
          type="button"
          onClick={() => setShowChange((s) => !s)}
          aria-expanded={showChange}
          className="text-sm font-medium text-amber-900 underline"
        >
          {COPY_TL.wrongAddress}
        </button>
      </form>

      {showChange && (
        <form
          id="verify-email-change-form"
          onSubmit={onChangeEmail}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="your.correct@email.com"
            aria-label="Correct email address"
            className="h-9 w-64"
          />
          <Button type="submit" size="sm" loading={busy} disabled={busy || !newEmail.trim()}>
            Send new code
          </Button>
        </form>
      )}

      {error ? <p className="mt-2 text-sm font-medium text-destructive">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm text-amber-900">{notice}</p> : null}
    </div>
  );
}
