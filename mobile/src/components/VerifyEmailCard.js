import { useEffect, useReducer, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { COPY_TL } from '../lib/tagalog';
import { colors, radius } from '../theme';
import TextField from './TextField';
import Button from './Button';

const COOLDOWN_SECONDS = 60;

// The outcome of the last request, as ONE value rather than three.
//
// busy/error/notice always changed together and always in the same shape: clear
// both messages and go busy, then land on exactly one of them. Spread across
// three useState calls that shape was a convention three separate handlers each
// had to remember, and nothing stopped a future edit from leaving an error and a
// success message on screen at the same time, or from leaving the buttons
// disabled after a failure. As a reducer the transitions are the only way to
// move, so those states cannot be reached at all.
//
// code / newEmail / showChange stay as useState on purpose: they are what the
// resident is typing and whether a panel is open, which have nothing to do with
// a request being in flight. The rule fires on a COUNT of useState calls, so
// sweeping them in too would have silenced it without making anything clearer.
const IDLE = { busy: false, error: '', notice: '' };

// Turns a thrown API error into the message shown on the card. Module scope:
// it depends on nothing in the component, so rebuilding it every render is
// wasted work.
const messageFor = (e) => e.errors?.[0]?.message || e.message;

function statusReducer(state, action) {
  switch (action.type) {
    case 'start':
      return { busy: true, error: '', notice: '' };
    case 'succeeded':
      return { busy: false, error: '', notice: action.notice || '' };
    case 'failed':
      return { busy: false, error: action.error, notice: '' };
    default:
      return state;
  }
}

// Shown until the resident confirms their address. A card, not a gate - the
// account works either way, so a slow mailbox never blocks a report.
export default function VerifyEmailCard() {
  const { user, token, updateUser } = useAuth();
  const [code, setCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [showChange, setShowChange] = useState(false);
  // Kept out of the reducer: it keeps ticking for a minute after the request
  // that started it has already finished, so it is not part of request status.
  const [cooldown, setCooldown] = useState(0);
  const [{ busy, error, notice }, dispatch] = useReducer(statusReducer, IDLE);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!user || user.email_verified_at) return null;

  async function onVerify() {
    dispatch({ type: 'start' });
    try {
      const res = await api.verifyEmail(code.trim(), token);
      updateUser(res.data.user);
      dispatch({ type: 'succeeded' });
    } catch (e) {
      dispatch({ type: 'failed', error: messageFor(e) });
    }
  }

  async function onResend() {
    dispatch({ type: 'start' });
    try {
      await api.resendVerification(token);
      dispatch({ type: 'succeeded', notice: 'A new code is on its way.' });
      setCooldown(COOLDOWN_SECONDS);
    } catch (e) {
      dispatch({ type: 'failed', error: messageFor(e) });
    }
  }

  async function onChangeEmail() {
    dispatch({ type: 'start' });
    try {
      const res = await api.changeEmail(newEmail.trim(), token);
      updateUser(res.data.user);
      setShowChange(false);
      setNewEmail('');
      setCode('');
      dispatch({ type: 'succeeded', notice: 'Address updated. Check it for a new code.' });
      setCooldown(COOLDOWN_SECONDS);
    } catch (e) {
      dispatch({ type: 'failed', error: messageFor(e) });
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
