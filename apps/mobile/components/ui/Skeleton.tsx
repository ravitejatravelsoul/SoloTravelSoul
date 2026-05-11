import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, type ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius = Radius.sm,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius: radius,
          backgroundColor: Colors.chipBackground,
          opacity,
        },
        style,
      ]}
    />
  );
}

// Pre-built skeleton that matches the TripCard layout
export function TripCardSkeleton() {
  return (
    <View style={skStyles.card}>
      <Skeleton height={20} width="55%" />
      <Skeleton height={14} width="38%" style={skStyles.gap} />
      <Skeleton height={14} width="75%" style={skStyles.gap} />
    </View>
  );
}

// Repeating list of trip skeletons shown while trips load
export function TripListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={skStyles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={skStyles.cardWrapper}>
          <TripCardSkeleton />
        </View>
      ))}
    </View>
  );
}

const skStyles = StyleSheet.create({
  list: { padding: Spacing.lg, gap: Spacing.md },
  cardWrapper: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  card: { padding: Spacing.lg, gap: 0 },
  gap: { marginTop: Spacing.sm },
});
