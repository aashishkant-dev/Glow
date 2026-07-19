/**
 * GlowSheet — Apple-style bottom sheet used by Glow Match, look details and
 * occasion pickers. Rendered inside an RN Modal: react-native-web portals it
 * to document.body, so it always paints (and receives clicks) above the
 * floating pill tab bar — inline zIndex overlays lose that fight because the
 * navigator's screen container forms its own stacking context.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../utils/colors';

const SCREEN_H = Dimensions.get('window').height;

interface GlowSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Fraction of screen height the sheet may grow to. */
  maxHeightPct?: number;
}

export function GlowSheet({ visible, onClose, children, maxHeightPct = 0.88 }: GlowSheetProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1, duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0, duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible]);

  const insets = useSafeAreaInsets();
  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H, 0] });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight: SCREEN_H * maxHeightPct,
              paddingBottom: Math.max(insets.bottom, 14),
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'flex-end',
    // Must outrank the floating tab bar (zIndex: 5) — see LocationPrompt.
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: { backgroundColor: 'rgba(29,29,31,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    ...(Platform.OS === 'android' ? { elevation: 24 } : null),
  },
  handle: {
    alignSelf: 'center',
    width: 40, height: 5, borderRadius: 3,
    backgroundColor: Colors.systemGray4,
    marginBottom: 10,
  },
});
