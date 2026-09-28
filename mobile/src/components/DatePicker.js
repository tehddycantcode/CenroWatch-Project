import { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import Icon from './Icon';
import { colors, radius } from '../theme';
import {
  todayISO,
  parseISODate,
  addMonths,
  monthMatrix,
  isOutOfRange,
} from '../lib/calendar';

// A calendar for picking a date, so nobody has to type YYYY-MM-DD on a phone
// keyboard. Mirrors what <input type="date"> gives the web app for free.
//
// Written rather than installed, for one specific reason: every React Native
// date picker worth using is a NATIVE module, and adding one changes the EAS
// fingerprint - which means a full rebuild and a reinstall for everyone before
// anybody can see it. This is plain JavaScript, so it ships over the air.
//
// The date arithmetic lives in lib/calendar.js and is unit-tested; this file is
// only presentation, which is the half no test runner here can reach.

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function DatePicker({
  value,
  onChange,
  min = null,
  max = null,
  placeholder = 'Select a date',
}) {
  const [open, setOpen] = useState(false);
  const today = todayISO();

  // Which month the grid is showing. Opens on the selected date, or on today
  // when nothing is chosen yet.
  const [cursor, setCursor] = useState(() => {
    const d = parseISODate(value) || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const weeks = useMemo(() => monthMatrix(cursor.year, cursor.month), [cursor]);

  function openPicker() {
    // Re-centre on the current value each time, so reopening after a change
    // does not leave the visitor in whatever month they browsed to last.
    const d = parseISODate(value) || new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setOpen(true);
  }

  function pick(iso) {
    onChange(iso);
    setOpen(false);
  }

  return (
    <>
      <Pressable
        style={styles.field}
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={value ? `Date: ${value}. Tap to change.` : placeholder}
      >
        <Text style={value ? styles.value : styles.placeholder}>{value || placeholder}</Text>
        <Icon name="calendar-outline" size={18} color={colors.muted} />
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Tapping the backdrop closes without choosing - a calendar is not a
            decision that has to be forced, unlike the notification prompt. */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.header}>
              <Pressable
                onPress={() => setCursor((c) => addMonths(c, -1))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
              >
                <Icon name="chevron-back" size={22} color={colors.text} />
              </Pressable>
              <Text style={styles.monthLabel}>
                {MONTHS[cursor.month]} {cursor.year}
              </Text>
              <Pressable
                onPress={() => setCursor((c) => addMonths(c, 1))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Next month"
              >
                <Icon name="chevron-forward" size={22} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((d) => (
                <Text key={d} style={styles.weekday}>{d}</Text>
              ))}
            </View>

            {weeks.map((week) => (
              <View key={week[0].iso} style={styles.weekRow}>
                {week.map((cell) => {
                  const disabled = isOutOfRange(cell.iso, min, max);
                  const selected = value === cell.iso;
                  const isToday = cell.iso === today;
                  return (
                    <Pressable
                      key={cell.iso}
                      style={styles.cell}
                      disabled={disabled}
                      onPress={() => pick(cell.iso)}
                      accessibilityRole="button"
                      accessibilityLabel={cell.iso}
                      accessibilityState={{ selected, disabled }}
                    >
                      <View
                        style={[
                          styles.dayWrap,
                          isToday && !selected && styles.todayWrap,
                          selected && styles.selectedWrap,
                        ]}
                      >
                        <Text
                          style={[
                            styles.day,
                            !cell.inMonth && styles.dayOutside,
                            disabled && styles.dayDisabled,
                            selected && styles.daySelected,
                          ]}
                        >
                          {cell.day}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <View style={styles.footer}>
              <Pressable onPress={() => pick('')} hitSlop={8} accessibilityRole="button">
                <Text style={styles.action}>Clear</Text>
              </Pressable>
              <Pressable
                onPress={() => !isOutOfRange(today, min, max) && pick(today)}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={[styles.action, isOutOfRange(today, min, max) && styles.actionOff]}>
                  Today
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  value: { fontSize: 15, color: colors.text },
  placeholder: { fontSize: 15, color: colors.placeholder },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  weekRow: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    paddingVertical: 6,
  },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayWrap: { borderWidth: 1.5, borderColor: colors.primary },
  selectedWrap: { backgroundColor: colors.primary },
  day: { fontSize: 14, color: colors.text },
  dayOutside: { color: colors.placeholder },
  dayDisabled: { color: colors.border },
  daySelected: { color: colors.white, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: { fontSize: 14, fontWeight: '700', color: colors.primary },
  actionOff: { color: colors.placeholder },
});
