import { Pressable, View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

export default function Checkbox({ checked, onChange, children }) {
  return (
    <Pressable style={styles.row} onPress={() => onChange(!checked)} hitSlop={6}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.label}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: { backgroundColor: colors.primary },
  tick: { color: colors.white, fontSize: 14, fontWeight: '900', lineHeight: 16 },
  label: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.muted },
});
