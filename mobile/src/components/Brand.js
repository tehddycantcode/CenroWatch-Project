import { View, Image, StyleSheet } from 'react-native';
import { radius } from '../theme';

// Official CENRO Cabuyao seal in a rounded white tile. (`onDark` is accepted for
// backward compatibility but no longer needed - the white tile reads well on the
// green hero and on light backgrounds alike.)
export function LogoMark({ size = 56 }) {
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: radius.lg }]}>
      <Image
        source={require('../../assets/cenro-logo.png')}
        style={{ width: size * 0.86, height: size * 0.86 }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', overflow: 'hidden' },
});
