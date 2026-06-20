import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../theme';
import { statusTone, humanize } from '../lib/reports';

// Colored status pill — tone is derived from the status string (see lib/reports).
export default function StatusBadge({ status }) {
  if (!status) return null;
  const tone = statusTone(status);
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{humanize(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: { fontSize: 11, fontWeight: '700' },
});
