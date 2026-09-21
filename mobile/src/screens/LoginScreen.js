import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { LogoMark } from '../components/Brand';
import TextField from '../components/TextField';
import Button from '../components/Button';
import ErrorBanner from '../components/ErrorBanner';

export default function LoginScreen({ onNavigate }) {
  const { login, sessionNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Off by default, matching the web form. Left on, almost nobody would ever
  // turn it off, and a phone handed round or lent out would keep a week-long
  // session in the keychain.
  const [remember, setRemember] = useState(false);

  async function onSubmit() {
    setError('');
    setSubmitting(true);
    try {
      await login({ email: email.trim(), password, remember });
      // On success, RootNavigator swaps to the authenticated stack automatically.
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* `padding` on both platforms: under Expo's default edge-to-edge the
          Android window does not reliably resize for the keyboard. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          {/* Hero */}
          <View style={styles.hero}>
            <LogoMark size={60} onDark />
            <Text style={styles.brand}>CENROWATCH</Text>
            <Text style={styles.brandSub}>Environmental Monitoring · Cabuyao</Text>
          </View>

          {/* Form */}
          <View style={styles.body}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>

            <View style={{ gap: 16, marginTop: 20 }}>
              <ErrorBanner message={error} />

              {sessionNotice && !error ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>{sessionNotice}</Text>
                </View>
              ) : null}

              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
              />

              {/* A Pressable row rather than a bare Switch: the whole row is the
                  target, which is a far easier tap than a 20px box, and the
                  label reads as part of the control instead of beside it. */}
              <Pressable
                onPress={() => setRemember((v) => !v)}
                hitSlop={6}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: remember }}
                accessibilityLabel="Keep me signed in"
                style={styles.rememberRow}
              >
                <View style={[styles.checkbox, remember && styles.checkboxOn]}>
                  {remember ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </View>
                <Text style={styles.rememberText}>Keep me signed in</Text>
              </Pressable>

              <Button title="Sign In" onPress={onSubmit} loading={submitting} />

              <View style={styles.footer}>
                <Text style={styles.footerText}>New to CENROWATCH? </Text>
                <Pressable onPress={() => onNavigate('register')} hitSlop={6}>
                  <Text style={styles.link}>Create an account</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  scroll: { flexGrow: 1 },
  hero: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 40,
    paddingHorizontal: 28,
    gap: 10,
  },
  brand: { color: colors.white, fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },
  brandSub: { color: colors.heroSubtle, fontSize: 12 },
  body: { paddingHorizontal: 28, paddingTop: 28 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 4 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxTick: { color: colors.white, fontSize: 13, fontWeight: '800', lineHeight: 16 },
  rememberText: { fontSize: 13, color: colors.muted },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 6 },
  footerText: { fontSize: 13, color: colors.muted },
  link: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  notice: {
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  noticeText: { color: colors.text, fontSize: 13, lineHeight: 18 },
});
