import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useResidentNav } from '../navigation/navContext';
import ScreenHeader from './ScreenHeader';
import ErrorBanner from './ErrorBanner';
import VerifyEmailCard from './VerifyEmailCard';
import Button from './Button';

// Field label + optional hint/error wrapper, so every form row looks the same.
export function Field({ label, hint, error, children }) {
  return (
    <View style={{ gap: 7 }}>
      {label ? <Text style={fieldStyles.label}>{label}</Text> : null}
      {children}
      {error ? (
        <Text style={fieldStyles.error}>{error}</Text>
      ) : hint ? (
        <Text style={fieldStyles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.text },
  error: { fontSize: 12, color: colors.danger, fontWeight: '500' },
  hint: { fontSize: 12, color: colors.muted },
});

// Wraps a report form: header, scrollable fields, error banner + submit button,
// and a success card (with the tracking id) once the report is filed.
export default function ReportFormShell({
  headerTitle,
  title,
  subtitle,
  onSubmit,
  submitting,
  error,
  success,
  submitLabel = 'Submit Report',
  // Set by the complaint form when the resident ticked "file anonymously".
  // Changes the success screen only; sending the flag is the caller's job.
  anonymous = false,
  children,
}) {
  const { navigate, switchTab } = useResidentNav();
  // Filing needs a confirmed address (the server answers 403 otherwise). One
  // check here covers the complaint, wildlife and request forms, since all three
  // render through this shell.
  const { user } = useAuth();
  const unverified = !!user && !user.email_verified_at;

  if (success) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={headerTitle} />
        <View style={styles.successWrap}>
          <View style={styles.check}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
          <Text style={styles.successTitle}>
            {anonymous ? 'Anonymous report submitted' : 'Report submitted'}
          </Text>
          <Text style={styles.successText}>
            {anonymous
              ? 'Write this reference down before you leave this screen. It is the only way to check the report, and it shows the status only - not the photo or CENRO’s notes. This report is not in My Reports and we cannot notify you about it.'
              : 'Thank you. Keep this tracking number to follow your report’s progress.'}
          </Text>
          <View style={styles.idPill}>
            <Text style={styles.idText}>{success}</Text>
          </View>
          <View style={{ width: '100%', gap: 12, marginTop: 8 }}>
            {/* WHICH SCREEN THIS OPENS IS NOT COSMETIC. 'track' calls
                complaints.get(), which the server answers 403 for whenever the
                report's user_id is not the caller - and an anonymous report has
                user_id NULL, so it 403s even for the person who just filed it.
                The public lookup takes the same reference and needs no account. */}
            <Button
              title={anonymous ? 'Check its status' : 'Track this report'}
              onPress={() => navigate(anonymous ? 'track-public' : 'track', { id: success })}
            />
            <Button title="Back to dashboard" variant="outline" onPress={() => switchTab('dashboard')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={headerTitle} />
      {/* `padding` on BOTH platforms. Android used to be left undefined and
          rely on the window resizing itself, but Expo enables edge-to-edge by
          default from SDK 53 on, and under edge-to-edge the window no longer
          reliably resizes for the keyboard - so the bottom fields on this form
          were typed blind. react-native-safe-area-context 5.x reports the IME
          inset, which is what makes `padding` work here. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          // Keeps a focused field clear of the keyboard on iOS; harmless elsewhere.
          automaticallyAdjustKeyboardInsets
        >
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <View style={{ gap: 18, marginTop: 18 }}>
            <ErrorBanner message={error} />
            {/* The card is the only way past the block, so it goes ON the form
                rather than only on the dashboard - being told "confirm your
                email" on a different screen from the one that is refusing is
                what makes people give up. It renders nothing once confirmed. */}
            <VerifyEmailCard />
            {children}
            {unverified ? (
              <Text style={styles.blockedNote}>
                Confirm your email address above before you can send this report.
              </Text>
            ) : null}
            <Button
              title={submitLabel}
              onPress={onSubmit}
              loading={submitting}
              disabled={unverified}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 4 },
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  check: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: colors.primary, fontSize: 32, fontWeight: '900' },
  successTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  successText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21 },
  blockedNote: { fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: -6 },
  idPill: {
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginVertical: 4,
  },
  idText: { color: colors.white, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
});
