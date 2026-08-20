import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { COPY_TL } from '../lib/tagalog';
import { colors, radius } from '../theme';
import TextField from './TextField';
import Button from './Button';

const COOLDOWN_SECONDS = 60;

// Shown until the resident confirms their address. A card, not a gate - the
// account works either way, so a slow mailbox never blocks a report.
export default function VerifyEmailCard() {
  const { user, token, updateUser } = useAuth();
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

  async function onVerify() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api.verifyEmail(code.trim(), token);
      updateUser(res.data.user);
    } catch (e) {
      setError(e.errors?.[0]?.message || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.resendVerification(token);
      setNotice('A new code is on its way.');
      setCooldown(COOLDOWN_SECONDS);
    } catch (e) {
      setError(e.errors?.[0]?.message || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onChangeEmail() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api.changeEmail(newEmail.trim(), token);
      updateUser(res.data.user);
      setShowChange(false);
      setNewEmail('');
      setCode('');
      setNotice('Address updated. Check it for a new code.');
      setCooldown(COOLDOWN_SECONDS);
    } catch (e) {
      setError(e.errors?.[0]?.message || e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Confirm your email address</Text>
      <Text style={styles.titleTl}>{COPY_TL.confirmEmail}</Text>
      <Text style={styles.body}>
        We sent a 6-digit code to {user.email}. CENRO sends your report updates there.
      </Text>
      <Text style={styles.bodyTl}>{COPY_TL.confirmEmailWhy}</Text>

      <TextField
        label="Code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="123456"
        containerStyle={{ marginTop: 12 }}
      />
      <View style={{ gap: 8, marginTop: 10 }}>
        <Button title="Confirm" onPress={onVerify} loading={busy} disabled={code.trim().length !== 6} />
        <Button
          title={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          variant="outline"
          onPress={onResend}
          loading={busy}
          disabled={busy || cooldown > 0}
        />
        <Button
          title={showChange ? 'Cancel' : COPY_TL.wrongAddress}
          variant="outline"
          onPress={() => setShowChange((s) => !s)}
          disabled={busy}
        />
      </View>

      {showChange && (
        <View style={{ gap: 10, marginTop: 12 }}>
          <TextField
            label="Correct address"
            value={newEmail}
            onChangeText={setNewEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="your.correct@email.com"
          />
          <Button title="Send new code" onPress={onChangeEmail} loading={busy} disabled={!newEmail.trim()} />
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 18,
  },
  title: { fontSize: 15, fontWeight: '800', color: '#78350f' },
  titleTl: { fontSize: 13, fontWeight: '600', color: '#92400e', marginTop: 1 },
  body: { fontSize: 13, color: '#78350f', marginTop: 6, lineHeight: 19 },
  bodyTl: { fontSize: 13, color: '#92400e', opacity: 0.85, marginTop: 2 },
  error: { fontSize: 13, color: colors.danger, marginTop: 10, fontWeight: '500' },
  notice: { fontSize: 13, color: '#78350f', marginTop: 10 },
});
