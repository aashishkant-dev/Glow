/**
 * Draws labeled markers directly on a skin-scan photo, pointing at the T-zone,
 * cheeks, and under-eye area — the thing that makes a result read like a real
 * dermatologist circling areas on your photo, instead of just a block of text
 * underneath it. Only a zone Gemini actually wrote a note for gets a marker;
 * an empty zoneNote means nothing notable was seen there, so nothing is drawn.
 *
 * A marker's position comes from `scan.zoneMarkers` when present — real ML
 * Kit landmark/contour geometry for THIS photo (see deriveZoneMarkers in
 * skinZones.ts and SkinScanCamera.tsx's detectFaceRegion) — falling back
 * per-zone to a standard portrait-proportion estimate within `scan.faceBox`
 * for any zone that didn't have usable geometry, or for a scan captured
 * before this existed.
 *
 * `active`/`onSelect` are controlled by the parent (SkinScanResultScreen), not
 * owned here — the zone list underneath the photo can highlight/select the
 * same marker this draws, so tapping either the photo or the matching list
 * row lights up both, instead of the photo and the list being two
 * disconnected views of the same data.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts } from '../utils/colors';
import { resolveFaceBox, buildZoneMarkers, ZoneNotes, ZoneMarker, StoredZoneMarkers } from '../utils/skinZones';
import { ScanBracket } from './ScanBracket';
import { tapLight } from '../utils/haptics';

interface Props {
  zoneNotes: ZoneNotes;
  faceBox?: { x?: number; y?: number; width?: number; height?: number };
  zoneMarkers?: StoredZoneMarkers | null;
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

// One marker's own reveal-in-on-mount + dim-when-something-else-is-active
// animation, split from the parent so each marker gets its own Animated
// values (a shared value would make every marker jump together instead of
// independently fading toward/away from focus).
function Marker({ m, index, active, onSelect }: { m: ZoneMarker; index: number; active: string | null; onSelect: (key: string) => void }) {
  const isActive = active === m.key;
  // Staggered pop-in (~80ms apart) instead of all 8 markers landing at once
  // — reads as the AI actually finding each zone in turn, not a static
  // overlay dumped on the photo the instant it loads.
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(reveal, { toValue: 1, duration: 280, delay: index * 80, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // Mount-once — restarting this on every re-render (e.g. a selection
    // change) would replay the pop-in for markers that aren't even moving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A selected marker stays fully visible; every OTHER marker dims to ~30%
  // instead of all 8 reading as equally important regardless of which one
  // (if any) is actually being looked at.
  const dim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(dim, { toValue: active == null || isActive ? 1 : 0.3, duration: 200, useNativeDriver: true }).start();
  }, [active, isActive, dim]);

  const posStyle = {
    left: `${m.rect.x * 100}%`,
    top: `${m.rect.y * 100}%`,
    width: `${m.rect.width * 100}%`,
    height: `${m.rect.height * 100}%`,
  } as const;
  const scale = reveal.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.tapTarget, posStyle, { opacity: Animated.multiply(reveal, dim), transform: [{ scale }] }]}>
        <ScanBracket
          style={StyleSheet.absoluteFill}
          color={isActive ? Colors.brand : 'rgba(255,255,255,0.75)'}
          size={isActive ? 18 : 14}
          thickness={isActive ? 2.5 : 1.5}
          pulse={isActive}
        >
          <View pointerEvents="none" style={[styles.dot, isActive && styles.dotActive]} />
        </ScanBracket>
      </Animated.View>
      <Pressable
        onPress={() => onSelect(m.key)}
        // A real tap target across the whole zone, not just the small dot —
        // hitSlop pads it further so a marker over a narrow zone (under-eye)
        // isn't fiddly to hit.
        hitSlop={12}
        style={[styles.tapTarget, posStyle]}
      />
      {isActive && (
        <Callout
          label={m.label}
          note={m.note}
          // Callouts default to below the marker, but a zone low on the
          // face (chin, jawline) can sit close enough to the photo's bottom
          // edge that "below" pushes the box past it entirely — the
          // wrapper has no overflow:hidden, so that meant the callout
          // visually spilling onto the text content below the photo
          // instead of staying on it. Flip above instead whenever there's
          // not enough room below.
          flipAbove={m.rect.y + m.rect.height > 0.72}
          align={m.align}
          rect={m.rect}
        />
      )}
    </>
  );
}

export function SkinZoneOverlay({ zoneNotes, faceBox: rawFaceBox, zoneMarkers, active, onSelect }: Props) {
  const faceBox = resolveFaceBox(rawFaceBox);
  const markers = buildZoneMarkers(zoneNotes, faceBox, zoneMarkers);

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
      {markers.map((m, i) => (
        <Marker key={m.key} m={m} index={i} active={active} onSelect={select} />
      ))}
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
