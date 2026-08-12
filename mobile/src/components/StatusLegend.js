import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { STAGE_TL, COPY_TL } from '../lib/tagalog';

// Legend for the report lists: the three lifecycle stages (adviser model, see
// statusStage in lib/reports). Rejected/Deceased badges stay red and carry
// their own label, so they need no legend entry.
//
// This is where the English/Tagalog pairing is taught. The badges themselves
// stay English so a list row can't blow out on a narrow phone - a resident
// reads the pairing here once and carries it to every badge.
//
// Renders its own bottom border, so drop it in as the first child of a list
// card and the separator above the first row comes for free.
const LEGEND = [
  { color: '#fbbf24', label: 'Submitted' },
  { color: '#3b82f6', label: 'Under review' },
  { color: '#22c55e', label: 'Finished' },
];

export default function StatusLegend() {
  return (
    <View style={styles.legend}>
      <Text style={styles.intro}>{COPY_TL.legendIntro}</Text>
      <View style={styles.row}>
        {LEGEND.map((item) => (
          <View key={item.label} style={styles.item}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={styles.text}>
              {item.label}
              <Text style={styles.textTl}> / {STAGE_TL[item.label]}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  intro: { fontSize: 11, fontWeight: '600', color: colors.text, marginBottom: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 11, color: colors.muted },
  textTl: { fontSize: 11, color: colors.muted, opacity: 0.75 },
});
