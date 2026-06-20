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
import { SafeAreaView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { humanize } from '../../lib/reports';
import { colors, radius } from '../../theme';
import { useResidentNav } from '../../navigation/navContext';
import StatusBadge from '../../components/StatusBadge';

const DONE = ['Resolved', 'Completed', 'Released'];

const ACTIONS = [
  { screen: 'complaint', emoji: '🗑️', title: 'Report a Complaint', desc: 'Illegal dumping, burning, noise, pollution…' },
  { screen: 'wildlife', emoji: '🦅', title: 'Wildlife Turnover', desc: 'Report or turn over rescued wildlife.' },
  { screen: 'request', emoji: '🌱', title: 'Request a Service', desc: 'Seedlings, hauling, creek cleaning…' },
];

function normalize(complaints, wildlife, requests) {
  return [
    ...complaints.map((c) => ({ id: c.tracking_id, title: humanize(c.complaint_type), status: c.status, date: c.submitted_at })),
    ...wildlife.map((w) => ({ id: w.reference_id, title: w.species_name, status: w.status, date: w.submitted_at })),
    ...requests.map((r) => ({ id: r.tracking_id, title: humanize(r.request_type), status: r.status, date: r.submitted_at })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
}

export default function DashboardScreen() {
  const { user, token, logout } = useAuth();
  const { navigate } = useResidentNav();
  const [items, setItems] = useState(null);
  const [wildlifeCount, setWildlifeCount] = useState(0);
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
      setWildlifeCount(w.data.turnovers.length);
      setItems(normalize(c.data.complaints, w.data.turnovers, r.data.requests));
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

  const total = items?.length ?? 0;
  const resolved = items?.filter((i) => DONE.includes(i.status)).length ?? 0;
  const active = total - resolved;
  const recent = items?.slice(0, 6) ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandTile}>
            <Text style={styles.brandTileText}>CW</Text>
          </View>
          <Text style={styles.brand}>CENROWATCH</Text>
        </View>
        <Pressable onPress={logout} hitSlop={8}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.greeting}>Good day, {user?.first_name || 'there'} 👋</Text>
        <Text style={styles.sub}>Cabuyao Environmental Monitor</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Stats */}
        <View style={styles.statsGrid}>
          <Stat label="Total Reports" value={total} />
          <Stat label="Active" value={active} />
          <Stat label="Resolved" value={resolved} />
          <Stat label="Wildlife Cases" value={wildlifeCount} />
        </View>

        {/* Actions */}
        <Text style={styles.sectionTitle}>What would you like to do?</Text>
        <View style={{ gap: 12 }}>
          {ACTIONS.map((a) => (
            <Pressable key={a.screen} style={styles.action} onPress={() => navigate(a.screen)}>
              <Text style={styles.actionEmoji}>{a.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>{a.title}</Text>
                <Text style={styles.actionDesc}>{a.desc}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>

        {/* Recent */}
        <View style={styles.recentHead}>
          <Text style={styles.sectionTitle}>Recent reports</Text>
          {recent.length > 0 && (
            <Pressable onPress={() => navigate('reports')} hitSlop={6}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          )}
        </View>

        {items === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : recent.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              You haven&apos;t filed any reports yet. Use an action above to get started.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {recent.map((r, i) => (
              <Pressable
                key={r.id}
                style={[styles.listRow, i > 0 && styles.listDivider]}
                onPress={() => navigate('track', { id: r.id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{r.title}</Text>
                  <Text style={styles.rowMeta}>
                    {r.id} · {new Date(r.date).toLocaleDateString()}
                  </Text>
                </View>
                <StatusBadge status={r.status} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.forest,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandTile: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  brandTileText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  brand: { color: colors.white, fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  logout: { color: colors.light, fontSize: 13, fontWeight: '700' },

  scroll: { padding: 20, paddingBottom: 32 },
  greeting: { fontSize: 24, fontWeight: '800', color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  error: { fontSize: 13, color: colors.danger, marginTop: 12 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  stat: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.muted, marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 26, marginBottom: 12 },

  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
  },
  actionEmoji: { fontSize: 24 },
  actionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  actionDesc: { fontSize: 13, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 24, color: colors.placeholder, fontWeight: '700' },

  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAll: { fontSize: 13, fontWeight: '700', color: colors.primary },

  list: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  listDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },

  empty: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 24 },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
