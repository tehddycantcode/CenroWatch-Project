import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

export default function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#fdecec',
    borderWidth: 1,
    borderColor: '#f5c2c2',
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  text: { color: colors.danger, fontSize: 13 },
});
