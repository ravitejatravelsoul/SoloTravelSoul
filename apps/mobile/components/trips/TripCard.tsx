import { memo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui/Text';
import { Colors, Gradients, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { formatDateRange, tripDurationDays, tripStatus, daysUntil, tripCurrentDay } from '@/utils/dateUtils';
import type { PlannedTrip } from '@solotravelsoul/shared';

const STATUS_COLOR = {
  upcoming: Colors.primary,
  active: Colors.success,
  past: Colors.textSecondary,
} as const;

const STATUS_GRADIENT = {
  upcoming: Gradients.primary,
  active: Gradients.success,
  past: ['#9CA3AF', '#6B7280'] as const,
} as const;

const STATUS_LABEL = {
  upcoming: (trip: PlannedTrip) => {
    const d = daysUntil(trip.startDate);
    return d === 0 ? 'Starts today' : d === 1 ? 'Tomorrow' : `In ${d} days`;
  },
  active: (trip: PlannedTrip) => {
    const day = tripCurrentDay(trip.startDate);
    const total = tripDurationDays(trip.startDate, trip.endDate);
    return `Day ${day} of ${total}`;
  },
  past: () => 'Completed',
} as const;

const STATUS_ICON = {
  upcoming: 'calendar-outline',
  active: 'airplane',
  past: 'checkmark-circle-outline',
} as const;

interface TripCardProps {
  trip: PlannedTrip;
}

export const TripCard = memo(function TripCard({ trip }: TripCardProps) {
  const status = tripStatus(trip.startDate, trip.endDate);
  const accentColor = STATUS_COLOR[status];
  const gradient = STATUS_GRADIENT[status];
  const statusLabel = STATUS_LABEL[status](trip);
  const icon = STATUS_ICON[status];
  const duration = tripDurationDays(trip.startDate, trip.endDate);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/(app)/trips/${trip.id}`)}
      activeOpacity={0.84}
      style={styles.wrapper}
    >
      {/* Gradient accent strip */}
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.accentBar}
      />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text variant="h3" numberOfLines={1}>{trip.destination}</Text>
            <Text variant="caption" style={styles.dates}>
              {formatDateRange(trip.startDate, trip.endDate)}
            </Text>
          </View>
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{duration}d</Text>
          </View>
        </View>

        <View style={styles.bottomRow}>
          <View style={[styles.statusPill, { backgroundColor: accentColor + '14' }]}>
            <Ionicons name={icon as never} size={12} color={accentColor} />
            <Text style={[styles.statusText, { color: accentColor }]}>{statusLabel}</Text>
          </View>

          {trip.notes ? (
            <Text variant="caption" numberOfLines={1} style={styles.notes}>
              {trip.notes}
            </Text>
          ) : (
            <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.md,
  },
  accentBar: {
    width: 5,
  },
  body: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  dates: {
    marginTop: 2,
    color: Colors.textSecondary,
  },
  durationBadge: {
    backgroundColor: Colors.chipBackground,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  durationText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  notes: {
    flex: 1,
    color: Colors.placeholder,
    textAlign: 'right',
    marginLeft: Spacing.sm,
  },
});
