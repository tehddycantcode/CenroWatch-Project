import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

export default function Button({ title, onPress, loading = false, disabled = false, variant = 'primary' }) {
  const isPrimary = variant === 'primary';
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.outline,
        off && { opacity: 0.6 },
        pressed && !off && { opacity: 0.88 },
      ]}
    >
      {loading && (
        <ActivityIndicator size="small" color={isPrimary ? colors.white : colors.primary} style={{ marginRight: 8 }} />
      )}
      <Text style={[styles.text, { color: isPrimary ? colors.white : colors.primary }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: radius.md,
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: colors.primary },
  outline: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  text: { fontSize: 15, fontWeight: '700' },
});
