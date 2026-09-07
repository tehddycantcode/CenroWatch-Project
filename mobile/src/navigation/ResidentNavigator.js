import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { NavContext } from './navContext';
import DashboardScreen from '../screens/resident/DashboardScreen';
import MyReportsScreen from '../screens/resident/MyReportsScreen';
import ComplaintFormScreen from '../screens/resident/ComplaintFormScreen';
import WildlifeFormScreen from '../screens/resident/WildlifeFormScreen';
import RequestFormScreen from '../screens/resident/RequestFormScreen';
import TrackReportScreen from '../screens/resident/TrackReportScreen';
import ProfileScreen from '../screens/resident/ProfileScreen';
import NotificationsScreen from '../screens/resident/NotificationsScreen';
import ReportSheet from '../components/ReportSheet';
import Icon from '../components/Icon';

// Dependency-light navigation for the resident area: a small screen stack with
// two tab roots (Dashboard, My Reports) and pushable detail/form screens. This
// keeps the app free of a router dependency while screens are still few; it can
// be swapped for expo-router later without touching the screens (they only use
// the navigate/goBack hook from navContext).

const TAB_ROOTS = ['dashboard', 'reports', 'profile'];

// Where the floating Report button appears. Profile is left out on purpose:
// it is the account screen, not a reporting one, and the button would only sit
// on top of the sign-out row.
const FAB_ROOTS = ['dashboard', 'reports'];

// Ionicons names. The active tab uses the solid variant and the rest the
// outline, so the current tab reads even in grayscale - colour alone would not.
const TABS = [
  { key: 'dashboard', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { key: 'reports', label: 'My Reports', icon: 'document-text-outline', iconActive: 'document-text' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

function renderScreen(entry) {
  switch (entry.screen) {
    case 'dashboard':
      return <DashboardScreen />;
    case 'reports':
      return <MyReportsScreen />;
    case 'complaint':
      return <ComplaintFormScreen />;
    case 'wildlife':
      return <WildlifeFormScreen />;
    case 'request':
      return <RequestFormScreen />;
    case 'track':
      return <TrackReportScreen id={entry.params.id} />;
    case 'profile':
      return <ProfileScreen />;
    case 'notifications':
      return <NotificationsScreen />;
    default:
      return <DashboardScreen />;
  }
}

export default function ResidentNavigator() {
  const [stack, setStack] = useState([{ screen: 'dashboard', params: {} }]);
  const top = stack[stack.length - 1];
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Measured rather than assumed: the tab bar's height depends on the device's
  // bottom inset, so the only reliable way to park the button just above it is
  // to read the height it actually laid out at.
  const [tabBarHeight, setTabBarHeight] = useState(0);

  const navigate = useCallback((screen, params = {}) => {
    setStack((s) => [...s, { screen, params }]);
  }, []);

  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  // Tapping a tab resets that tab's stack to its root.
  const switchTab = useCallback((screen) => {
    setStack([{ screen, params: {} }]);
  }, []);

  const value = {
    navigate,
    goBack,
    switchTab,
    current: top.screen,
    canGoBack: stack.length > 1,
  };

  const showTabs = TAB_ROOTS.includes(top.screen);
  const showFab = FAB_ROOTS.includes(top.screen);

  return (
    <NavContext.Provider value={value}>
      <View style={styles.root}>
        <View style={styles.body}>{renderScreen(top)}</View>

        {showFab && tabBarHeight > 0 && (
          <Pressable
            style={({ pressed }) => [
              styles.fab,
              { bottom: tabBarHeight + 16 },
              pressed && styles.fabPressed,
            ]}
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="File a report"
          >
            <Text style={styles.fabPlus}>+</Text>
            <Text style={styles.fabLabel}>Report</Text>
          </Pressable>
        )}

        <ReportSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onPick={(kind) => {
            setSheetOpen(false);
            navigate(kind);
          }}
        />

        {showTabs && (
          // The bottom padding has to come from the safe-area inset, not a fixed
          // number: Android draws its navigation bar over the app under Expo's
          // edge-to-edge default, so a hardcoded value left the tab labels
          // sitting underneath the system buttons. The floor keeps a little
          // breathing room on devices that report no inset at all.
          <View
            style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}
            onLayout={(e) => setTabBarHeight(e.nativeEvent.layout.height)}
          >
            {TABS.map((t) => {
              const active = t.key === top.screen;
              return (
                <Pressable key={t.key} style={styles.tab} onPress={() => switchTab(t.key)}>
                  <Icon
                    name={active ? t.iconActive : t.icon}
                    size={22}
                    color={active ? colors.primary : colors.muted}
                  />
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </NavContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    paddingTop: 6,
  },
  // minHeight keeps each tap target comfortably past the 48dp touch minimum
  // even though the icon and label together are shorter than that.
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  tabLabel: { fontSize: 11, fontWeight: '600', color: colors.muted },
  tabLabelActive: { color: colors.primary, fontWeight: '800' },

  // Extended (labelled) rather than a bare "+" circle. Filing a report is the
  // whole point of the app for a resident, and a written label removes the
  // guesswork for someone who does not read icon conventions.
  fab: {
    position: 'absolute',
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    elevation: 6,
    shadowColor: colors.forest,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
  },
  fabPressed: { opacity: 0.94, transform: [{ scale: 0.96 }] },
  fabPlus: { color: colors.white, fontSize: 22, fontWeight: '700', marginTop: -2 },
  fabLabel: { color: colors.white, fontSize: 15, fontWeight: '800' },
});
