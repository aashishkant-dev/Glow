/**
 * Web build of SkinScanCamera — react-native-vision-camera (and the Nitro
 * native-module runtime it's built on) has no web implementation at all, so
 * this deliberately does NOT import it here. Confirmed against the actual
 * production web bundle: none of vision-camera's internals ship to web, so
 * useCameraDevice/useCameraPermission/usePhotoOutput would be undefined at
 * call time on the platform.native.tsx version of this file — calling them
 * (SkinScanCamera is mounted unconditionally by MySpaceScreen, gated only by
 * `visible`, so its hooks run on every render of that screen, not just while
 * the camera is actually open) crashes the screen that hosts it. Metro picks
 * this file automatically for web builds (same mechanism as
 * react-native-maps.web.js), so the native file above never even loads
 * vision-camera on this platform.
 *
 * A real getUserMedia-based web camera is future work — this is the honest,
 * non-broken interim: say plainly that scanning needs the app, instead of a
 * blank/broken screen.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../utils/colors';
import { GlowMark } from './GlowLogo';
import { SkinScan } from '../api/client';

interface Props {
  visible: boolean;
  onClose: () => void;
  onComplete: (scan: SkinScan, bookCategory: string, isNewProfile?: boolean) => void;
  previousScan?: SkinScan | null;
}

export function SkinScanCamera({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <GlowMark size={40} />
        <Text style={styles.title}>Open the Glow app to scan</Text>
        <Text style={styles.body}>
          Skin scanning uses your phone's camera in ways this browser can't do yet — install the Glow app to scan your skin and get your AI reading.
        </Text>
        <Pressable style={styles.btn} onPress={onClose}>
          <Text style={styles.btnText}>Got it</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.systemBackground, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 14 },
  title: { fontSize: 19, fontFamily: Fonts.semibold, color: Colors.label, textAlign: 'center' },
  body: { fontSize: 13.5, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 19, marginTop: -8 },
  btn: { backgroundColor: Colors.brand, borderRadius: 24, paddingHorizontal: 26, paddingVertical: 13, marginTop: 6 },
  btnText: { fontSize: 15, fontFamily: Fonts.semibold, color: '#fff' },
});
