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
      <View style={{ marginRight: 6 }}><PinIcon size={15} color="#92400E" /></View>
      <Text style={styles.text}>Enable location for accurate matches</Text>
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
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  text: { flex: 1, fontSize: 13, color: '#92400E', fontWeight: '500' },
  btn: {
    backgroundColor: '#F59E0B',
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 10,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
