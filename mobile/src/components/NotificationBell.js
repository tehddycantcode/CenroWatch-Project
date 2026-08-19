import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import { useResidentNav } from '../navigation/navContext';
import useNotifications from '../lib/useNotifications';

// Bell + unread badge for the resident dashboard header. Tapping it opens the
// full notifications screen (a phone has no room for the web's dropdown panel).
// The badge is the only thing rendered here; the list lives on the screen.
export default function NotificationBell() {
  const { navigate } = useResidentNav();
  const { unread } = useNotifications();

  return (
    <Pressable
      onPress={() => navigate('notifications')}
      hitSlop={10}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
      }
    >
      <Text style={styles.bell}>🔔</Text>
      {unread > 0 && (
        <View style={styles.badge}>
          {/* Capped so a long-dormant account cannot widen the badge past the
              bell and shove the sign-out link off the header. */}
          <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Sized past the 44dp touch minimum on its own; hitSlop is belt and braces
  // because it sits next to the sign-out link.
  wrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  bell: { fontSize: 21 },
  badge: {
    position: 'absolute',
    top: -1,
    right: -3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    // The header is forest green, so the badge needs its own ring to stay a
    // distinct shape rather than bleeding into the bar behind it.
    borderWidth: 1.5,
    borderColor: colors.forest,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
