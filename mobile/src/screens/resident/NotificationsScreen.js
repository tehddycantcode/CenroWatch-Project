import { useState } from 'react';
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
import { COPY_TL } from '../../lib/tagalog';
import { colors, radius } from '../../theme';
import { useResidentNav } from '../../navigation/navContext';
import ScreenHeader from '../../components/ScreenHeader';
import useNotifications from '../../lib/useNotifications';

// Relative "x ago" for notification timestamps. Duplicated from the web bell
// (mobile cannot import from web/src - see AGENTS.md); it is small enough that
// a shared module would cost more than it saves.
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Notification.link is a WEB route ("/resident/track/CMP-2026-00004") because
// one backend serves both clients. Mobile navigates by screen name, not path,
// so take the tracking id off the end and let the navigator do the rest.
// Returns null for a linkless notification - the row still marks read, it just
// has nowhere to go.
function trackingIdFromLink(link) {
  if (!link) return null;
  return String(link).split('/').filter(Boolean).pop() || null;
}

export default function NotificationsScreen() {
  const { navigate } = useResidentNav();
  const { items, unread, loading, error, refresh, markRead, markAllRead } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  // Mark read first so the badge drops even if this row has no link to follow.
  function onOpen(n) {
    markRead(n);
    const id = trackingIdFromLink(n.link);
    if (id) navigate('track', { id });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Notifications" />

      <View style={styles.bar}>
        <Text style={styles.barTl}>{COPY_TL.notifications}</Text>
        {unread > 0 && (
          <Pressable onPress={markAllRead} hitSlop={8}>
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No notifications yet. You&apos;ll be told here when CENRO updates one of your
              reports.
            </Text>
            <Text style={styles.emptyTextTl}>{COPY_TL.noNotifications}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((n, i) => (
              <Pressable
                key={n.notification_id}
                onPress={() => onOpen(n)}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.divider,
                  !n.is_read && styles.rowUnread,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.rowHead}>
                  {/* Wraps rather than truncates: the title carries the tracking
                      id, and half an id is worse than a second line. */}
                  <Text style={styles.rowTitle}>{n.title}</Text>
                  {!n.is_read && <View style={styles.dot} />}
                </View>
                <Text style={styles.rowBody}>{n.body}</Text>
                <Text style={styles.rowTime}>{timeAgo(n.created_at)}</Text>
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

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
  },
  barTl: { fontSize: 13, fontWeight: '600', color: colors.muted },
  markAll: { fontSize: 13, fontWeight: '700', color: colors.primary },

  // No floating Report button on this screen (it is not a FAB root), so the
  // list does not need the extra bottom clearance the report screens carry.
  scroll: { padding: 16, paddingTop: 10, paddingBottom: 28 },
  error: { fontSize: 13, color: colors.danger, marginBottom: 12 },

  list: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: { paddingHorizontal: 16, paddingVertical: 14, gap: 3 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  // Unread rows are tinted as well as dotted: the tint is what makes "you have
  // something new" readable at arm's length, before any single dot registers.
  rowUnread: { backgroundColor: colors.tint },
  pressed: { opacity: 0.9 },

  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primary },
  rowBody: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  rowTime: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.placeholder,
    marginTop: 2,
  },

  empty: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 24,
    marginTop: 4,
  },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  emptyTextTl: {
    fontSize: 13,
    color: colors.muted,
    opacity: 0.8,
    textAlign: 'center',
    marginTop: 4,
  },
});
