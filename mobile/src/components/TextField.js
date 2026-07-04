import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import SecureTextInput from './SecureTextInput';

export default function TextField({ label, error, hint, containerStyle, secureTextEntry, ...props }) {
  const inputStyle = [styles.input, error && { borderColor: colors.danger }];
  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {secureTextEntry ? (
        <SecureTextInput placeholderTextColor={colors.placeholder} style={inputStyle} {...props} />
      ) : (
        <TextInput placeholderTextColor={colors.placeholder} style={inputStyle} {...props} />
      )}
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.text },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
  },
  error: { fontSize: 12, color: colors.danger, fontWeight: '500' },
  hint: { fontSize: 12, color: colors.muted },
});
