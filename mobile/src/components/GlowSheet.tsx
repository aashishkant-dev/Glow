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
  KeyboardAvoidingView,
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
  /**
   * Whether tapping the backdrop or pressing the Android back button closes
   * the sheet. Defaults to true, which is right for a browsing sheet you can
   * idly dismiss.
   *
   * Set false for a sheet running a multi-step flow with state worth
   * protecting. The backdrop Pressable covers the ENTIRE screen behind the
   * sheet, so once the keyboard is up and the sheet is partly behind it, an
   * ordinary mis-tap toward an input lands on the backdrop and dismisses the
   * whole flow — which is how phone verification was losing a sent OTP and
   * restarting at phone entry.
   */
  dismissible?: boolean;
}

export function GlowSheet({ visible, onClose, children, maxHeightPct = 0.88, dismissible = true }: GlowSheetProps) {
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
      onRequestClose={dismissible ? onClose : undefined}
    >
      {/* The sheet is bottom-anchored, so without this the software keyboard
          simply covers it — the user cannot see the field they are typing
          into. behavior 'padding' is the correct one for a bottom sheet on
          iOS; Android already resizes the window via adjustResize, and
          applying padding there as well double-counts and leaves a gap. */}
      <KeyboardAvoidingView
        style={styles.overlay}
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]} pointerEvents={dismissible ? 'auto' : 'none'}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            onPress={dismissible ? onClose : undefined}
            // Non-dismissible sheets keep the dimmed backdrop for depth but
            // stop it swallowing taps meant for the sheet's own inputs.
            pointerEvents={dismissible ? 'auto' : 'none'}
          />
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
      </KeyboardAvoidingView>
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
