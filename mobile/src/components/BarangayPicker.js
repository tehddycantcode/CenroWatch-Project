import { useCallback, useState } from 'react';
import { Pressable, Text, Modal, View, FlatList, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

// Stable default so a render without `items` keeps referential equality.
const EMPTY_ITEMS = [];

// Dropdown built from RN core (Modal + FlatList) — no extra picker dependency.
export default function BarangayPicker({ items = EMPTY_ITEMS, value, onChange, label = 'Barangay', hint, error }) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => String(i.barangay_id) === String(value));

  // Stable renderItem so FlatList rows don't re-render when unrelated
  // parent state (e.g. the open flag) changes.
  const renderItem = useCallback(({ item }) => {
    const active = String(item.barangay_id) === String(value);
    return (
      <Pressable
        style={[styles.option, active && styles.optionActive]}
        onPress={() => {
          onChange(String(item.barangay_id));
          setOpen(false);
        }}
      >
        <Text style={[styles.optionText, active && styles.optionTextActive]}>
          {item.name}
        </Text>
      </Pressable>
    );
  }, [value, onChange]);

  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={[styles.field, error && { borderColor: colors.danger }]} onPress={() => setOpen(true)}>
        <Text style={[styles.fieldText, !selected && { color: colors.placeholder }]}>
          {selected ? selected.name : 'Select your barangay'}
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
            <Text style={styles.sheetTitle}>Select barangay</Text>
            <FlatList
              data={items}
              keyExtractor={(i) => String(i.barangay_id)}
              style={{ maxHeight: 360 }}
              renderItem={renderItem}
              ListEmptyComponent={<Text style={styles.empty}>No barangays loaded.</Text>}
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
  option: { paddingVertical: 13, paddingHorizontal: 12, borderRadius: radius.sm },
  optionActive: { backgroundColor: colors.tint },
  optionText: { fontSize: 15, color: colors.text },
  optionTextActive: { color: colors.primary, fontWeight: '700' },
  empty: { padding: 16, color: colors.muted, textAlign: 'center' },
});
