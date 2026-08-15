/** Small square thumbnail used by the filter picker in Posts and Looks. */
import React from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

export function FilterPreview({ uri, overlay, size }: { uri: string; overlay?: string; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden' }}>
      <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" cachePolicy="memory-disk" />
      {overlay && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]} />}
    </View>
  );
}
