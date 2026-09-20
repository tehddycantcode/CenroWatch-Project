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
import { humanize, REPORT_ACTIONS, KIND_TONES } from '../../lib/reports';
import { ACTION_TL, STAT_TL, COPY_TL } from '../../lib/tagalog';
import { colors, radius } from '../../theme';
import { useResidentNav } from '../../navigation/navContext';
import StatusBadge from '../../components/StatusBadge';
import StatusLegend from '../../components/StatusLegend';
import NotificationBell from '../../components/NotificationBell';
import HeaderMenu from '../../components/HeaderMenu';
import VerifyEmailCard from '../../components/VerifyEmailCard';
import Icon from '../../components/Icon';

const DONE = ['Resolved', 'Completed', 'Released'];

// Stat tiles carry their own tint so the four numbers are told apart at a
// glance instead of reading as one green block. Matches the web dashboard.
// Icon per kind, for the recent-report rows. Falls back rather than throwing
// if a row ever arrives with a kind this build does not know about.
const KIND_ICON = Object.fromEntries(REPORT_ACTIONS.map((a) => [a.kind, a.icon]));
const kindChip = (kind) => ({
  icon: KIND_ICON[kind] || 'document-outline',
  tone: KIND_TONES[kind] || KIND_TONES.request,
});

const STATS_TONE = {
  'Total Reports': { icon: 'documents-outline', bg: '#dcfce7', fg: '#15803d' },
  Active: { icon: 'time-outline', bg: '#fef3c7', fg: '#b45309' },
  Resolved: { icon: 'checkmark-circle-outline', bg: '#e6fdf0', fg: '#0f3d1f' },
  'Wildlife Cases': { icon: 'paw-outline', bg: '#ede9fe', fg: '#6d28d9' },
};

function normalize(complaints, wildlife, requests) {
  return [
    ...complaints.map((c) => ({ id: c.tracking_id, kind: 'complaint', title: humanize(c.complaint_type), status: c.status, date: c.submitted_at })),
    ...wildlife.map((w) => ({ id: w.reference_id, kind: 'wildlife', title: w.species_name, status: w.status, date: w.submitted_at })),
    ...requests.map((r) => ({ id: r.tracking_id, kind: 'request', title: humanize(r.request_type), status: r.status, date: r.submitted_at })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
}

export default function DashboardScreen() {
  const { user, token } = useAuth();
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
  const resolvedPct = total ? Math.round((resolved / total) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandTile}>
            <Text style={styles.brandTileText}>CW</Text>
          </View>
          <Text style={styles.brand}>CENROWATCH</Text>
        </View>
        {/* The bell stays here on Home, where the unread count is worth showing
            at a glance. "Log out" moved into the menu: it was a text button
            competing with the brand for width, and it is now in the same place
            on every screen rather than only on this one. */}
        <View style={styles.headerActions}>
          <NotificationBell />
          <HeaderMenu />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Hero. Deliberately full-bleed and the same forest as the bar above
            it, so the two read as one block that scrolls away together - a
            second, brighter green card here looked like a mistake. Mirrors the
            web dashboard's forest banner, ending on the one number a resident
            actually wants: how much of their reporting is done. */}
        <View style={styles.hero}>
          <Text style={styles.greeting}>Good day, {user?.first_name || 'there'} 👋</Text>
          <Text style={styles.sub}>Cabuyao Environmental Monitor</Text>

          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${resolvedPct}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {resolved} of {total} resolved
            </Text>
          </View>
        </View>

        <VerifyEmailCard />

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
          {REPORT_ACTIONS.map((a) => (
            <Pressable
              key={a.kind}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              onPress={() => navigate(a.kind)}
            >
              <View style={[styles.actionChip, { backgroundColor: KIND_TONES[a.kind].bg }]}>
                <Icon name={a.icon} size={22} color={KIND_TONES[a.kind].fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>{a.title}</Text>
                {ACTION_TL[a.kind] ? (
                  <Text style={styles.actionTitleTl}>{ACTION_TL[a.kind].title}</Text>
                ) : null}
                <Text style={styles.actionDesc}>{a.desc}</Text>
                {ACTION_TL[a.kind] ? (
                  <Text style={styles.actionDescTl}>{ACTION_TL[a.kind].desc}</Text>
                ) : null}
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
            <Text style={styles.emptyTextTl}>{COPY_TL.noReports}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            <StatusLegend />
            {recent.map((r, i) => (
              <Pressable
                key={r.id}
                style={({ pressed }) => [styles.listRow, i > 0 && styles.listDivider, pressed && styles.pressed]}
                onPress={() => navigate('track', { id: r.id })}
              >
                <View style={[styles.rowChip, { backgroundColor: kindChip(r.kind).tone.bg }]}>
                  <Icon name={kindChip(r.kind).icon} size={17} color={kindChip(r.kind).tone.fg} />
                </View>
                <View style={{ flex: 1 }}>
                  {/* Titles wrap rather than truncate: on a narrow phone the
                      badge left so little room that "Open Burning" cut off. */}
                  <Text style={styles.rowTitle}>{r.title}</Text>
                  {/* The tracking id gets its own line - it must not break
                      mid-id, so inline with the date it overflowed its box. */}
                  <Text style={styles.rowId}>{r.id}</Text>
                  <Text style={styles.rowMeta}>
                    Submitted {new Date(r.date).toLocaleDateString()}
                  </Text>
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

function Stat({ label, value }) {
  const tone = STATS_TONE[label];
  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        <View style={[styles.statChip, { backgroundColor: tone.bg }]}>
          <Icon name={tone.icon} size={17} color={tone.fg} />
        </View>
        <Text style={[styles.statValue, { color: tone.fg }]}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      {STAT_TL[label] ? <Text style={styles.statLabelTl}>{STAT_TL[label]}</Text> : null}
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  // The floating Report button sits ~68px tall over the bottom of this list,
  // so the last row needs room to scroll clear of it.
  scroll: { padding: 20, paddingBottom: 96 },

  // Negative margins cancel the scroll container's padding so the hero can run
  // edge to edge and butt up against the bar above it, without restructuring
  // the rest of the screen into a second padded wrapper.
  hero: {
    marginTop: -20,
    marginHorizontal: -20,
    marginBottom: 6,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    backgroundColor: colors.forest,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  greeting: { fontSize: 24, fontWeight: '800', color: colors.white },
  sub: { fontSize: 14, color: colors.heroSubtle, marginTop: 2 },
  progressRow: { marginTop: 16, gap: 8 },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.white },
  progressText: { fontSize: 13, fontWeight: '600', color: colors.white, fontVariant: ['tabular-nums'] },

  error: { fontSize: 13, color: colors.danger, marginTop: 12 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  stat: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
  },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statChip: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  statLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.muted, marginTop: 8 },
  statLabelTl: { fontSize: 11, color: colors.muted, opacity: 0.8, marginTop: 1 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 26, marginBottom: 12 },

  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
  },
  // Tinted per kind (amber / violet / green), the same identity colors the web
  // app uses, so the type of a report reads before its text does.
  actionChip: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  actionTitleTl: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 1 },
  actionDesc: { fontSize: 13, color: colors.muted, marginTop: 5 },
  actionDescTl: { fontSize: 13, color: colors.muted, opacity: 0.8, marginTop: 1 },
  chevron: { fontSize: 24, color: colors.placeholder, fontWeight: '700' },

  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAll: { fontSize: 13, fontWeight: '700', color: colors.primary },

  list: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  listDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowChip: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowId: { fontSize: 12, color: colors.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
  rowMeta: { fontSize: 12, color: colors.muted, fontVariant: ['tabular-nums'] },

  empty: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 24 },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  emptyTextTl: { fontSize: 13, color: colors.muted, opacity: 0.8, textAlign: 'center', marginTop: 4 },
});
