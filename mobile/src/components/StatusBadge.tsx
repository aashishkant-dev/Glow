import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusColors } from '../utils/colors';
import { Radius, Spacing } from '../utils/theme';

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Requested',
  ACCEPTED:  'Accepted',
  ON_MY_WAY: 'On the way',
  STARTED:   'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

interface Props {
  status: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: Props) {
  const color = StatusColors[status] ?? '#64748B';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <View style={[styles.pill, { backgroundColor: color + '18', borderColor: color + '40' }, size === 'sm' && styles.pillSm]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }, size === 'sm' && styles.textSm]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillSm: { paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  text:  { fontSize: 13, fontWeight: '600' },
  textSm:{ fontSize: 11, fontWeight: '600' },
});
