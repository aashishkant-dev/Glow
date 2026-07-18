import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../utils/colors';

interface IOSButtonProps extends PressableProps {
  title: string;
  variant?: 'filled' | 'outline' | 'ghost' | 'destructive' | 'success';
  size?: 'large' | 'medium' | 'small';
  loading?: boolean;
  style?: ViewStyle;
  icon?: string;
}

const GRADIENT_PAIRS: Record<string, [string, string]> = {
  filled:      ['#007AFF', '#0056CC'],
  success:     [Colors.onlineGreen, '#059669'],
  destructive: ['#EF4444', '#DC2626'],
};

export function IOSButton({
  title,
  variant = 'filled',
  size = 'large',
  loading = false,
  disabled,
  style,
  onPress,
  icon,
  ...rest
}: IOSButtonProps) {
  const isDisabled = disabled || loading;

  const handlePress = (e: any) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.(e);
  };

  const textColor =
    variant === 'outline'     ? Colors.systemBlue
    : variant === 'ghost'     ? Colors.systemBlue
    : '#fff';

  const useGradient = ['filled', 'success', 'destructive'].includes(variant);

  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon && <Text style={[styles.iconText, { color: textColor }]}>{icon}</Text>}
          <Text style={[styles.label, styles[`${size}Text` as keyof typeof styles], { color: textColor }]}>
            {title}
          </Text>
        </>
      )}
    </>
  );

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        styles[size],
        !useGradient && styles[`${variant}Bg` as keyof typeof styles],
        useGradient && styles.gradientWrapper,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      onPress={handlePress}
      disabled={isDisabled}
      // 'small' is 36pt tall — under Apple HIG's 44pt minimum touch target.
      // Expand the tappable area by 6pt vertically so small buttons stay easy to hit.
      hitSlop={size === 'small' ? { top: 6, bottom: 6 } : undefined}
      {...rest}
    >
      {useGradient ? (
        <LinearGradient
          colors={GRADIENT_PAIRS[variant] ?? ['#007AFF', '#0056CC']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.gradientInner}
        >
          {content}
        </LinearGradient>
      ) : content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    overflow: 'hidden',
  },
  large:  { height: 56, paddingHorizontal: 28 },
  medium: { height: 46, paddingHorizontal: 20 },
  small:  { height: 36, paddingHorizontal: 16 },

  gradientWrapper: { padding: 0 },
  gradientInner: {
    flex: 1, width: '100%',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6,
  },
  outlineBg:     { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.systemBlue },
  ghostBg:       { backgroundColor: 'transparent' },

  largeText:  { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  mediumText: { fontSize: 15, fontWeight: '700' },
  smallText:  { fontSize: 13, fontWeight: '700' },

  label:    {},
  iconText: { fontSize: 18 },
  disabled: { opacity: 0.38 },
  pressed:  { opacity: 0.82, transform: [{ scale: 0.975 }] },
});
