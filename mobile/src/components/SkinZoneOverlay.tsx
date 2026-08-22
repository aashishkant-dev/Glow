/**
 * Draws labeled markers directly on a skin-scan photo, pointing at the T-zone,
 * cheeks, and under-eye area — the thing that makes a result read like a real
 * dermatologist circling areas on your photo, instead of just a block of text
 * underneath it. Only a zone Gemini actually wrote a note for gets a marker;
 * an empty zoneNote means nothing notable was seen there, so nothing is drawn.
 *
 * There's no real face-detection bounding box from the server — the capture
 * flow's alignment oval sits at a FIXED position (SkinScanCamera's guideOval,
 * matching DEFAULT_REGION in src/routes/skin.js exactly), so every photo
 * that made it through capture has the face in the same place. These rects
 * are standard portrait-proportion estimates within that known face box, not
 * a per-photo detection — good enough to visually "point at" the right area,
 * not a precision medical measurement.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts } from '../utils/colors';

// Mirrors DEFAULT_REGION in src/routes/skin.js — the face box within the
// full photo, as 0–1 fractions.
const FACE_BOX = { x: 0.22, y: 0.16, width: 0.56, height: 0.6 };

// Sub-rects as 0–1 fractions OF the face box (not the full photo) — standard
// portrait proportions for where these areas sit on a centered, front-facing
// selfie.
const ZONE_RECTS = {
  tZone:   { x: 0.30, y: 0.03, width: 0.40, height: 0.58 },
  cheekL:  { x: 0.04, y: 0.42, width: 0.30, height: 0.30 },
  cheekR:  { x: 0.66, y: 0.42, width: 0.30, height: 0.30 },
  underEye:{ x: 0.20, y: 0.30, width: 0.60, height: 0.11 },
};

function toPhotoFrac(r: { x: number; y: number; width: number; height: number }) {
  return {
    left: FACE_BOX.x + r.x * FACE_BOX.width,
    top: FACE_BOX.y + r.y * FACE_BOX.height,
    width: r.width * FACE_BOX.width,
    height: r.height * FACE_BOX.height,
  };
}

interface Marker {
  key: string;
  label: string;
  note: string;
  rect: { left: number; top: number; width: number; height: number };
  // Label callout anchors left or right of center so two side-by-side
  // markers (the cheeks) don't collide with each other.
  align: 'left' | 'right' | 'center';
}

interface Props {
  zoneNotes: { tZone?: string; cheeks?: string; underEye?: string };
}

export function SkinZoneOverlay({ zoneNotes }: Props) {
  const [active, setActive] = useState<string | null>(null);

  const markers: Marker[] = [];
  if (zoneNotes?.tZone) {
    markers.push({ key: 'tZone', label: 'T-zone', note: zoneNotes.tZone, rect: toPhotoFrac(ZONE_RECTS.tZone), align: 'center' });
  }
  if (zoneNotes?.cheeks) {
    markers.push({ key: 'cheekL', label: 'Cheeks', note: zoneNotes.cheeks, rect: toPhotoFrac(ZONE_RECTS.cheekL), align: 'left' });
    markers.push({ key: 'cheekR', label: 'Cheeks', note: zoneNotes.cheeks, rect: toPhotoFrac(ZONE_RECTS.cheekR), align: 'right' });
  }
  if (zoneNotes?.underEye) {
    markers.push({ key: 'underEye', label: 'Under-eye', note: zoneNotes.underEye, rect: toPhotoFrac(ZONE_RECTS.underEye), align: 'center' });
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
              style={[
                styles.box,
                {
                  left: `${m.rect.left * 100}%`,
                  top: `${m.rect.top * 100}%`,
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
                  { top: `${(m.rect.top + m.rect.height) * 100}%` },
                  m.align === 'left' && { left: `${m.rect.left * 100}%` },
                  m.align === 'right' && { right: `${(1 - m.rect.left - m.rect.width) * 100}%` },
                  m.align === 'center' && { left: `${(m.rect.left + m.rect.width / 2) * 100}%`, transform: [{ translateX: -80 }] },
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
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 14,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: 4,
  },
  boxActive: { borderColor: '#fff', borderWidth: 2 },
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
