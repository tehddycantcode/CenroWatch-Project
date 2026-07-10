import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../theme';
import { statusTone, statusStage, humanize } from '../lib/reports';

// Colored status pill — tone is derived from the status string (see lib/reports).
// `stage` swaps the precise status label for the resident-facing three-stage
// label (Submitted / Under review / Finished); color is the same either way.
export default function StatusBadge({ status, stage = false }) {
  if (!status) return null;
  const tone = statusTone(status);
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>
        {stage ? statusStage(status).label : humanize(status)}
      </Text>
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
