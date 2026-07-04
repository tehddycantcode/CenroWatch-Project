import { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';

// A minimal eye / eye-off glyph drawn with plain Views — no icon library, no emoji.
// `off` adds the diagonal strike (shown while the password is visible).
function EyeIcon({ off, color }) {
  return (
    <View style={styles.eyeWrap}>
      <View style={[styles.eye, { borderColor: color }]}>
        <View style={[styles.pupil, { backgroundColor: color }]} />
      </View>
      {off ? <View style={[styles.slash, { backgroundColor: color }]} /> : null}
    </View>
  );
}

// A password TextInput with a show/hide eye toggle. Drop-in for any secure field
// (pass the same props as TextInput; secureTextEntry is handled internally).
export default function SecureTextInput({ style, placeholderTextColor, ...props }) {
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.row}>
      <TextInput
        {...props}
        secureTextEntry={hidden}
        placeholderTextColor={placeholderTextColor ?? colors.placeholder}
        style={[style, styles.input]}
      />
      <Pressable
        onPress={() => setHidden((h) => !h)}
        hitSlop={10}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
      >
        <EyeIcon off={!hidden} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'relative', justifyContent: 'center' },
  input: { paddingRight: 48 },
  toggle: { position: 'absolute', right: 2, top: 0, bottom: 0, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  eyeWrap: { width: 24, height: 16, alignItems: 'center', justifyContent: 'center' },
  eye: { width: 22, height: 13, borderRadius: 7, borderWidth: 1.6, alignItems: 'center', justifyContent: 'center' },
  pupil: { width: 6, height: 6, borderRadius: 3 },
  slash: { position: 'absolute', width: 27, height: 1.6, borderRadius: 1, transform: [{ rotate: '45deg' }] },
});
