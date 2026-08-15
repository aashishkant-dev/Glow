/**
 * Shares a look's cover photo to Instagram (or any other app in the OS share
 * sheet — Instagram doesn't have a public "share this exact photo" API
 * outside their own SDK, so the native share sheet is the real, working way
 * every app does this). Downloads the remote image to a local file first —
 * the OS share sheet needs a local URI to hand another app a photo.
 */
import { Alert, Platform } from 'react-native';
// See the comment in CameraCapture.tsx / api/client.ts — the bare
// 'expo-file-system' default export (SDK 54+) has no downloadAsync/
// cacheDirectory; that functional API now lives at the 'legacy' subpath.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export async function shareLookPhoto(imageUrl: string, caption: string) {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (nav?.share) {
      try {
        await nav.share({ title: caption, text: caption, url: imageUrl });
      } catch {
        // user cancelled the share sheet — not an error
      }
      return;
    }
    if (nav?.clipboard) {
      try {
        await nav.clipboard.writeText(`${caption}\n${imageUrl}`);
        Alert.alert('Link copied', "Sharing isn't available in this browser — copied the look and link so you can paste it into Instagram.");
      } catch {
        Alert.alert('Could not share', 'Sharing is not supported in this browser.');
      }
      return;
    }
    Alert.alert('Could not share', 'Sharing is not supported in this browser.');
    return;
  }

  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert('Sharing unavailable', 'Sharing is not supported on this device.');
      return;
    }
    const dir = FileSystem.cacheDirectory;
    if (!dir) { Alert.alert('Could not share', 'No cache directory available on this device.'); return; }
    const localUri = `${dir}glow-look-${Date.now()}.jpg`;
    const { uri } = await FileSystem.downloadAsync(imageUrl, localUri);
    await Sharing.shareAsync(uri, { dialogTitle: caption, mimeType: 'image/jpeg' });
  } catch (err) {
    console.error('[shareLookPhoto] failed', err);
    Alert.alert('Could not share', 'Please try again.');
  }
}
