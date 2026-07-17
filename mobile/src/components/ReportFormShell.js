import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { useResidentNav } from '../navigation/navContext';
import ScreenHeader from './ScreenHeader';
import ErrorBanner from './ErrorBanner';
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
  children,
}) {
  const { navigate, switchTab } = useResidentNav();

  if (success) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={headerTitle} />
        <View style={styles.successWrap}>
          <View style={styles.check}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Report submitted</Text>
          <Text style={styles.successText}>
            Thank you. Keep this tracking number to follow your report&apos;s progress.
          </Text>
          <View style={styles.idPill}>
            <Text style={styles.idText}>{success}</Text>
          </View>
          <View style={{ width: '100%', gap: 12, marginTop: 8 }}>
            <Button title="Track this report" onPress={() => navigate('track', { id: success })} />
            <Button title="Back to dashboard" variant="outline" onPress={() => switchTab('dashboard')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={headerTitle} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <View style={{ gap: 18, marginTop: 18 }}>
            <ErrorBanner message={error} />
            {children}
            <Button title={submitLabel} onPress={onSubmit} loading={submitting} />
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
  idPill: {
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginVertical: 4,
  },
  idText: { color: colors.white, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
});
