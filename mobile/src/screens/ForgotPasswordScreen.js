import { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { colors } from '../theme';
import { COPY_TL } from '../lib/tagalog';
import { LogoMark } from '../components/Brand';
import TextField from '../components/TextField';
import Button from '../components/Button';
import ErrorBanner from '../components/ErrorBanner';

// Requests a password-reset link. It does NOT reset the password.
//
// The server emails CLIENT_URL/reset-password?token=..., a WEB link, and the
// person finishes in their browser. That is deliberate: the alternative is
// either a cenrowatch:// deep link in the email - which the web app shares, so
// it would break there - or a screen asking someone to type a 64-character hex
// token. Requesting is the only half that belongs in the app.
export default function ForgotPasswordScreen({ onNavigate }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError('');
    setSubmitting(true);
    try {
      await api.forgotPassword({ email: email.trim() });
      setSent(true);
    } catch (err) {
      // resetLimiter counts EVERY request here, not just failed ones the way
      // login does - 10 per 15 minutes per IP. Tapping the button repeatedly
      // when nothing seems to arrive is exactly what a person does, so say what
      // happened instead of showing a bare error.
      const message = /429|too many/i.test(err.message || '')
        ? 'Too many attempts. Wait a few minutes and try again.'
        : err.message || 'Could not send the reset link.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={styles.hero}>
            <LogoMark />
            <Text style={styles.brand}>CENROWATCH</Text>
            <Text style={styles.tagline}>Environmental Monitoring · Cabuyao</Text>
          </View>

          <View style={styles.body}>
            <Text style={styles.title}>Forgot password</Text>
            <Text style={styles.subtitle}>
              Enter your email and we will send you a link to set a new password.
            </Text>
            <Text style={styles.subtitleTl}>{COPY_TL.forgotPasswordWhy}</Text>

            {sent ? (
              <View style={{ gap: 16, marginTop: 20 }}>
                {/* Says "If an account exists", never "Sent!". The endpoint
                    answers identically for a registered and an unregistered
                    address on purpose - it is what stops anyone using this form
                    to discover which people have CENROWATCH accounts. A
                    confirmation that only appeared for real accounts would leak
                    exactly what the server refuses to. */}
                <View style={styles.sentBox}>
                  <Text style={styles.sentTitle}>Check your email</Text>
                  <Text style={styles.sentText}>
                    If an account exists for {email.trim()}, we have sent a reset link. Look in your
                    spam folder too.
                  </Text>
                  <Text style={styles.sentTextTl}>{COPY_TL.forgotPasswordSent}</Text>
                  <Text style={styles.sentNote}>
                    The link opens in your browser, where you can choose a new password. It expires
                    in 1 hour and works once.
                  </Text>
                  <Text style={styles.sentNoteTl}>{COPY_TL.forgotPasswordOpens}</Text>
                </View>
                <Button title="Back to sign in" onPress={() => onNavigate('login')} />
              </View>
            ) : (
              <View style={{ gap: 16, marginTop: 20 }}>
                <ErrorBanner message={error} />

                <TextField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Button
                  title="Send reset link"
                  onPress={onSubmit}
                  loading={submitting}
                  disabled={!email.trim()}
                />

                <View style={styles.footer}>
                  <Text style={styles.footerText}>Remembered it? </Text>
                  <Pressable onPress={() => onNavigate('login')} hitSlop={6}>
                    <Text style={styles.link}>Sign in</Text>
                  </Pressable>
                </View>
              </View>
            )}
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
    backgroundColor: colors.forest,
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 32,
    gap: 10,
  },
  brand: { color: colors.white, fontSize: 30, fontWeight: '800', letterSpacing: 0.5 },
  tagline: { color: colors.heroSubtle, fontSize: 14 },
  body: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: '800', color: colors.forest },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 6 },
  subtitleTl: { fontSize: 13, color: colors.muted, marginTop: 2, fontStyle: 'italic' },
  sentBox: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  sentTitle: { fontSize: 16, fontWeight: '800', color: colors.forest },
  sentText: { fontSize: 14, color: colors.text },
  sentTextTl: { fontSize: 13, color: colors.muted, fontStyle: 'italic' },
  sentNote: { fontSize: 13, color: colors.muted, marginTop: 6 },
  sentNoteTl: { fontSize: 12, color: colors.muted, fontStyle: 'italic' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  footerText: { fontSize: 13, color: colors.muted },
  link: { fontSize: 13, color: colors.primary, fontWeight: '700' },
});
