import { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useResidentNav } from '../navigation/navContext';
import { colors, radius } from '../theme';
import Icon from './Icon';

// The header menu, mirroring the web app's phone nav.
//
// WHY IT EXISTS: ScreenHeader carries a back chevron and a title and nothing
// else, so on My Reports, Notifications, Track and every report form there was
// no notification bell and no way to sign out. Reaching either meant going back
// to the dashboard first. The bottom tab bar keeps Home / My Reports / Profile
// one tap away and is NOT replaced by this - a tab bar beats a menu for the
// destinations people use constantly. This carries what the tab bar has no room
// for, so the two are complements rather than two routes to the same place.
//
// "Track a report" is deliberately absent: TrackReportScreen takes a tracking id
// and renders that one report, so there is nothing to navigate to without an id.
// Residents reach it by tapping a row in My Reports. A menu entry would need a
// lookup screen that does not exist yet.

// `screen` is matched against the navigator's current entry so the active row
// can be marked; `action` rows do something else and are never active.
const ITEMS = [
  { key: 'dashboard', label: 'Home', tl: 'Home', icon: 'home-outline', iconActive: 'home', screen: 'dashboard' },
  { key: 'reports', label: 'My Reports', tl: 'Mga ulat ko', icon: 'document-text-outline', iconActive: 'document-text', screen: 'reports' },
  { key: 'notifications', label: 'Notifications', tl: 'Mga abiso', icon: 'notifications-outline', iconActive: 'notifications', screen: 'notifications' },
  { key: 'profile', label: 'Profile', tl: 'Aking account', icon: 'person-outline', iconActive: 'person', screen: 'profile' },
];

export default function HeaderMenu({ tint = colors.white }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { switchTab, current } = useResidentNav();

  function go(item) {
    setOpen(false);
    // switchTab resets that tab's stack to its root, which is what a menu entry
    // should do: tapping "Home" from four screens deep lands on Home, not on
    // Home with three screens still stacked behind it.
    switchTab(item.screen);
  }

  async function onLogout() {
    setOpen(false);
    await logout();
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        <Icon name="menu" size={22} color={tint} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        {/* Tapping the dimmed area closes, which is what people try first.
            onRequestClose covers the Android hardware back button, so the menu
            never traps someone who expects back to dismiss it. */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
        <View style={[styles.panel, { paddingTop: insets.top + 8 }]}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Menu</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close menu">
              <Icon name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          {ITEMS.map((item) => {
            const active = item.screen === current;
            return (
              <Pressable
                key={item.key}
                onPress={() => go(item)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.rowPressed]}
              >
                <Icon
                  name={active ? item.iconActive : item.icon}
                  size={20}
                  color={active ? colors.primary : colors.muted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>{item.label}</Text>
                  <Text style={styles.rowLabelTl}>{item.tl}</Text>
                </View>
              </Pressable>
            );
          })}

          <View style={styles.divider} />

          <Pressable
            onPress={onLogout}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Icon name="log-out-outline" size={20} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.danger }]}>Log out</Text>
              <Text style={styles.rowLabelTl}>Mag-sign out</Text>
            </View>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // 40x40 keeps the tap target past the touch minimum even though the glyph is
  // 22px, matching the bell it sits beside.
  trigger: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  triggerPressed: { opacity: 0.6 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,61,31,0.45)' },
  // Drops from the top, under the status bar, because that is where the trigger
  // is - a sheet rising from the bottom would come from the opposite end of the
  // screen to the control that opened it.
  panel: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  panelTitle: { fontSize: 16, fontWeight: '800', color: colors.text },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  rowActive: { backgroundColor: colors.tint },
  rowPressed: { opacity: 0.7 },
  rowLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowLabelActive: { color: colors.primary },
  rowLabelTl: { fontSize: 12, color: colors.muted, marginTop: 1 },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: 6, marginHorizontal: 10 },
});
