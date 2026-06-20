import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, radius } from '../theme';
import { LogoMark } from '../components/Brand';
import Button from '../components/Button';

const ROLE_LABELS = {
  Admin: 'Administrator',
  CENRO_Staff: 'CENRO Staff',
  Resident: 'Resident',
};

// Authenticated landing. Role-specific features arrive in later sprints; for now
// this confirms the session and routes by role label.
export default function HomeScreen() {
  const { user, logout } = useAuth();
  const roleLabel = ROLE_LABELS[user?.role] || 'Resident';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <LogoMark size={40} onDark />
        <Text style={styles.brand}>CENROWATCH</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.greeting}>Hello, {user?.first_name || 'there'} 👋</Text>
        <View style={styles.rolePill}>
          <Text style={styles.roleText}>{roleLabel}</Text>
        </View>

        <Text style={styles.note}>
          You&apos;re signed in. Your {roleLabel.toLowerCase()} tools — reporting, wildlife turnover,
          and tracking across all 18 barangays — arrive in the next sprint.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button title="Log out" variant="outline" onPress={logout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.forest,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  brand: { color: colors.white, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  body: { flex: 1, padding: 28, gap: 14 },
  greeting: { fontSize: 24, fontWeight: '800', color: colors.text },
  rolePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.tint,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  roleText: { color: colors.forest, fontWeight: '700', fontSize: 13 },
  note: { fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 4 },
  footer: { padding: 28 },
});
