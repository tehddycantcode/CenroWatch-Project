import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { colors, radius } from '../theme';
import TextField from '../components/TextField';
import ErrorBanner from '../components/ErrorBanner';
import Button from '../components/Button';

// Status lookup by reference number, with NO ACCOUNT.
//
// THIS IS NOT OPTIONAL POLISH. An anonymous complaint is stored with user_id
// NULL, so api.complaints.get() answers 403 for it even to the person who filed
// it, and /complaints/mine can never list it. Without this screen the reference
// number the app tells people to write down would buy them nothing, and both
// lib/privacy.js and the Tagalog anonymousHint already promise they can follow
// the report up. A promise in user-facing copy is a feature commitment.
//
// The endpoint returns status, type, barangay and dates only - zero personal
// data (R.A. 10173) - which is why it is safe to expose unauthenticated.
//
// Chrome is hand-rolled for the same reason as AnonymousReportScreen: the
// shared shell's header calls useResidentNav(), which throws outside the
// signed-in navigator.
export default function PublicTrackScreen({ onNavigate, initialId = '' }) {
  const [id, setId] = useState(initialId);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onTrack() {
    const ref = id.trim().toUpperCase();
    setError('');
    setReport(null);
    if (!ref) {
      setError('Enter the reference number from your report.');
      return;
    }
    setLoading(true);
    try {
      // No token, deliberately - see api/client.js.
      const res = await api.complaints.trackPublic(ref);
      setReport(res.data.complaint);
    } catch (err) {
      setError(err.message || 'Could not find that reference number.');
    } finally {
      setLoading(false);
    }
  }

  const fmt = (v) => (v ? new Date(v).toLocaleString() : '-');

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.header}>
            <Pressable onPress={() => onNavigate('login')} hitSlop={8} accessibilityLabel="Back to sign in">
              <Text style={styles.back}>{'‹'}</Text>
            </Pressable>
            <Text style={styles.title}>Check a report</Text>
          </View>
          <Text style={styles.subtitle}>
            Enter the reference number you were given (e.g. CMP-2026-00001).
          </Text>

          <View style={{ gap: 14, marginTop: 18 }}>
            <ErrorBanner message={error} />

            <TextField
              label="Reference number"
              value={id}
              onChangeText={setId}
              placeholder="CMP-2026-00001"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Button title="Check status" onPress={onTrack} loading={loading} />

            {report ? (
              <View style={styles.card}>
                <Text style={styles.cardRef}>{report.tracking_id}</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{String(report.status).replace(/_/g, ' ')}</Text>
                </View>
                <Row label="Type" value={String(report.complaint_type).replace(/_/g, ' ')} />
                <Row label="Barangay" value={report.barangay?.name} />
                <Row label="Submitted" value={fmt(report.submitted_at)} />
                <Row label="Last updated" value={fmt(report.updated_at)} />
                <Text style={styles.privacyNote}>
                  For your privacy, public tracking shows the status only. No personal details,
                  photo or staff notes are displayed.
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '-'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 16, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { fontSize: 30, color: colors.text, fontWeight: '700', marginTop: -4 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: 16,
    gap: 10,
  },
  cardRef: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: 1 },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.tint,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { color: colors.primary, fontWeight: '700', fontSize: 12, letterSpacing: 0.4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 13, color: colors.muted },
  rowValue: { fontSize: 13, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  privacyNote: { fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: 4 },
});
