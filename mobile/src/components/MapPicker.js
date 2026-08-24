import { View, Text, StyleSheet } from 'react-native';
import { Map, Camera, Marker } from '@maplibre/maplibre-react-native';
import { colors, radius } from '../theme';

// Tap-to-pin map for report locations. Mirrors the web MapView so both apps
// frame Cabuyao the same way: same MapTiler style, same centre, same bounds.
//
// This needs a native build (EAS), not Expo Go. Coordinates are [lng, lat] here
// - MapLibre's order - while the API and the rest of the app use {latitude,
// longitude}, so convert at this boundary and nowhere else.
const KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
const STYLE = `https://api.maptiler.com/maps/streets-v2/style.json?key=${KEY}`;

const CABUYAO = [121.1256, 14.2726]; // [lng, lat]
// Keep the map on Cabuyao City. LngLatBounds is flat [W, S, E, N] in this
// library, unlike the nested [[SW],[NE]] pairs maplibre-gl uses on web.
const CABUYAO_BOUNDS = [121.06, 14.19, 121.2, 14.33];
const MIN_ZOOM = 11;
const DEFAULT_ZOOM = 12.5;

export default function MapPicker({ value, onChange, height = 220 }) {
  const has = value?.latitude != null && value?.longitude != null;

  if (!KEY) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>
          Map unavailable. Set EXPO_PUBLIC_MAPTILER_API_KEY in mobile/.env
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={STYLE}
        logo={false}
        attribution={false}
        compass={false}
        onPress={(e) => {
          const [lng, lat] = e.lngLat;
          onChange({
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lng.toFixed(6)),
          });
        }}
      >
        <Camera
          initialViewState={{
            center: has ? [value.longitude, value.latitude] : CABUYAO,
            zoom: has ? 15 : DEFAULT_ZOOM,
          }}
          minZoom={MIN_ZOOM}
          maxBounds={CABUYAO_BOUNDS}
        />
        {has && (
          <Marker lngLat={[value.longitude, value.latitude]} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.pin}>
              <View style={styles.pinHead} />
              <View style={styles.pinTail} />
            </View>
          </Marker>
        )}
      </Map>

      {!has && (
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={styles.overlayText}>Tap the map to pin the location</Text>
          <Text style={styles.overlayTextTl}>I-tap ang mapa para itakda ang lugar</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.inputBg,
  },
  fallback: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  fallbackText: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(15,61,31,0.72)',
  },
  overlayText: { color: colors.white, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  overlayTextTl: { color: colors.heroSubtle, fontSize: 11, textAlign: 'center', marginTop: 1 },
  // Simple teardrop pin drawn in RN views so no image asset is needed.
  pin: { alignItems: 'center' },
  pinHead: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.white,
  },
  pinTail: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.primary,
  },
});
