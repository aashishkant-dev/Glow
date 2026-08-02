import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Booking, apiGetAllBookings } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { Colors, StatusColors } from '../../utils/colors';
import { NoteIcon } from '../../components/CareIcons';
import { formatCurrency } from '../../utils/format';
import { CalendarSVGIcon } from '../../components/TabIcons';

type StatusFilter = 'ALL' | 'REQUESTED' | 'ACCEPTED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'REQUESTED', 'ACCEPTED', 'STARTED', 'COMPLETED', 'CANCELLED'];

export function BookingsListScreen() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = filter !== 'ALL' ? { status: filter } : undefined;
      const data = await apiGetAllBookings(params);
      setBookings(data.bookings ?? []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  function renderBooking({ item }: { item: Booking }) {
    const date = new Date(item.scheduledAt);
    const dateStr = date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <Text style={styles.serviceType}>{item.serviceType}</Text>
            <Text style={styles.customer}>{item.customer?.name ?? 'Unknown'}</Text>
            {item.provider && <Text style={styles.providerName}>Provider: {item.provider.name}</Text>}
          </View>
          <View style={styles.cardRight}>
            <StatusBadge status={item.status} />
            <Text style={styles.price}>{formatCurrency(item.totalPrice ?? 0, { decimals: 0 })}</Text>
          </View>
        </View>
        <View style={[styles.cardBottom, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          <CalendarSVGIcon size={13} color={Colors.secondaryLabel} />
          <Text style={styles.dateMeta}>{dateStr} at {timeStr} · {item.hours}h</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>All Bookings</Text>
        <Text style={styles.subtitle}>{bookings.length} results</Text>
      </View>

      {/* Horizontal scroll filter */}
      <FlatList
        data={STATUS_FILTERS}
        keyExtractor={(item) => item}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            style={[
              styles.filterBtn,
              filter === f && { backgroundColor: f === 'ALL' ? Colors.systemPurple : (StatusColors[f] ?? Colors.systemPurple) },
            ]}
            onPress={() => setFilter(f)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={Colors.systemPurple} />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item._id}
          renderItem={renderBooking}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={Colors.systemPurple}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><NoteIcon size={40} color={Colors.tertiaryLabel} /></View>
              <Text style={styles.emptyText}>No bookings found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.systemGroupedBackground },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 32, fontWeight: '700', color: Colors.label },
  subtitle: { fontSize: 14, color: Colors.secondaryLabel, marginTop: 2 },
  filterRow: { paddingHorizontal: 20, gap: 8, marginVertical: 12 },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.systemBackground,
  },
  filterText: { fontSize: 14, fontWeight: '500', color: Colors.secondaryLabel },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingBottom: 32 },

  card: {
    backgroundColor: Colors.systemBackground,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardLeft: { flex: 1, gap: 2 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  serviceType: { fontSize: 15, fontWeight: '600', color: Colors.label },
  customer: { fontSize: 13, color: Colors.secondaryLabel },
  providerName: { fontSize: 13, color: Colors.systemBlue },
  price: { fontSize: 16, fontWeight: '700', color: Colors.label },
  cardBottom: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.separator, paddingTop: 8 },
  dateMeta: { fontSize: 13, color: Colors.secondaryLabel },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { marginBottom: 12 },
  emptyText: { fontSize: 16, color: Colors.secondaryLabel },
});
