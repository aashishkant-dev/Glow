import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, ServiceAccentColors } from '../utils/colors';
import { ServiceIcon } from './ServiceIcon';
import { CardStyle, Radius, Spacing, Typography } from '../utils/theme';
import { StatusBadge } from './StatusBadge';
import { StarRating } from './StarRating';
import { Booking } from '../api/client';

interface Props {
  job: Booking & { distanceKm?: number; isNew?: boolean };
  onPress: () => void;
  showActions?: boolean;
  actionSlot?: React.ReactNode;
}

function JobCardBase({ job, onPress, actionSlot }: Props) {
  const accent = ServiceAccentColors[job.serviceType] ?? Colors.brand;
  const date   = new Date(job.scheduledAt);
  const dateStr = date.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      {/* New indicator */}
      {(job as any).isNew && <View style={styles.newDot} />}

      {/* Header row */}
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: accent + '18' }]}>
          <ServiceIcon serviceType={job.serviceType} size={24} color={accent} bubble={false} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.serviceType} numberOfLines={1}>{job.serviceType}</Text>
          <Text style={styles.dateTime}>{dateStr} · {timeStr}</Text>
        </View>
        <View style={styles.priceWrap}>
          <Text style={styles.price}>${job.totalPrice}</Text>
          <Text style={styles.hours}>{job.hours}h</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Details row */}
      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Client</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {job.customer?.name ?? 'Unknown'}
          </Text>
        </View>

        {(job as any).distanceKm !== undefined && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Distance</Text>
            <Text style={styles.detailValue}>{(job as any).distanceKm} km</Text>
          </View>
        )}

        <StatusBadge status={job.status} size="sm" />
      </View>

      {/* Provider rating */}
      {job.provider?.rating != null && (job.provider.rating as number) > 0 && (
        <View style={styles.ratingRow}>
          <StarRating rating={job.provider.rating as number} count={(job.provider as any).ratingCount} size={12} />
        </View>
      )}

      {/* Action slot */}
      {actionSlot && <View style={styles.actionSlot}>{actionSlot}</View>}
    </Pressable>
  );
}

// Memoized — rendered in nearby/my-jobs lists.
export const JobCard = React.memo(JobCardBase);

const styles = StyleSheet.create({
  card: {
    ...CardStyle.card,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  newDot: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brand,
  },
  header:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconWrap:    { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  icon:        { fontSize: 24 },
  serviceType: { ...Typography.headline, marginBottom: 2 },
  dateTime:    { ...Typography.footnote },
  priceWrap:   { alignItems: 'flex-end' },
  price:       { fontSize: 22, fontWeight: '800', color: Colors.brand },
  hours:       { ...Typography.caption1 },
  divider:     { height: 1, backgroundColor: Colors.separator, marginVertical: Spacing.md },
  detailsRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  detailItem:  { flex: 1 },
  detailLabel: { ...Typography.caption1 },
  detailValue: { ...Typography.subheadline, fontWeight: '600', color: Colors.label },
  ratingRow:   { marginTop: Spacing.sm },
  actionSlot:  { marginTop: Spacing.md },
});
