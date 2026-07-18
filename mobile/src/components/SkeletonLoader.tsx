import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors } from '../utils/colors';

interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonBox({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonBoxProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: Colors.systemGray4 },
        { opacity },
        style,
      ]}
    />
  );
}

export function BookingCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SkeletonBox width={48} height={48} borderRadius={12} />
        <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
          <SkeletonBox width="60%" height={14} />
          <SkeletonBox width="80%" height={12} />
          <SkeletonBox width="40%" height={12} />
        </View>
        <SkeletonBox width={72} height={26} borderRadius={13} />
      </View>
      <View style={styles.cardFooter}>
        <SkeletonBox width={60} height={18} />
        <SkeletonBox width={20} height={20} borderRadius={10} />
      </View>
    </View>
  );
}

export function JobCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SkeletonBox width={52} height={52} borderRadius={14} />
        <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
          <SkeletonBox width="55%" height={15} />
          <SkeletonBox width="75%" height={12} />
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <SkeletonBox width={64} height={20} />
          <SkeletonBox width={50} height={14} />
        </View>
      </View>
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={{ padding: 20, gap: 16 }}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <SkeletonBox width={88} height={88} borderRadius={44} />
        <SkeletonBox width={160} height={20} />
        <SkeletonBox width={100} height={26} borderRadius={13} />
      </View>
      <View style={styles.card}>
        {[1, 2, 3].map(i => (
          <View key={i} style={{ marginBottom: i < 3 ? 16 : 0, gap: 4 }}>
            <SkeletonBox width="30%" height={11} />
            <SkeletonBox width="70%" height={15} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.systemBackground,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
  },
});
