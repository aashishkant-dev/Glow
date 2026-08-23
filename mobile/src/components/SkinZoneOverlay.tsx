/**
 * Draws labeled markers directly on a skin-scan photo, pointing at the T-zone,
 * cheeks, and under-eye area — the thing that makes a result read like a real
 * dermatologist circling areas on your photo, instead of just a block of text
 * underneath it. Only a zone Gemini actually wrote a note for gets a marker;
 * an empty zoneNote means nothing notable was seen there, so nothing is drawn.
 *
 * The face box itself comes from `scan.faceBox` — real on-device ML Kit face
 * detection when the capture ran on a native build (see SkinScanCamera.tsx),
 * or the fixed guide-oval fallback (mirrors DEFAULT_REGION in
 * src/routes/skin.js) on web/older scans where no detection ran. Either way,
 * the sub-rects below are standard portrait-proportion estimates WITHIN that
 * box, not per-feature detection — good enough to visually "point at" the
 * right area, not a precision medical measurement.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts } from '../utils/colors';
import { resolveFaceBox, zoneRectToPhotoFrac } from '../utils/skinZones';

interface Marker {
  key: string;
  label: string;
  note: string;
  rect: { x: number; y: number; width: number; height: number };
  // Label callout anchors left or right of center so two side-by-side
  // markers (the cheeks) don't collide with each other.
  align: 'left' | 'right' | 'center';
}

interface Props {
  zoneNotes: { tZone?: string; cheeks?: string; underEye?: string };
  faceBox?: { x?: number; y?: number; width?: number; height?: number };
}

export function SkinZoneOverlay({ zoneNotes, faceBox: rawFaceBox }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const faceBox = resolveFaceBox(rawFaceBox);

  const markers: Marker[] = [];
  if (zoneNotes?.tZone) {
    markers.push({ key: 'tZone', label: 'T-zone', note: zoneNotes.tZone, rect: zoneRectToPhotoFrac('tZone', faceBox), align: 'center' });
  }
  if (zoneNotes?.cheeks) {
    markers.push({ key: 'cheekL', label: 'Cheeks', note: zoneNotes.cheeks, rect: zoneRectToPhotoFrac('cheekL', faceBox), align: 'left' });
    markers.push({ key: 'cheekR', label: 'Cheeks', note: zoneNotes.cheeks, rect: zoneRectToPhotoFrac('cheekR', faceBox), align: 'right' });
  }
  if (zoneNotes?.underEye) {
    markers.push({ key: 'underEye', label: 'Under-eye', note: zoneNotes.underEye, rect: zoneRectToPhotoFrac('underEye', faceBox), align: 'center' });
  }

  if (markers.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {markers.map(m => {
        const isActive = active === m.key;
        return (
          <React.Fragment key={m.key}>
            <Pressable
              onPress={() => setActive(isActive ? null : m.key)}
              // The box itself is already a real tap target, not just the
              // small dot — hitSlop pads it further so a marker over a
              // narrow zone (under-eye) isn't fiddly to hit.
              hitSlop={12}
              style={[
                styles.box,
                {
                  left: `${m.rect.x * 100}%`,
                  top: `${m.rect.y * 100}%`,
                  width: `${m.rect.width * 100}%`,
                  height: `${m.rect.height * 100}%`,
                },
                isActive && styles.boxActive,
              ]}
            >
              <View style={[styles.dot, isActive && styles.dotActive]} />
            </Pressable>
            {isActive && (
              <View
                style={[
                  styles.callout,
                  { top: `${(m.rect.y + m.rect.height) * 100}%` },
                  m.align === 'left' && { left: `${m.rect.x * 100}%` },
                  m.align === 'right' && { right: `${(1 - m.rect.x - m.rect.width) * 100}%` },
                  m.align === 'center' && { left: `${(m.rect.x + m.rect.width / 2) * 100}%`, transform: [{ translateX: -80 }] },
                ]}
                pointerEvents="none"
              >
                <Text style={styles.calloutLabel}>{m.label.toUpperCase()}</Text>
                <Text style={styles.calloutNote}>{m.note}</Text>
              </View>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: 4,
  },
  boxActive: { borderColor: Colors.brand, borderWidth: 2, backgroundColor: 'rgba(217,122,145,0.14)' },
  dot: {
    width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)',
  },
  dotActive: { backgroundColor: Colors.brand, borderColor: '#fff' },
  callout: {
    position: 'absolute',
    width: 160,
    backgroundColor: 'rgba(20,14,16,0.92)',
    borderRadius: 14,
    padding: 10,
    marginTop: 6,
  },
  calloutLabel: { color: Colors.brandAccent, fontSize: 9.5, fontFamily: Fonts.bold, letterSpacing: 0.8, marginBottom: 3 },
  calloutNote: { color: '#fff', fontSize: 12, fontFamily: Fonts.medium, lineHeight: 16 },
});
