import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

// Tap-to-pin map for report locations. Mirrors the web MapView so both apps
// frame Cabuyao the same way: same MapTiler style, same centre, same bounds.
//
// This needs a native build (EAS), not Expo Go. Coordinates are [lng, lat] here
// - MapLibre's order - while the API and the rest of the app use {latitude,
// longitude}, so convert at this boundary and nowhere else.

// THE MAP LIBRARY IS REQUIRED LAZILY, AND THAT IS NOT A STYLE CHOICE.
// `import { Map, Camera, Marker } from '@maplibre/maplibre-react-native'` runs
// TurboModuleRegistry.getEnforcing('MLRNCameraModule') while the module is being
// evaluated, and getEnforcing THROWS when the native module is not compiled into
// the running binary. Expo Go does not ship third-party native modules, so it
// always throws there.
//
// As a static import that throw landed during bundle evaluation, before React
// rendered anything: ResidentNavigator imports every screen eagerly, so
// ComplaintFormScreen -> LocationField -> MapPicker -> maplibre was pulled in at
// startup and the WHOLE APP died on a "runtime not ready" red screen. The
// render-time guard below never got to run, so a missing map took down filing a
// report, My Reports, Profile and sign-in with it.
//
// Requiring inside a function keeps the module in the bundle (Metro still sees a
// static string) but defers evaluation to the moment a map is actually rendered,
// where a failure can be caught and degraded into a message.
let nativeMap;
function loadNativeMap() {
  if (nativeMap === undefined) {
    try {
      nativeMap = require('@maplibre/maplibre-react-native');
    } catch {
      nativeMap = null; // no native module in this runtime (Expo Go)
    }
  }
  return nativeMap;
}

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

  // Checked before the key: in Expo Go BOTH are missing, and "build the app" is
  // the useful instruction there - setting the key would change nothing.
  const lib = loadNativeMap();
  if (!lib) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>
          The map needs a development build - Expo Go cannot load it.
          {'\n'}Use &quot;Use my location&quot; below to pin the spot.
        </Text>
      </View>
    );
  }

  if (!KEY) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>
          Map unavailable. Set EXPO_PUBLIC_MAPTILER_API_KEY in mobile/.env
        </Text>
      </View>
    );
  }

  const { Map, Camera, Marker } = lib;

  return (
    <View style={[styles.wrap, { height }]}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={STYLE}
        logo={false}
        attribution={false}
        compass={false}
        onPress={(e) => {
          // The payload lives under `nativeEvent`: onPress is a native
          // BubblingEventHandler, so `e.lngLat` is undefined and destructuring it
          // throws. In a release build that JS error is FATAL - Android kills the
          // app with "has stopped" rather than showing a red box.
          const lngLat = e?.nativeEvent?.lngLat;
          if (!Array.isArray(lngLat) || lngLat.length < 2) return;
          const [lng, lat] = lngLat;
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
          <Marker lngLat={[value.longitude, value.latitude]} anchor="bottom">
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
