import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { NavContext } from './navContext';
import DashboardScreen from '../screens/resident/DashboardScreen';
import MyReportsScreen from '../screens/resident/MyReportsScreen';
import ComplaintFormScreen from '../screens/resident/ComplaintFormScreen';
import WildlifeFormScreen from '../screens/resident/WildlifeFormScreen';
import RequestFormScreen from '../screens/resident/RequestFormScreen';
import TrackReportScreen from '../screens/resident/TrackReportScreen';
import ProfileScreen from '../screens/resident/ProfileScreen';

// Dependency-light navigation for the resident area: a small screen stack with
// two tab roots (Dashboard, My Reports) and pushable detail/form screens. This
// keeps the app free of a router dependency while screens are still few; it can
// be swapped for expo-router later without touching the screens (they only use
// the navigate/goBack hook from navContext).

const TAB_ROOTS = ['dashboard', 'reports', 'profile'];

const TABS = [
  { key: 'dashboard', label: 'Home', icon: '🏠' },
  { key: 'reports', label: 'My Reports', icon: '📋' },
  { key: 'profile', label: 'Profile', icon: '👤' },
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
    default:
      return <DashboardScreen />;
  }
}

export default function ResidentNavigator() {
  const [stack, setStack] = useState([{ screen: 'dashboard', params: {} }]);
  const top = stack[stack.length - 1];

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

  return (
    <NavContext.Provider value={value}>
      <View style={styles.root}>
        <View style={styles.body}>{renderScreen(top)}</View>
        {showTabs && (
          <View style={styles.tabBar}>
            {TABS.map((t) => {
              const active = t.key === top.screen;
              return (
                <Pressable key={t.key} style={styles.tab} onPress={() => switchTab(t.key)}>
                  <Text style={[styles.tabIcon, active && { opacity: 1 }]}>{t.icon}</Text>
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
    paddingBottom: 18,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { fontSize: 20, opacity: 0.7 },
  tabLabel: { fontSize: 11, fontWeight: '600', color: colors.muted },
  tabLabelActive: { color: colors.primary, fontWeight: '800' },
});
