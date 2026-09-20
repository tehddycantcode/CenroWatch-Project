import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { useResidentNav } from '../navigation/navContext';
import { LogoMark } from './Brand';
import HeaderMenu from './HeaderMenu';

// Forest-green top bar for resident screens. Shows a back chevron when there's
// somewhere to go back to; otherwise the CW brand mark.
//
// The menu replaces what used to be an empty spacer holding the title centred.
// Every screen using this bar - My Reports, Notifications, Track and the report
// forms - previously had no way to reach notifications or sign out without
// going back to the dashboard first, because those controls live only in the
// dashboard's own header.
export default function ScreenHeader({ title }) {
  const { goBack, canGoBack } = useResidentNav();
  return (
    <View style={styles.bar}>
      {canGoBack ? (
        <Pressable onPress={goBack} hitSlop={10} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      ) : (
        <LogoMark size={30} />
      )}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <HeaderMenu />
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
  title: { flex: 1, color: colors.white, fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  spacer: { width: 28 },
});
