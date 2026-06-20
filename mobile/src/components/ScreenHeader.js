import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { useResidentNav } from '../navigation/navContext';

// Forest-green top bar for resident screens. Shows a back chevron when there's
// somewhere to go back to; otherwise the CW brand mark.
export default function ScreenHeader({ title }) {
  const { goBack, canGoBack } = useResidentNav();
  return (
    <View style={styles.bar}>
      {canGoBack ? (
        <Pressable onPress={goBack} hitSlop={10} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.brandTile}>
          <Text style={styles.brandTileText}>CW</Text>
        </View>
      )}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.forest,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  back: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.white, fontSize: 32, lineHeight: 32, fontWeight: '700' },
  brandTile: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTileText: { color: colors.primary, fontWeight: '800', fontSize: 11 },
  title: { flex: 1, color: colors.white, fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  spacer: { width: 28 },
});
