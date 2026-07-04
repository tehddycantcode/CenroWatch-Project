import { useState } from 'react';
import { View, TextInput, Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

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
        <Text style={styles.icon}>{hidden ? '👁' : '🙈'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'relative', justifyContent: 'center' },
  input: { paddingRight: 46 },
  toggle: { position: 'absolute', right: 2, top: 0, bottom: 0, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 18 },
});
