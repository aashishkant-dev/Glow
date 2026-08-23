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
import { resolveFaceBox, zoneRectToPhotoFrac, legacyZoneRectToPhotoFrac, ZONE_META } from '../utils/skinZones';
import { ScanBracket } from './ScanBracket';

interface Marker {
  key: string;
  label: string;
  note: string;
  rect: { x: number; y: number; width: number; height: number };
  // Label callout anchors left or right of center so two side-by-side
  // markers don't collide with each other.
  align: 'left' | 'right' | 'center';
}

interface Props {
  zoneNotes: {
    forehead?: string; nose?: string; chin?: string;
    cheekL?: string; cheekR?: string;
    underEyeL?: string; underEyeR?: string;
    jawline?: string;
    // Legacy shape — scans saved before the granular 8-zone breakdown only
    // ever have these three.
    tZone?: string; cheeks?: string; underEye?: string;
  };
  faceBox?: { x?: number; y?: number; width?: number; height?: number };
}

export function SkinZoneOverlay({ zoneNotes, faceBox: rawFaceBox }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const faceBox = resolveFaceBox(rawFaceBox);

  // A scan's zoneNotes is entirely one shape or the other (set once, server
  // -side, at scan time) — never a mix — so checking for any one granular
  // key is enough to tell which this is.
  const isGranular = ZONE_META.some(z => !!zoneNotes?.[z.key]);

  const markers: Marker[] = [];
  if (isGranular) {
    for (const z of ZONE_META) {
      const note = zoneNotes?.[z.key];
      if (note) markers.push({ key: z.key, label: z.label, note, rect: zoneRectToPhotoFrac(z.key, faceBox), align: z.align });
    }
  } else {
    if (zoneNotes?.tZone) {
      markers.push({ key: 'tZone', label: 'T-zone', note: zoneNotes.tZone, rect: legacyZoneRectToPhotoFrac('tZone', faceBox), align: 'center' });
    }
    if (zoneNotes?.cheeks) {
      markers.push({ key: 'cheekL', label: 'Cheeks', note: zoneNotes.cheeks, rect: legacyZoneRectToPhotoFrac('cheekL', faceBox), align: 'left' });
      markers.push({ key: 'cheekR', label: 'Cheeks', note: zoneNotes.cheeks, rect: legacyZoneRectToPhotoFrac('cheekR', faceBox), align: 'right' });
    }
    if (zoneNotes?.underEye) {
      markers.push({ key: 'underEye', label: 'Under-eye', note: zoneNotes.underEye, rect: legacyZoneRectToPhotoFrac('underEye', faceBox), align: 'center' });
    }
  }

  if (markers.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {markers.map(m => {
        const isActive = active === m.key;
        const posStyle = {
          left: `${m.rect.x * 100}%`,
          top: `${m.rect.y * 100}%`,
          width: `${m.rect.width * 100}%`,
          height: `${m.rect.height * 100}%`,
        } as const;
        return (
          <React.Fragment key={m.key}>
            <ScanBracket
              style={posStyle}
              color={isActive ? Colors.brand : 'rgba(255,255,255,0.75)'}
              size={isActive ? 18 : 14}
              thickness={isActive ? 2.5 : 1.5}
            >
              <View pointerEvents="none" style={[styles.dot, isActive && styles.dotActive]} />
            </ScanBracket>
            <Pressable
              onPress={() => setActive(isActive ? null : m.key)}
              // A real tap target across the whole zone, not just the small
              // dot — hitSlop pads it further so a marker over a narrow zone
              // (under-eye) isn't fiddly to hit.
              hitSlop={12}
              style={[styles.tapTarget, posStyle]}
            />
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
  tapTarget: { position: 'absolute' },
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
