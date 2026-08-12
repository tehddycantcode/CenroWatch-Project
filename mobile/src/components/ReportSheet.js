import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { REPORT_ACTIONS, KIND_TONES } from '../lib/reports';
import { ACTION_TL } from '../lib/tagalog';

// The chooser behind the floating Report button. There are three kinds of
// report and no way to guess which one someone wants, so the button opens this
// instead of picking one - it stays a single tap to reach the dashboard's most
// common destination without hiding the other two.
//
// Rows repeat the dashboard's wording exactly (same REPORT_ACTIONS source), so
// a resident who learned the cards recognises the sheet immediately.
export default function ReportSheet({ visible, onClose, onPick }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Tapping the dimmed area closes, which is what people try first. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.grabber} />
        <Text style={styles.title}>File a report</Text>
        <Text style={styles.titleTl}>Ano ang gusto mong i-report?</Text>

        <View style={styles.list}>
          {REPORT_ACTIONS.map((a) => {
            const tone = KIND_TONES[a.kind];
            return (
              <Pressable
                key={a.kind}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => onPick(a.kind)}
                accessibilityRole="button"
              >
                <View style={[styles.chip, { backgroundColor: tone.bg }]}>
                  <Text style={styles.chipEmoji}>{a.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{a.title}</Text>
                  {ACTION_TL[a.kind] ? (
                    <Text style={styles.rowTitleTl}>{ACTION_TL[a.kind].title}</Text>
                  ) : null}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,61,31,0.45)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, paddingHorizontal: 4 },
  titleTl: { fontSize: 13, color: colors.muted, paddingHorizontal: 4, marginTop: 2 },

  list: { marginTop: 14, gap: 8 },
  // Outer radius = inner chip radius + padding, so the corners stay concentric.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chip: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  chipEmoji: { fontSize: 20 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowTitleTl: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 1 },
  chevron: { fontSize: 24, color: colors.placeholder, fontWeight: '700' },

  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  cancelText: { fontSize: 15, fontWeight: '700', color: colors.muted },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
});
