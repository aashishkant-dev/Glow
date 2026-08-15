/**
 * Full-screen crop tool — drag to reposition, pinch (native) or +/- (any
 * platform) to zoom, inside a fixed-aspect frame. No gesture-handler/
 * reanimated in this app, so panning/zooming runs on plain PanResponder +
 * React state rather than a worklet-driven gesture — less silky at 120fps,
 * but correct and dependency-free.
 *
 * The frame is always fully covered by the image (cover-fit baseline, then
 * zoom only increases from there) so there's never an empty gap at the
 * edges — "crop" here means choosing what to keep, not shrinking below fill.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image as RNImage,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import { Colors, Fonts } from '../utils/colors';

export interface CropResult { uri: string; base64: string; width: number; height: number; mimeType: string; }

interface Props {
  visible: boolean;
  uri: string | null;
  /** width / height of the crop frame. Defaults to 4:5, matching Look/Post thumbnails. */
  aspect?: number;
  onCancel: () => void;
  onDone: (result: CropResult) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const FRAME_MARGIN = 28;

export function ImageCropper({ visible, uri, aspect = 4 / 5, onCancel, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);

  // Handlers live inside a PanResponder created once (useRef) — everything
  // they read comes from refs, not render-scope state, so they never see a
  // stale closure no matter how many renders happen between touch events.
  const imgSizeRef = useRef(imgSize);
  const frameRef = useRef(frame);
  const zoomRef = useRef(zoom);
  const offsetRef = useRef(offset);
  useEffect(() => { imgSizeRef.current = imgSize; }, [imgSize]);
  useEffect(() => { frameRef.current = frame; }, [frame]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef(1);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!visible || !uri) return;
    setImgSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    RNImage.getSize(
      uri,
      (width, height) => setImgSize({ width, height }),
      () => setImgSize({ width: 1, height: 1 }),
    );
  }, [visible, uri]);

  function coverScaleFor(f: { width: number; height: number }, s: { width: number; height: number }) {
    return Math.max(f.width / s.width, f.height / s.height);
  }

  function clamp(o: { x: number; y: number }, dispW: number, dispH: number, f: { width: number; height: number }) {
    const maxX = Math.max(0, (dispW - f.width) / 2);
    const maxY = Math.max(0, (dispH - f.height) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) };
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          pinchStartDist.current = Math.sqrt(dx * dx + dy * dy);
          pinchStartZoom.current = zoomRef.current;
        } else {
          dragStart.current = { x: offsetRef.current.x, y: offsetRef.current.y };
        }
      },
      onPanResponderMove: (evt, gesture) => {
        const s = imgSizeRef.current, f = frameRef.current;
        if (!s || !f) return;
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2 && pinchStartDist.current) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStartZoom.current * (dist / pinchStartDist.current)));
          setZoom(nextZoom);
          const scale = coverScaleFor(f, s) * nextZoom;
          setOffset(o => clamp(o, s.width * scale, s.height * scale, f));
        } else if (touches.length === 1) {
          const scale = coverScaleFor(f, s) * zoomRef.current;
          const next = { x: dragStart.current.x + gesture.dx, y: dragStart.current.y + gesture.dy };
          setOffset(clamp(next, s.width * scale, s.height * scale, f));
        }
      },
      onPanResponderRelease: () => { pinchStartDist.current = null; },
      onPanResponderTerminate: () => { pinchStartDist.current = null; },
    })
  ).current;

  function bumpZoom(delta: number) {
    const s = imgSizeRef.current, f = frameRef.current;
    if (!s || !f) return;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current + delta));
    setZoom(nextZoom);
    const scale = coverScaleFor(f, s) * nextZoom;
    setOffset(o => clamp(o, s.width * scale, s.height * scale, f));
  }

  async function confirmCrop() {
    const s = imgSize, f = frame;
    if (!s || !f || !uri) return;
    setProcessing(true);
    try {
      const scale = coverScaleFor(f, s) * zoom;
      const dispW = s.width * scale, dispH = s.height * scale;
      const imageOriginXInFrame = f.width / 2 + offset.x - dispW / 2;
      const imageOriginYInFrame = f.height / 2 + offset.y - dispH / 2;
      const originX = Math.min(Math.max(-imageOriginXInFrame / scale, 0), Math.max(0, s.width - f.width / scale));
      const originY = Math.min(Math.max(-imageOriginYInFrame / scale, 0), Math.max(0, s.height - f.height / scale));
      const cropWidth = Math.min(f.width / scale, s.width);
      const cropHeight = Math.min(f.height / scale, s.height);

      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ crop: { originX: Math.round(originX), originY: Math.round(originY), width: Math.round(cropWidth), height: Math.round(cropHeight) } }],
        { base64: true, compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      if (!result.base64) throw new Error('Crop failed');
      onDone({ uri: result.uri, base64: result.base64, width: result.width, height: result.height, mimeType: 'image/jpeg' });
    } catch {
      // Cropping is an optional refinement — if it fails for any reason,
      // just back out silently rather than blocking the artist from posting
      // the original, uncropped shot.
      onCancel();
    }
    setProcessing(false);
  }

  const dispSize = (() => {
    if (!imgSize || !frame) return { width: 0, height: 0, left: 0, top: 0 };
    const scale = coverScaleFor(frame, imgSize) * zoom;
    const width = imgSize.width * scale, height = imgSize.height * scale;
    return { width, height, left: (frame.width - width) / 2 + offset.x, top: (frame.height - height) / 2 + offset.y };
  })();

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.root}>
        <View style={[styles.topBar, { top: insets.top + 10 }]}>
          <Pressable style={styles.roundBtn} onPress={onCancel} hitSlop={10}>
            <Text style={styles.roundBtnText}>✕</Text>
          </Pressable>
          <Text style={styles.title}>Crop cover</Text>
          <Pressable style={[styles.roundBtn, styles.confirmBtn]} onPress={confirmCrop} disabled={processing || !imgSize} hitSlop={10}>
            {processing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmBtnText}>Done</Text>}
          </Pressable>
        </View>

        <View
          style={styles.frameWrap}
          onLayout={e => {
            const w = e.nativeEvent.layout.width - FRAME_MARGIN * 2;
            setFrame({ width: w, height: w / aspect });
          }}
        >
          {frame && (
            <View style={[styles.frame, { width: frame.width, height: frame.height }]} {...panResponder.panHandlers}>
              {!imgSize ? (
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : (
                <RNImage
                  source={{ uri: uri! }}
                  style={{ position: 'absolute', width: dispSize.width, height: dispSize.height, left: dispSize.left, top: dispSize.top }}
                  resizeMode="cover"
                />
              )}
              <View pointerEvents="none" style={styles.frameRing} />
            </View>
          )}
        </View>

        <View style={[styles.zoomRow, { paddingBottom: insets.bottom + 24 }]}>
          <Pressable style={styles.zoomBtn} onPress={() => bumpZoom(-0.25)} hitSlop={10}>
            <Text style={styles.zoomBtnText}>−</Text>
          </Pressable>
          <Text style={styles.hint}>Drag to reposition · pinch or use −/+ to zoom</Text>
          <Pressable style={styles.zoomBtn} onPress={() => bumpZoom(0.25)} hitSlop={10}>
            <Text style={styles.zoomBtnText}>＋</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute', left: 16, right: 16, zIndex: 2,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  roundBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center',
  },
  roundBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.semibold },
  title: { color: '#fff', fontSize: 15, fontFamily: Fonts.semibold },
  confirmBtn: { width: 'auto', paddingHorizontal: 18, backgroundColor: Colors.brand },
  confirmBtnText: { color: '#fff', fontSize: 14, fontFamily: Fonts.semibold },
  frameWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: FRAME_MARGIN },
  frame: { overflow: 'hidden', backgroundColor: '#111', borderRadius: 18, alignSelf: 'center' },
  frameRing: { ...StyleSheet.absoluteFill, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  zoomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14,
    paddingHorizontal: 24, paddingTop: 10,
  },
  zoomBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  zoomBtnText: { color: '#fff', fontSize: 17, fontFamily: Fonts.semibold, marginTop: -1 },
  hint: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: Fonts.medium, flexShrink: 1, textAlign: 'center' },
});
