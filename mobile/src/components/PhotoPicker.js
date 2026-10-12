import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import Icon from './Icon';
import { colors, radius } from '../theme';

// Turn a picked asset into something FormData will actually accept.
//
// The old React Native shape - a plain { uri, name, type } object - is NOT
// supported by the WinterCG-compliant fetch that Expo SDK 56 ships. Appending
// one throws "Unsupported FormDataPart implementation" and the request never
// leaves the phone, which is why JSON calls worked and only uploads failed.
// expo-file-system's File implements Blob, which FormData does accept.
//
// `name` is carried separately and passed as FormData.append's third argument:
// the backend derives the stored file's extension from the multipart filename
// and falls back to ".bin" without one (see storage/local.driver.js).
function toFile(asset) {
  const mime = asset.mimeType || 'image/jpeg';
  const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const name = asset.fileName || `report-photo.${ext}`;
  return { file: new File(asset.uri), name, type: mime };
}

// Photos for a report. Pick from the library or take them with the camera;
// previews thumbnails and reports the chosen files via onChange.
//
// MULTI-FILE SINCE 2026-10-12, and the contract changed with it: onChange now
// receives an ARRAY, always - [] rather than null when nothing is chosen. Every
// call site was updated. `max` mirrors MAX_FILES in the API's upload
// middleware, which is what actually enforces it; this copy only exists so a
// resident is told before they upload, not after.
export default function PhotoPicker({ onChange, max = 5 }) {
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState('');

  async function pickFromLibrary() {
    setError('');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo library permission was denied.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      // The library is where someone picks several at once; the camera below
      // takes one per trip, which is what taking a photo is.
      allowsMultipleSelection: true,
      selectionLimit: max,
    });
    if (!result.canceled) apply(result.assets);
  }

  async function takePhoto() {
    setError('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera permission was denied.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) apply(result.assets);
  }

  // APPENDED, not replaced: the camera and the library are two separate trips
  // through this picker, and replacing would silently discard the first one.
  function apply(assets) {
    const incoming = assets.map((a) => ({ ...toFile(a), uri: a.uri }));
    const combined = [...picked, ...incoming];
    setError(combined.length > max ? `Up to ${max} photos. The extra ones were not added.` : '');
    const next = combined.slice(0, max);
    setPicked(next);
    onChange(next);
  }

  function removeAt(i) {
    setError('');
    const next = picked.filter((_, idx) => idx !== i);
    setPicked(next);
    onChange(next);
  }

  return (
    <View style={{ gap: 10 }}>
      {picked.length > 0 ? (
        <View style={styles.grid}>
          {picked.map((f, i) => (
            <View key={`${f.name}-${i}`} style={styles.previewWrap}>
              <Image source={{ uri: f.uri }} style={styles.preview} contentFit="cover" />
              <Pressable style={styles.remove} onPress={() => removeAt(i)} hitSlop={8}>
                <Text style={styles.removeText}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.row}>
        <Pressable style={styles.action} onPress={takePhoto}>
          <Icon name="camera-outline" size={18} color={colors.text} />
          <Text style={styles.actionText}>Take photo</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={pickFromLibrary}>
          <Icon name="images-outline" size={18} color={colors.text} />
          <Text style={styles.actionText}>Choose photo</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewWrap: { position: 'relative' },
  // Sized so two sit side by side on a phone; a single photo no longer fills
  // the width, which is the trade for showing up to five at once.
  preview: { width: 150, height: 120, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  remove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15,61,31,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10 },
  action: {
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.text },
  error: { fontSize: 12, color: colors.danger, fontWeight: '500' },
});
