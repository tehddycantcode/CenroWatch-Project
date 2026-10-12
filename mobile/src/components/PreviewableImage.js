import { useState } from 'react';
import { View, Text, Image, Modal, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

// A species photo you can tap to see at full size.
//
// WHY THIS EXISTS. The reference photo on the wildlife form was resizeMode
// "cover", which fills its box by CROPPING - and the catalogue photos are
// landscape wildlife shots, so what gets cropped is the animal. The photo is
// there so a resident can check they picked the right species, and a reference
// photo with the head or tail cut off is worse than none, because it still
// looks like an answer.
//
// The card keeps a fixed height so the form does not jump as you change
// species, but the image inside is letterboxed on a muted panel rather than
// cropped, and a tap opens the whole frame.
//
// Mirrors web/src/components/ui/previewable-image.jsx. No Escape handler and no
// focus management here: a React Native Modal takes the whole screen, Android's
// back button is wired through onRequestClose, and there is no Tab key.
export default function PreviewableImage({ source, label, caption, style }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={caption ? `${label}. ${caption}. Tap to see the full photo.` : `${label}. Tap to see the full photo.`}
        onPress={() => setOpen(true)}
        style={[styles.frame, style]}
      >
        <Image source={source} style={styles.image} resizeMode="contain" />
        <Text style={styles.hint}>Tap to view</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Image source={source} style={styles.full} resizeMode="contain" accessibilityLabel={label} />
          {caption ? <Text style={styles.caption}>{caption}</Text> : null}
          <Pressable accessibilityRole="button" style={styles.close} onPress={() => setOpen(false)}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: radius.sm,
    backgroundColor: colors.tint,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  hint: {
    position: 'absolute', right: 6, bottom: 6,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: radius.sm,
    fontSize: 10, fontWeight: '600', color: colors.muted,
  },
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  full: { width: '100%', height: '70%' },
  caption: { marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  close: {
    marginTop: 14, backgroundColor: colors.white,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md,
  },
  closeText: { fontSize: 14, fontWeight: '700', color: colors.text },
});
