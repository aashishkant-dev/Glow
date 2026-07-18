import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';

interface AvatarProps {
  name?: string;
  photoUrl?: string | null;
  size?: number;
  bgColor?: string;
  style?: StyleProp<ViewStyle>;
}

// expo-image: disk+memory cached, faster decode, lower memory than RN Image —
// matters because avatars render in every list row.
function AvatarBase({ name = '?', photoUrl, size = 44, bgColor = '#6366F1', style }: AvatarProps) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const radius = size / 2;

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[{ width: size, height: size, borderRadius: radius }, style as any]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: radius, backgroundColor: bgColor }, style]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

export const Avatar = React.memo(AvatarBase);

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '800' },
});
