import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { colors, radius } from '../theme';

// Optional GPS location for a report. A full interactive map needs a native
// MapLibre build (not available in Expo Go), so on mobile we capture the device's
// current coordinates instead. Stores { latitude, longitude }.
export default function LocationField({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const has = value?.latitude != null && value?.longitude != null;

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
    } catch {
      setError('Could not get your location. You can submit without it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.box}>
        {has ? (
          <Text style={styles.coords}>
            📍 {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
          </Text>
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
