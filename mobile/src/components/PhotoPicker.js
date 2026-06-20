import { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius } from '../theme';

// Derive a FormData-ready file descriptor { uri, name, type } from a picked asset.
function toFile(asset) {
  const uri = asset.uri;
  const mime = asset.mimeType || 'image/jpeg';
  // Prefer the asset's own name; otherwise synthesize one from the mime subtype.
  const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const name = asset.fileName || `report-photo.${ext}`;
  return { uri, name, type: mime };
}

// Optional photo for a report. Pick from the library or take one with the camera;
// previews a thumbnail and reports the chosen file (or null) via onChange.
export default function PhotoPicker({ onChange }) {
  const [preview, setPreview] = useState(null);
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
    });
    if (!result.canceled) apply(result.assets[0]);
  }

  async function takePhoto() {
    setError('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera permission was denied.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) apply(result.assets[0]);
  }

  function apply(asset) {
    setPreview(asset.uri);
    onChange(toFile(asset));
  }

  function clear() {
    setPreview(null);
    onChange(null);
  }

  return (
    <View style={{ gap: 10 }}>
      {preview ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: preview }} style={styles.preview} resizeMode="cover" />
          <Pressable style={styles.remove} onPress={clear} hitSlop={8}>
            <Text style={styles.removeText}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.row}>
        <Pressable style={styles.action} onPress={takePhoto}>
          <Text style={styles.actionText}>📷 Take photo</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={pickFromLibrary}>
          <Text style={styles.actionText}>🖼️ Choose photo</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  previewWrap: { position: 'relative' },
  preview: { width: '100%', height: 180, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
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
