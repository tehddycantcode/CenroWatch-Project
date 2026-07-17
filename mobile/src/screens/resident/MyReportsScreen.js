import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { humanize } from '../../lib/reports';
import { colors, radius } from '../../theme';
import { useResidentNav } from '../../navigation/navContext';
import ScreenHeader from '../../components/ScreenHeader';
import StatusBadge from '../../components/StatusBadge';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'complaint', label: 'Complaints' },
  { key: 'wildlife', label: 'Wildlife' },
  { key: 'request', label: 'Requests' },
];

export default function MyReportsScreen() {
  const { token } = useAuth();
  const { navigate } = useResidentNav();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('all');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [c, w, r] = await Promise.all([
        api.complaints.mine(token),
        api.wildlife.mine(token),
        api.requests.mine(token),
      ]);
      const merged = [
        ...c.data.complaints.map((x) => ({ id: x.tracking_id, kind: 'complaint', title: humanize(x.complaint_type), status: x.status, date: x.submitted_at, observed: x.observed_at })),
        ...w.data.turnovers.map((x) => ({ id: x.reference_id, kind: 'wildlife', title: x.species_name, status: x.status, date: x.submitted_at })),
        ...r.data.requests.map((x) => ({ id: x.tracking_id, kind: 'request', title: humanize(x.request_type), status: x.status, date: x.submitted_at })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date));
      setItems(merged);
    } catch (e) {
      setError(e.message || 'Could not load your reports.');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = items ? (tab === 'all' ? items : items.filter((i) => i.kind === tab)) : [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="My Reports" />

      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {items === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No reports in this category yet.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map((r, i) => (
              <Pressable
                key={r.id}
                style={[styles.row, i > 0 && styles.divider]}
                onPress={() => navigate('track', { id: r.id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{r.title}</Text>
                  <Text style={styles.rowMeta}>
                    {r.id} · Submitted {new Date(r.date).toLocaleString()}
                  </Text>
                  {r.observed ? (
                    <Text style={styles.rowMeta}>Observed {new Date(r.observed).toLocaleDateString()}</Text>
                  ) : null}
                </View>
                <StatusBadge status={r.status} stage />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, paddingBottom: 4 },
  tab: { borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  tabTextActive: { color: colors.white },

  scroll: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  error: { fontSize: 13, color: colors.danger, marginBottom: 12 },

  list: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },

  empty: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 24, marginTop: 4 },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
