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
 *
 * `active`/`onSelect` are controlled by the parent (SkinScanResultScreen), not
 * owned here — the zone list underneath the photo can highlight/select the
 * same marker this draws, so tapping either the photo or the matching list
 * row lights up both, instead of the photo and the list being two
 * disconnected views of the same data.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts } from '../utils/colors';
import { resolveFaceBox, buildZoneMarkers, ZoneNotes } from '../utils/skinZones';
import { ScanBracket } from './ScanBracket';
import { tapLight } from '../utils/haptics';

interface Props {
  zoneNotes: ZoneNotes;
  faceBox?: { x?: number; y?: number; width?: number; height?: number };
  active: string | null;
  onSelect: (key: string | null) => void;
}

function Callout({ label, note, flipAbove, align, rect }: { label: string; note: string; flipAbove: boolean; align: 'left' | 'right' | 'center'; rect: { x: number; y: number; width: number; height: number } }) {
  // Scales and fades in instead of a hard cut — a marker's detail popping in
  // with a little motion reads as "this just responded to your tap," not
  // "the layout jumped."
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 6 }).start();
  }, [label, note]);

  return (
    <Animated.View
      style={[
        styles.callout,
        flipAbove
          ? { bottom: `${(1 - rect.y) * 100}%`, marginTop: 0, marginBottom: 6 }
          : { top: `${(rect.y + rect.height) * 100}%` },
        align === 'left' && { left: `${rect.x * 100}%` },
        align === 'right' && { right: `${(1 - rect.x - rect.width) * 100}%` },
        align === 'center' && { left: `${(rect.x + rect.width / 2) * 100}%`, transform: [{ translateX: -80 }, { scale: anim }] },
        align !== 'center' && { transform: [{ scale: anim }] },
        { opacity: anim },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.calloutLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.calloutNote}>{note}</Text>
    </Animated.View>
  );
}

export function SkinZoneOverlay({ zoneNotes, faceBox: rawFaceBox, active, onSelect }: Props) {
  const faceBox = resolveFaceBox(rawFaceBox);
  const markers = buildZoneMarkers(zoneNotes, faceBox);

  if (markers.length === 0) return null;

  function select(key: string) {
    tapLight();
    onSelect(active === key ? null : key);
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Tapping anywhere on the photo that ISN'T a marker closes whatever's
          open — previously the only way to dismiss a callout was tapping
          the exact same marker again, which isn't discoverable. Sits behind
          the markers (rendered first), so their own Pressables still win a
          tap that lands on them. */}
      {active != null && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelect(null)} />
      )}
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
              pulse={isActive}
            >
              <View pointerEvents="none" style={[styles.dot, isActive && styles.dotActive]} />
            </ScanBracket>
            <Pressable
              onPress={() => select(m.key)}
              // A real tap target across the whole zone, not just the small
              // dot — hitSlop pads it further so a marker over a narrow zone
              // (under-eye) isn't fiddly to hit.
              hitSlop={12}
              style={[styles.tapTarget, posStyle]}
            />
            {isActive && (
              <Callout
                label={m.label}
                note={m.note}
                // Callouts default to below the marker, but a zone low on
                // the face (chin, jawline) can sit close enough to the
                // photo's bottom edge that "below" pushes the box past it
                // entirely — the wrapper has no overflow:hidden, so that
                // meant the callout visually spilling onto the text content
                // below the photo instead of staying on it. Flip above
                // instead whenever there's not enough room below.
                flipAbove={m.rect.y + m.rect.height > 0.72}
                align={m.align}
                rect={m.rect}
              />
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
