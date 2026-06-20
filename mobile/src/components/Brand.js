import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

// CW logo mark. `onDark` => white tile with green letters (for the green hero).
export function LogoMark({ size = 56, onDark = false }) {
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: radius.lg, backgroundColor: onDark ? colors.white : colors.primary },
      ]}
    >
      <Text style={[styles.text, { color: onDark ? colors.primary : colors.white, fontSize: size * 0.36 }]}>CW</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '800' },
});
