import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { api, fileUrl } from '../../api/client';
import { trackingKind, KIND, humanize } from '../../lib/reports';
import { colors, radius } from '../../theme';
import { useResidentNav } from '../../navigation/navContext';
import ScreenHeader from '../../components/ScreenHeader';
import StatusBadge from '../../components/StatusBadge';

const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

function buildView(kind, d) {
  if (kind === 'complaint') {
    return {
      id: d.tracking_id,
      title: humanize(d.complaint_type),
      media: d.photo_path,
      rows: [
        ['Type', humanize(d.complaint_type)],
        ['Barangay', d.barangay?.name],
        ['Priority', d.priority ? 'Yes' : 'No'],
        ['Submitted', fmt(d.submitted_at)],
        ...(d.observed_at ? [['Date observed', fmt(d.observed_at)]] : []),
        ['SLA deadline', fmt(d.sla_deadline)],
        ['Resolved', fmt(d.resolved_at)],
      ],
      notes: d.resolution_notes || d.staff_notes,
      description: d.description,
      latitude: d.latitude,
      longitude: d.longitude,
      status: d.status,
      history: d.status_history || [],
    };
  }
  if (kind === 'wildlife') {
    return {
      id: d.reference_id,
      title: d.species_name,
      media: d.photo_path,
      rows: [
        ['Species', d.species_name],
        ['Category', d.species_category || '—'],
        ['Condition', humanize(d.animal_condition)],
        ['Endangered', d.is_endangered ? 'Yes (priority review)' : 'No'],
        ['Barangay', d.barangay?.name],
        ['Submitted', fmt(d.submitted_at)],
        ['SLA deadline', fmt(d.sla_deadline)],
      ],
      notes: d.staff_notes,
      description: d.description,
      latitude: d.latitude,
      longitude: d.longitude,
      status: d.status,
      history: d.status_history || [],
    };
  }
  return {
    id: d.tracking_id,
    title: humanize(d.request_type),
    media: d.document_path,
    rows: [
      ['Service', humanize(d.request_type)],
      ['Barangay', d.barangay?.name],
      ['Quantity', d.requested_quantity ?? '—'],
      ['Preferred date', d.preferred_schedule ? new Date(d.preferred_schedule).toLocaleDateString() : '—'],
      ['Scheduled', fmt(d.scheduled_date)],
      ['Submitted', fmt(d.submitted_at)],
      ['SLA deadline', fmt(d.sla_deadline)],
    ],
    notes: d.staff_notes,
    description: d.description,
    latitude: null,
    longitude: null,
    status: d.status,
    history: d.status_history || [],
  };
}

export default function TrackReportScreen({ id }) {
  const { token } = useAuth();
  const { switchTab } = useResidentNav();
  const kind = trackingKind(id);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchers = {
      complaint: () => api.complaints.get(id, token).then((r) => r.data.complaint),
      wildlife: () => api.wildlife.get(id, token).then((r) => r.data.turnover),
      request: () => api.requests.get(id, token).then((r) => r.data.request),
    };
    if (!kind) {
      setError('Unrecognized tracking number.');
      return;
    }
    fetchers[kind]()
      .then((d) => setView(buildView(kind, d)))
      .catch((e) => setError(e.message || 'Could not load this report.'));
  }, [id, kind, token]);

  const mediaUrl = view ? fileUrl(view.media) : null;
  const isPdf = view?.media && /\.pdf$/i.test(view.media);
  const hasGeo = view?.latitude != null && view?.longitude != null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Track Report" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {error ? (
          <View style={styles.card}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => switchTab('reports')} style={{ marginTop: 14 }}>
              <Text style={styles.link}>← Back to My Reports</Text>
            </Pressable>
          </View>
        ) : !view ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kindLine}>
                  {KIND[kind].label} · {view.id}
                </Text>
                <Text style={styles.title}>{view.title}</Text>
              </View>
              <StatusBadge status={view.status} stage />
            </View>

            <View style={styles.rows}>
              {view.rows.map(([label, value]) => (
                <View key={label} style={styles.rowItem}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Text style={styles.rowValue}>{value != null && value !== '' ? String(value) : '—'}</Text>
                </View>
              ))}
            </View>

            <View style={styles.block}>
              <Text style={styles.rowLabel}>Description</Text>
              <Text style={styles.description}>{view.description}</Text>
            </View>

            {hasGeo && (
              <Text style={styles.geo}>
                📍 {view.latitude}, {view.longitude}
              </Text>
            )}

            {view.notes ? (
              <View style={styles.notes}>
                <Text style={styles.rowLabel}>CENRO notes</Text>
                <Text style={styles.notesText}>{view.notes}</Text>
              </View>
            ) : null}

            {view.history.length > 0 ? (
              <View style={styles.updates}>
                <Text style={styles.rowLabel}>Updates from CENRO</Text>
                {view.history.map((h) => (
                  <View key={h.changed_at} style={styles.update}>
                    <View style={styles.updateHead}>
                      <Text style={styles.updateStatus}>{humanize(h.new_status)}</Text>
                      <Text style={styles.updateDate}>{fmt(h.changed_at)}</Text>
                    </View>
                    <Text style={h.note ? styles.updateNote : styles.updateEmpty}>
                      {h.note || 'Status updated.'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {mediaUrl ? (
              <View style={styles.block}>
                <Text style={styles.rowLabel}>Attachment</Text>
                {isPdf ? (
                  <Pressable onPress={() => Linking.openURL(mediaUrl)} style={{ marginTop: 6 }}>
                    <Text style={styles.link}>View document (PDF)</Text>
                  </Pressable>
                ) : (
                  <Image source={{ uri: mediaUrl }} style={styles.media} contentFit="cover" />
                )}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: 16, paddingBottom: 36 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 18 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kindLine: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.muted },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 3 },

  rows: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 18 },
  rowItem: { width: '50%', marginBottom: 14 },
  rowLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.muted },
  rowValue: { fontSize: 14, color: colors.text, marginTop: 2 },

  block: { marginTop: 6 },
  description: { fontSize: 14, color: colors.text, marginTop: 4, lineHeight: 20 },
  geo: { fontSize: 13, color: colors.muted, marginTop: 14 },

  updates: { marginTop: 18 },
  update: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 12, marginTop: 12 },
  updateHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  updateStatus: { fontSize: 14, fontWeight: '700', color: colors.text },
  updateDate: { fontSize: 11, color: colors.muted },
  updateNote: { fontSize: 14, color: colors.text, marginTop: 3, lineHeight: 20 },
  updateEmpty: { fontSize: 14, color: colors.muted, fontStyle: 'italic', marginTop: 3 },

  notes: { backgroundColor: colors.tint, borderRadius: radius.md, padding: 14, marginTop: 16 },
  notesText: { fontSize: 14, color: colors.text, marginTop: 4, lineHeight: 20 },

  media: { width: '100%', height: 220, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: 8 },

  error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
