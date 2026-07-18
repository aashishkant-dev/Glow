import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocation } from '../context/LocationContext';
import { Colors } from '../utils/colors';
import { PinIcon } from './CareIcons';

export function LocationBanner() {
  const { permissionStatus, requestLocation } = useLocation();

  if (permissionStatus !== 'denied') return null;

  return (
    <View style={styles.banner}>
      <View style={{ marginRight: 6 }}><PinIcon size={15} color={Colors.brandDeep} /></View>
      <Text style={styles.text}>Enable location for nearby artists</Text>
      <Pressable onPress={requestLocation} style={styles.btn}>
        <Text style={styles.btnText}>Enable</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.brandLight,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.brandAccent,
  },
  text: { flex: 1, fontSize: 13, color: Colors.brandDeep, fontWeight: '600' },
  btn: {
    backgroundColor: Colors.brand,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginLeft: 10,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
