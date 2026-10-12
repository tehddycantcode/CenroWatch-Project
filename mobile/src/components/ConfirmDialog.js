import { useCallback, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

// A confirmation step for an action that cannot be taken back.
//
// Written as a Modal rather than using Alert.alert for three reasons: it looks
// like the rest of the app (the six existing sheets all use Modal), Alert's
// button order and styling differ between platforms, and Modal is part of
// react-native core - so this ships over the air with no change to the EAS
// fingerprint, where a native dialog package would force a new build.
//
// The web twin traps Tab and restores focus. Neither is ported: Modal already
// blocks interaction with everything behind it and a phone has no Tab key.
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal transparent visible={!!open} animationType="fade" onRequestClose={() => !busy && onCancel?.()}>
      {/* Tapping the backdrop cancels, matching DatePicker. The destructive
          action still needs its own button press. */}
      <Pressable style={styles.backdrop} onPress={() => !busy && onCancel?.()}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          <View style={styles.row}>
            <Pressable style={styles.cancel} onPress={() => !busy && onCancel?.()} accessibilityRole="button">
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.confirm, destructive && styles.confirmDanger]}
              onPress={() => !busy && onConfirm?.()}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator size="small" color={colors.white} style={{ marginRight: 8 }} /> : null}
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Same contract as web/src/components/ui/confirm-dialog.jsx's useConfirm, so a
// call site reads identically on both platforms and the two can be diffed.
export function useConfirm() {
  const [state, setState] = useState({ open: false, opts: {} });
  const resolveRef = useRef(null);

  const ask = useCallback((opts) => {
    // Settle any in-flight question as a cancel before replacing it, or its
    // awaiting handler never resumes. Found in review on the web twin.
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
    setState({ open: true, opts });
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value) => {
    setState({ open: false, opts: {} });
    // Cleared before resolving: a caller that re-opens the dialog inside its
    // own continuation must not have its new resolver overwritten by this one.
    const r = resolveRef.current;
    resolveRef.current = null;
    if (r) r(value);
  }, []);

  // Memoised on purpose, as on the web twin: stable handlers across renders.
  const onConfirm = useCallback(() => settle(true), [settle]);
  const onCancel = useCallback(() => settle(false), [settle]);

  return [{ ...state.opts, open: state.open, onConfirm, onCancel }, ask];
}

const styles = StyleSheet.create({
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
    padding: 18,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.muted, marginTop: 8, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  cancel: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '700', color: colors.text },
  confirm: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDanger: { backgroundColor: colors.danger },
  confirmText: { fontSize: 14, fontWeight: '700', color: colors.white },
});
