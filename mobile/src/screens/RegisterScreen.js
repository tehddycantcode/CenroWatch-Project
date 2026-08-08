import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { colors } from '../theme';
import TextField from '../components/TextField';
import Button from '../components/Button';
import Checkbox from '../components/Checkbox';
import BarangayPicker from '../components/BarangayPicker';
import ErrorBanner from '../components/ErrorBanner';
import { PRIVACY_SUMMARY, PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../lib/privacy';

export default function RegisterScreen({ onNavigate }) {
  const { register } = useAuth();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    contact_number: '',
    barangay_id: '',
    password: '',
    confirm_password: '',
    privacy_consent: false,
  });
  const [barangays, setBarangays] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    api
      .barangays()
      .then((res) => setBarangays(res.data.barangays))
      .catch(() => setBarangays([]));
  }, []);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  function validate() {
    const e = {};
    if (!form.first_name.trim()) e.first_name = 'Required.';
    if (!form.last_name.trim()) e.last_name = 'Required.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email.';
    if (form.password.length < 8) e.password = 'At least 8 characters.';
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password))
      e.password = 'Use both letters and numbers.';
    if (form.confirm_password !== form.password) e.confirm_password = 'Passwords do not match.';
    if (!form.privacy_consent) e.privacy_consent = 'Consent is required to register.';
    return e;
  }

  async function onSubmit() {
    setError('');
    const e = validate();
    setFieldErrors(e);
    if (Object.keys(e).length) return;

    setSubmitting(true);
    try {
      await register({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        contact_number: form.contact_number.trim() || undefined,
        barangay_id: form.barangay_id ? Number(form.barangay_id) : undefined,
        password: form.password,
        privacy_consent: true,
      });
    } catch (err) {
      if (Array.isArray(err.errors)) {
        const mapped = {};
        for (const { field, message } of err.errors) mapped[field] = message;
        setFieldErrors((prev) => ({ ...prev, ...mapped }));
      }
      setError(err.message || 'Unable to create account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable onPress={() => onNavigate('login')} hitSlop={8}>
              <Text style={styles.back}>‹</Text>
            </Pressable>
            <Text style={styles.title}>Create account</Text>
          </View>
          <Text style={styles.subtitle}>Join CENROWATCH to help protect Cabuyao</Text>

          <View style={{ gap: 14, marginTop: 18 }}>
            <ErrorBanner message={error} />

            <View style={styles.row}>
              <TextField
                containerStyle={{ flex: 1 }}
                label="First name"
                value={form.first_name}
                onChangeText={set('first_name')}
                placeholder="Juan"
                error={fieldErrors.first_name}
              />
              <TextField
                containerStyle={{ flex: 1 }}
                label="Last name"
                value={form.last_name}
                onChangeText={set('last_name')}
                placeholder="Dela Cruz"
                error={fieldErrors.last_name}
              />
            </View>

            <TextField
              label="Email"
              value={form.email}
              onChangeText={set('email')}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={fieldErrors.email}
            />
            <TextField
              label="Contact number"
              value={form.contact_number}
              onChangeText={set('contact_number')}
              placeholder="09xx xxx xxxx"
              keyboardType="phone-pad"
              hint="Optional"
              error={fieldErrors.contact_number}
            />
            <BarangayPicker
              items={barangays}
              value={form.barangay_id}
              onChange={set('barangay_id')}
              error={fieldErrors.barangay_id}
            />
            <TextField
              label="Password"
              value={form.password}
              onChangeText={set('password')}
              placeholder="At least 8 characters"
              secureTextEntry
              hint="At least 8 characters, with a letter and a number"
              error={fieldErrors.password}
            />
            <TextField
              label="Confirm password"
              value={form.confirm_password}
              onChangeText={set('confirm_password')}
              placeholder="Re-enter password"
              secureTextEntry
              error={fieldErrors.confirm_password}
            />

            <View style={{ gap: 8, marginTop: 2 }}>
              {/* Consent has to be informed, so the notice is readable here
                  rather than only referenced by name. */}
              <View style={styles.privacyBox}>
                <Text style={styles.privacySummary}>{PRIVACY_SUMMARY}</Text>
                <Pressable onPress={() => setShowPrivacy((v) => !v)} hitSlop={6}>
                  <Text style={styles.privacyToggle}>
                    {showPrivacy ? 'Hide the full privacy notice' : 'Read the full privacy notice'}
                  </Text>
                </Pressable>
                {showPrivacy ? (
                  <View style={styles.privacyBody}>
                    {PRIVACY_SECTIONS.map((s) => (
                      <View key={s.title} style={{ marginBottom: 12 }}>
                        <Text style={styles.privacyHeading}>{s.title}</Text>
                        {s.body.map((p) => (
                          <Text key={p} style={styles.privacyText}>{p}</Text>
                        ))}
                      </View>
                    ))}
                    <Text style={styles.privacyUpdated}>Last updated {PRIVACY_UPDATED}.</Text>
                  </View>
                ) : null}
              </View>

              <Checkbox checked={form.privacy_consent} onChange={set('privacy_consent')}>
                I have read the privacy notice and consent to the processing of my personal data in
                accordance with R.A. 10173 (Data Privacy Act of 2012).
              </Checkbox>
              {fieldErrors.privacy_consent ? (
                <Text style={styles.fieldErr}>{fieldErrors.privacy_consent}</Text>
              ) : null}
            </View>

            <Button title="Create Account" onPress={onSubmit} loading={submitting} />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Pressable onPress={() => onNavigate('login')} hitSlop={6}>
                <Text style={styles.link}>Sign in</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 16, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { fontSize: 30, color: colors.text, fontWeight: '700', marginTop: -4 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4 },
  row: { flexDirection: 'row', gap: 12 },
  fieldErr: { fontSize: 12, color: colors.danger, fontWeight: '500' },

  privacyBox: { backgroundColor: colors.tint, borderRadius: 10, padding: 12 },
  privacySummary: { fontSize: 12, color: colors.text, lineHeight: 18 },
  privacyToggle: { fontSize: 12, color: colors.primary, fontWeight: '700', marginTop: 8 },
  privacyBody: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  privacyHeading: { fontSize: 12, fontWeight: '700', color: colors.text },
  privacyText: { fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: 3 },
  privacyUpdated: { fontSize: 11, color: colors.muted },

  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  footerText: { fontSize: 13, color: colors.muted },
  link: { fontSize: 13, color: colors.primary, fontWeight: '700' },
});
