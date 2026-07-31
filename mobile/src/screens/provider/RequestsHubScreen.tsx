import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RequestsScreen } from './RequestsScreen';
import { ProviderCalendarScreen } from './ProviderCalendarScreen';
import { Colors } from '../../utils/colors';

type SubTab = 'requests' | 'upcoming';

// Requests + Calendar used to be two separate tabs (a FAB "Jobs" browse button
// and a "Calendar" tab). Folded into one Requests tab with a segmented toggle
// so the tab bar drops to 4 uniform tabs — the two screens underneath are
// untouched, this is a thin composition layer.
export function RequestsHubScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<SubTab>('requests');

  return (
    <View style={{ flex: 1, backgroundColor: '#F1F5F4' }}>
      <View style={[styles.toggleRow, { paddingTop: insets.top + 10 }]}>
        <Pressable
          style={[styles.toggleBtn, tab === 'requests' && styles.toggleBtnActive]}
          onPress={() => setTab('requests')}
        >
          <Text style={[styles.toggleText, tab === 'requests' && styles.toggleTextActive]}>New requests</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, tab === 'upcoming' && styles.toggleBtnActive]}
          onPress={() => setTab('upcoming')}
        >
          <Text style={[styles.toggleText, tab === 'upcoming' && styles.toggleTextActive]}>Upcoming</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'requests' ? <RequestsScreen /> : <ProviderCalendarScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: Colors.brand,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  toggleBtnActive: { backgroundColor: '#fff' },
  toggleText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  toggleTextActive: { color: Colors.brand },
});
