// Web-safe haptics wrapper.
// expo-haptics is a no-op on web in recent SDKs, but calling it directly in a tap
// handler still risks throwing on some browsers and clutters every call site with
// `Platform.OS !== 'web'` guards. Route all haptic feedback through here instead.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const enabled = Platform.OS !== 'web';

export function tapLight() {
  if (!enabled) return;
  Haptics.selectionAsync().catch(() => {});
}

export function tapSuccess() {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function tapWarning() {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export function tapImpact() {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

import { ActionSheetIOS, Alert } from 'react-native';

/**
 * Native-feeling confirm. On iOS shows a bottom ActionSheet (the familiar iOS
 * pattern, with a red destructive option); on Android/web falls back to Alert.
 * `destructive` styles the confirm option red and fires a warning haptic.
 */
export function confirmAction(opts: {
  title?: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  const cancelLabel = opts.cancelLabel ?? 'Cancel';
  if (opts.destructive) tapWarning(); else tapLight();

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: opts.title,
        message: opts.message,
        options: [cancelLabel, opts.confirmLabel],
        cancelButtonIndex: 0,
        destructiveButtonIndex: opts.destructive ? 1 : undefined,
      },
      i => { if (i === 1) opts.onConfirm(); },
    );
    return;
  }
  // Alert.alert with a multi-button array is a silent no-op on RN-Web — the
  // dialog never appears and onConfirm never fires, so every caller of this
  // function (delete a comment, delete a scan, …) looked like a dead button
  // on web specifically. PostsScreen.tsx already worked around this locally
  // for its own delete-post flow; fixing it here once covers every caller
  // instead of every call site needing its own Platform.OS check.
  if (Platform.OS === 'web') {
    const text = [opts.title, opts.message].filter(Boolean).join('\n\n');
    if (typeof window !== 'undefined' && window.confirm(text || opts.confirmLabel)) {
      opts.onConfirm();
    }
    return;
  }
  // Android: standard two-button dialog.
  Alert.alert(
    opts.title ?? opts.confirmLabel,
    opts.message,
    [
      { text: cancelLabel, style: 'cancel' },
      { text: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: opts.onConfirm },
    ],
  );
}
