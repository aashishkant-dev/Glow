/**
 * Exports a My Space skin-scan history to a plain JSON file and hands it to
 * the OS share sheet (save to Files, AirDrop, email, etc.) — the "real
 * memory, exportable" piece: a customer's full scan history, readable
 * outside the app, not locked in. Mirrors shareLook.ts's platform-branch
 * pattern (native: write to cache + Sharing.shareAsync; web: Blob download).
 */
import { Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SkinScan } from '../api/client';

function buildExport(profileLabel: string, scans: SkinScan[]) {
  return {
    exportedAt: new Date().toISOString(),
    app: 'Glow — My Space',
    profile: profileLabel,
    scanCount: scans.length,
    disclaimer: 'Cosmetic guidance based on photos and quiz answers — not a medical record.',
    scans: scans.map(s => ({
      date: s.createdAt,
      photoUrl: s.photoUrl,
      skinTone: s.skinTone,
      skinType: s.skinType,
      hydrationLevel: s.hydrationLevel || null,
      summary: s.summary || null,
      progressNote: s.progressNote,
      zoneNotes: s.zoneNotes,
      concerns: s.concerns,
      recommendations: s.recommendations,
      notes: s.notes || null,
    })),
  };
}

export async function exportSkinHistory(profileLabel: string, scans: SkinScan[]) {
  if (scans.length === 0) {
    Alert.alert('Nothing to export yet', 'Scan your skin at least once before exporting your history.');
    return;
  }
  const json = JSON.stringify(buildExport(profileLabel, scans), null, 2);
  const fileName = `glow-my-space-${profileLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.json`;

  if (Platform.OS === 'web') {
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[exportSkinHistory] web download failed', err);
      Alert.alert('Could not export', 'Please try again.');
    }
    return;
  }

  try {
    const available = await Sharing.isAvailableAsync();
    const dir = FileSystem.cacheDirectory;
    if (!dir) { Alert.alert('Could not export', 'No cache directory available on this device.'); return; }
    const path = `${dir}${fileName}`;
    await FileSystem.writeAsStringAsync(path, json);
    if (available) {
      await Sharing.shareAsync(path, { dialogTitle: 'Export My Space history', mimeType: 'application/json', UTI: 'public.json' });
    } else {
      Alert.alert('Saved', `Your history was saved to ${path}, but sharing isn't available on this device to send it elsewhere.`);
    }
  } catch (err) {
    console.error('[exportSkinHistory] failed', err);
    Alert.alert('Could not export', 'Please try again.');
  }
}
