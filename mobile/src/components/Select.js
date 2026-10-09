import { useCallback, useState } from 'react';
import { Pressable, Text, Modal, View, FlatList, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

// Stable default so a render without `options` keeps referential equality.
const EMPTY_OPTIONS = [];

// Generic single-select dropdown (Modal + FlatList) over a list of { value, label }.
// Mirrors BarangayPicker's look so every field on a form feels the same.
export default function Select({ label, hint, options = EMPTY_OPTIONS, value, onChange, placeholder = 'Select…', error }) {
  const [open, setOpen] = useState(false);
  // `header` entries have no value, so they must not be able to match - a
  // header whose label equalled the value would otherwise show as selected.
  const selected = options.find((o) => !o.header && String(o.value) === String(value));

  // Stable renderItem so FlatList rows don't re-render when unrelated
  // parent state (e.g. the open flag) changes.
  //
  // Section headings, so one list can show "Common species" and "Endangered or
  // protected species" as separate groups - web gets this free from <optgroup>.
  // A header entry is { header: true, label }: not pressable, no value, and
  // skipped by the selected-option lookup above.
  const renderItem = useCallback(({ item }) => {
    if (item.header) {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.label}</Text>
        </View>
      );
    }
    const active = String(item.value) === String(value);
    return (
      <Pressable
        accessibilityRole="button"
        style={[styles.option, active && styles.optionActive]}
        onPress={() => {
          onChange(item.value);
          setOpen(false);
        }}
      >
        <Text style={[styles.optionText, active && styles.optionTextActive]}>
          {item.label}
        </Text>
      </Pressable>
    );
  }, [value, onChange]);

  return (
    <View style={{ gap: 7 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={[styles.field, error && { borderColor: colors.danger }]} onPress={() => setOpen(true)}>
        <Text style={[styles.fieldText, !selected && { color: colors.placeholder }]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      {/* Error wins over hint, matching Field in ReportFormShell. */}
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label || 'Select an option'}</Text>
            <FlatList
              data={options}
              keyExtractor={(o, i) => (o.header ? `h-${i}` : String(o.value))}
              style={{ maxHeight: 360 }}
              renderItem={renderItem}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.text },
  field: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldText: { fontSize: 15, color: colors.text },
  chevron: { fontSize: 14, color: colors.muted },
  error: { fontSize: 12, color: colors.danger, fontWeight: '500' },
  hint: { fontSize: 12, color: colors.muted },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,61,31,0.45)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, paddingBottom: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
  sectionHeader: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  sectionHeaderText: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, color: colors.placeholder,
  },
  option: { paddingVertical: 13, paddingHorizontal: 12, borderRadius: radius.sm },
  optionActive: { backgroundColor: colors.tint },
  optionText: { fontSize: 15, color: colors.text },
  optionTextActive: { color: colors.primary, fontWeight: '700' },
});
