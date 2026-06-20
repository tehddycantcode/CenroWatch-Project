import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';

// Sprint 0 starter screen. Real navigation (expo-router) and the role-based
// auth flow are wired up in Sprint 1.
export default function App() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>CW</Text>
        </View>

        <Text style={styles.title}>CENROWATCH</Text>
        <Text style={styles.subtitle}>
          City Environment & Natural Resources Office
        </Text>
        <Text style={styles.city}>Cabuyao City, Laguna</Text>

        <View style={styles.divider} />

        <Text style={styles.tagline}>
          Guard Cabuyao&apos;s environment — report concerns, track wildlife,
          and request services across all 18 barangays.
        </Text>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>Sprint 0 · Mobile starter</Text>
        </View>
      </View>

      <Text style={styles.footer}>Pamantasan ng Cabuyao — BSIT Capstone</Text>
    </SafeAreaView>
  );
}

// CENROWATCH palette (from Figma)
const FOREST = '#0f3d1f';
const PRIMARY = '#22a050';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: FOREST,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoText: {
    color: PRIMARY,
    fontSize: 28,
    fontWeight: '800',
  },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subtitle: {
    color: '#d9f2e3',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  city: {
    color: '#b6e3c9',
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#ffffff66',
    marginVertical: 24,
  },
  tagline: {
    color: '#eafaf0',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  badge: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: '#ffffff55',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    color: '#cdebd9',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 20,
  },
});
