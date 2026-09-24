import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import MapPicker, { isInCabuyao } from './MapPicker';
import Icon from './Icon';
import { colors, radius } from '../theme';
import { FORM_TL } from '../lib/tagalog';

// Optional location for a report, pinned two ways: tap the map, or let GPS fill
// it in. Stores { latitude, longitude }.
//
// The map is a native MapLibre view, so it only renders in a real build (EAS),
// not in Expo Go. MapPicker degrades to a message if the MapTiler key is missing,
// and "Use my location" keeps working either way - so a report can always be
// filed with coordinates even if the map itself cannot draw.
export default function LocationField({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Bumped only by a GPS fix. MapPicker moves its camera when this changes, so
  // a point the person taps by hand - already on screen, already where they
  // were looking - leaves the map exactly where they left it.
  const [focusToken, setFocusToken] = useState(0);

  const has = value?.latitude != null && value?.longitude != null;
  // The map is clamped to Cabuyao, so a fix from anywhere else is pinned but
  // unreachable: the camera stops at the boundary and the marker sits off the
  // edge. Say so rather than letting it look like nothing happened.
  const outside = has && !isInCabuyao(value);

  async function locate() {
    setError('');
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Location permission was denied. You can submit without it.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      onChange({
        latitude: Number(pos.coords.latitude.toFixed(6)),
        longitude: Number(pos.coords.longitude.toFixed(6)),
      });
      // After onChange, so the map has the new value to travel to.
      setFocusToken((n) => n + 1);
    } catch {
      setError('Could not get your location. You can submit without it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <MapPicker value={value} onChange={onChange} focusToken={focusToken} />

      {outside && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            Your location is outside Cabuyao. CENRO only serves Cabuyao&apos;s 18 barangays - tap
            the map to pin the correct spot.
          </Text>
          <Text style={styles.warnTextTl}>{FORM_TL.locationOutside}</Text>
        </View>
      )}

      <View style={styles.box}>
        {has ? (
          <View style={styles.coordRow}>
            <Icon name="location-outline" size={16} color={colors.primary} />
            <Text style={styles.coords}>
              {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
            </Text>
          </View>
        ) : (
          <Text style={styles.hint}>No location pinned (optional)</Text>
        )}
      </View>

      <View style={styles.row}>
        {has ? (
          <Pressable onPress={() => onChange({ latitude: null, longitude: null })} hitSlop={6}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable style={styles.action} onPress={locate} disabled={busy}>
          {busy && <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />}
          <Text style={styles.actionText}>Use my location</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  // Amber rather than colors.danger: the coordinates were still captured and the
  // report can still be filed, so this is a "check this" and not a failure. The
  // tones match the amber the web app already uses for PRIORITY and Archived.
  warn: {
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fef3c7',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  warnText: { fontSize: 12, color: '#92400e', fontWeight: '600' },
  warnTextTl: { fontSize: 11, color: '#92400e' },
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coords: { fontSize: 15, color: colors.text, fontWeight: '600' },
  hint: { fontSize: 15, color: colors.placeholder },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { fontSize: 13, fontWeight: '600', color: colors.muted },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  actionText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  error: { fontSize: 12, color: colors.danger, fontWeight: '500' },
});
