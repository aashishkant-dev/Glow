import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, ServiceAccentColors } from '../utils/colors';
import { ServiceIcon } from './ServiceIcon';
import { CardStyle, Radius, Spacing, Typography } from '../utils/theme';
import { StatusBadge } from './StatusBadge';
import { Booking } from '../api/client';
import { formatCurrency } from '../utils/format';

interface Props {
  booking: Booking;
  onPress: () => void;
  showProvider?: boolean;
}

function BookingCardBase({ booking, onPress, showProvider = true }: Props) {
  const accent = ServiceAccentColors[booking.serviceType] ?? Colors.brand;
  const date   = new Date(booking.scheduledAt);
  const dateStr = date.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: accent + '18' }]}>
          <ServiceIcon serviceType={booking.serviceType} size={26} color={accent} bubble={false} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.serviceType} numberOfLines={1}>{booking.serviceType}</Text>
          <Text style={styles.dateTime}>{dateStr} · {timeStr}</Text>
          {showProvider && booking.provider?.name && (
            <Text style={styles.providerName} numberOfLines={1}>with {booking.provider.name}</Text>
          )}
        </View>
        <View style={styles.right}>
          <Text style={styles.price}>{formatCurrency(booking.totalPrice)}</Text>
          <StatusBadge status={booking.status} size="sm" />
        </View>
      </View>
    </Pressable>
  );
}

// Memoized — rendered in long booking lists; skip re-render unless props change.
export const BookingCard = React.memo(BookingCardBase);

const styles = StyleSheet.create({
  card: {
    ...CardStyle.card,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    padding: Spacing.lg,
  },
  cardPressed: { opacity: 0.92 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconWrap:    { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  textCol:     { flex: 1, gap: 2 },
  serviceType: { ...Typography.headline },
  dateTime:    { ...Typography.footnote, marginTop: 3 },
  providerName:     { ...Typography.caption1, marginTop: 3, color: Colors.secondaryLabel },
  right:       { alignItems: 'flex-end', gap: Spacing.xs },
  price:       { fontSize: 18, fontWeight: '700', color: Colors.brand },
});
