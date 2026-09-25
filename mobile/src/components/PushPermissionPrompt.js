import { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, radius } from '../theme';
import { DECISION, ALLOW_ACTION, shouldPrompt, allowAction } from '../lib/pushDecision';
import { getDecision, setDecision } from '../lib/pushPreference';
import { getStatus, requestPermission, registerDevice, isAvailable } from '../lib/push';

// Asks for notification permission, and keeps asking on every launch until the
// resident actually chooses.
//
// IT IS NOT DISMISSABLE BY TAPPING OUTSIDE, AND THAT IS THE POINT. The OS
// permission dialog cannot be made to repeat - Android allows roughly two,
// iOS exactly one - so "keep asking until they decide" is only possible in a
// modal we own. Dismissing without choosing would let someone bounce off it
// forever while still never hearing about their report.
//
// Tapping Allow spends the OS prompt. Tapping "Don't allow" does NOT: it
// records the choice locally and leaves the system prompt unspent, so the
// Profile toggle can still offer it later. That is why declining is recoverable
// and why this modal never comes back on its own afterwards.
export default function PushPermissionPrompt() {
  const { user, token } = useAuth();
  const [visible, setVisible] = useState(false);
  const [canAsk, setCanAsk] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      // No user means no one to register a token against - PushToken rows carry
      // a user_id - so there is nothing to ask for yet.
      if (!user?.user_id || !token || !isAvailable()) return;
      const [{ status, canAskAgain }, decision] = await Promise.all([
        getStatus(),
        getDecision(user.user_id),
      ]);
      if (!active) return;
      setCanAsk(canAskAgain);
      setVisible(shouldPrompt({ osStatus: status, decision }));
    })();
    return () => {
      active = false;
    };
  }, [user?.user_id, token]);

  const onAllow = useCallback(async () => {
    setBusy(true);
    try {
      if (allowAction({ canAskAgain: canAsk }) === ALLOW_ACTION.OPEN_SETTINGS) {
        // The OS dialog is spent; the settings screen is the only route left.
        await Linking.openSettings();
      } else {
        const res = await requestPermission();
        if (res.status === 'granted') await registerDevice(token);
      }
      // Recorded either way. Tapping Allow is the decision, even if the person
      // then refused the system dialog - see pushDecision.js.
      await setDecision(user.user_id, DECISION.ALLOWED);
    } finally {
      setBusy(false);
      setVisible(false);
    }
  }, [canAsk, token, user?.user_id]);

  const onDecline = useCallback(async () => {
    await setDecision(user.user_id, DECISION.DECLINED);
    setVisible(false);
  }, [user?.user_id]);

  if (!visible) return null;

  const openSettings = allowAction({ canAskAgain: canAsk }) === ALLOW_ACTION.OPEN_SETTINGS;

  return (
    // onRequestClose is required on Android (it fires on the hardware back
    // button). Deliberately a no-op: back is a dismissal, not a decision.
    <Modal transparent animationType="fade" visible onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Get updates on your reports</Text>
          <Text style={styles.body}>
            CENRO will notify you when your report is reviewed, scheduled or resolved, so you do
            not have to keep checking the app.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.primary, (busy || pressed) && styles.pressed]}
            onPress={onAllow}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{openSettings ? 'Open settings' : 'Allow'}</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={onDecline}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Don&apos;t allow</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 18 },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  primaryText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  secondary: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  secondaryText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
});
