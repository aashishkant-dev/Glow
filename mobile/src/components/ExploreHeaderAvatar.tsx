import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { ProfileIcon } from './CareIcons';
import { Colors } from '../utils/colors';
import { tapLight } from '../utils/haptics';

// IG-home-style header avatar: shows the user's live photo (same `photoUri`
// source HomeScreen and the tab bar already read, so it inherits the
// AuthContext photo-persistence fix automatically) or a glyph fallback.
export function ExploreHeaderAvatar({ size = 34 }: { size?: number }) {
  const nav = useNavigation<any>();
  const { photoUri } = useAuth();

  return (
    <Pressable
      onPress={() => { tapLight(); nav.navigate('Profile'); }}
      style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}
      hitSlop={8}
    >
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
        />
      ) : (
        <ProfileIcon size={size * 0.6} color={Colors.brand} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1.5,
    borderColor: Colors.separator,
    backgroundColor: Colors.systemBackground,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
