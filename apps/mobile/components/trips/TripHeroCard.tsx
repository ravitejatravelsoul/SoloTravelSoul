import { memo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Colors, Gradients, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { tripStatus, tripDurationDays, daysUntil, tripCurrentDay } from '@/utils/dateUtils';
import type { PlannedTrip } from '@solotravelsoul/shared';

interface TripHeroCardProps {
  trip: PlannedTrip;
}

export const TripHeroCard = memo(function TripHeroCard({ trip }: TripHeroCardProps) {
  const status = tripStatus(trip.startDate, trip.endDate);
  const isActive = status === 'active';
  const gradient = isActive ? Gradients.heroActive : Gradients.hero;

  const totalDays = tripDurationDays(trip.startDate, trip.endDate);
  const currentDay = tripCurrentDay(trip.startDate);
  const daysLeft = daysUntil(trip.startDate);
  const progress = isActive ? Math.min(currentDay / totalDays, 1) : 0;

  const eyebrow = isActive ? 'Currently on trip' : 'Next adventure';
  const statusLine = isActive
    ? `Day ${currentDay} of ${totalDays}`
    : daysLeft === 0
    ? 'Starts today!'
    : daysLeft === 1
    ? 'Tomorrow!'
    : `${daysLeft} days away`;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => router.push(`/(app)/trips/${trip.id}`)}
      style={styles.wrapper}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Decorative circles */}
        <View style={styles.decCircle1} />
        <View style={styles.decCircle2} />

        {/* Eyebrow */}
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowBadge}>
            <View style={[styles.pulseDot, isActive && styles.pulseDotActive]} />
            <Text style={styles.eyebrowText}>{eyebrow}</Text>
          </View>
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{totalDays}d</Text>
          </View>
        </View>

        {/* Destination */}
        <Text style={styles.destination} numberOfLines={2}>{trip.destination}</Text>

        {/* Status line */}
        <Text style={styles.statusLine}>{statusLine}</Text>

        {/* Progress bar — active trips only */}
        {isActive && (
          <View style={styles.progressSection}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressLabel}>
              {totalDays - currentDay} day{totalDays - currentDay !== 1 ? 's' : ''} remaining
            </Text>
          </View>
        )}

        {/* CTA row */}
        <View style={styles.ctaRow}>
          <View style={styles.ctaBtn}>
            <Text style={styles.ctaBtnText}>
              {isActive ? 'Open itinerary' : 'View trip'}
            </Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.white} />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
    ...Shadow.hero,
  },
  gradient: {
    padding: Spacing['2xl'],
    minHeight: 200,
    overflow: 'hidden',
  },
  // Decorative background circles
  decCircle1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -60,
    right: -40,
  },
  decCircle2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -30,
    left: -20,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  eyebrowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  pulseDotActive: {
    backgroundColor: '#4ADE80',
  },
  eyebrowText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.3,
  },
  durationBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  durationText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  destination: {
    fontSize: FontSize['4xl'],
    fontWeight: FontWeight.extrabold,
    color: Colors.white,
    lineHeight: 40,
    marginBottom: Spacing.xs,
  },
  statusLine: {
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.md,
  },
  progressSection: {
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: Radius.full,
  },
  progressLabel: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.6)',
  },
  ctaRow: {
    flexDirection: 'row',
    marginTop: Spacing.xs,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  ctaBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
});
