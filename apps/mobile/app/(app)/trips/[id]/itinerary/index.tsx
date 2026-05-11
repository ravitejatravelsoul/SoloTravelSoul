import { useEffect, memo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, Text } from '@/components/ui';
import { useTripStore } from '@/stores/tripStore';
import { useItinerary } from '@/hooks/useItinerary';
import { formatDayLabel, tripStatus, tripCurrentDay, tripDurationDays } from '@/utils/dateUtils';
import {
  Colors,
  Gradients,
  Spacing,
  Radius,
  FontSize,
  FontWeight,
  Shadow,
} from '@/constants/theme';
import type { ItineraryDay } from '@solotravelsoul/shared';

export default function ItineraryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useTripStore((s) => s.trips.find((t) => t.id === id));
  const { itinerary, loading, load } = useItinerary(id);
  const status = trip ? tripStatus(trip.startDate, trip.endDate) : 'upcoming';

  useEffect(() => {
    if (trip) load(trip.startDate, trip.endDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, load]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayId = itinerary.find((d) => {
    const dd = new Date(d.date);
    dd.setHours(0, 0, 0, 0);
    return dd.getTime() === today.getTime();
  })?.id;

  const isPastDay = useCallback((day: ItineraryDay): boolean => {
    const d = new Date(day.date);
    d.setHours(23, 59, 59, 999);
    return d.getTime() < Date.now() && day.id !== todayId;
  }, [todayId]);

  // Aggregate stats for the header
  const totalPlaces = itinerary.reduce((n, d) => n + d.places.length, 0);
  const totalDays = trip ? tripDurationDays(trip.startDate, trip.endDate) : itinerary.length;
  const currentDay = trip && status === 'active' ? tripCurrentDay(trip.startDate) : null;
  const completedDays = itinerary.filter((d) => isPastDay(d)).length;

  const renderDay = useCallback(
    (item: ItineraryDay, index: number, isLast: boolean) => (
      <DayRow
        key={item.id}
        day={item}
        index={index}
        tripId={id}
        isToday={item.id === todayId}
        isPast={isPastDay(item)}
        isLast={isLast}
      />
    ),
    [id, todayId, isPastDay]
  );

  return (
    <Screen loading={loading} padded={false}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <Text variant="h3" numberOfLines={1}>
            {trip?.destination ?? 'Itinerary'}
          </Text>
          {itinerary.length > 0 && !loading && (
            <Text variant="caption" style={styles.headerSub}>
              {itinerary.length} day{itinerary.length !== 1 ? 's' : ''} planned
            </Text>
          )}
        </View>
        {status === 'active' && (
          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>Active</Text>
          </View>
        )}
      </View>

      {!loading && itinerary.length > 0 && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >

          {/* ── Trip progress banner (active trips) ── */}
          {status === 'active' && currentDay !== null && (
            <LinearGradient
              colors={Gradients.heroActive}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.progressBanner}
            >
              <View style={styles.progressBannerContent}>
                <View>
                  <Text style={styles.progressBannerLabel}>Currently on</Text>
                  <Text style={styles.progressBannerDay}>
                    Day {currentDay} of {totalDays}
                  </Text>
                </View>
                <View style={styles.progressBannerRight}>
                  <Text style={styles.progressBannerPlaces}>
                    {totalPlaces} place{totalPlaces !== 1 ? 's' : ''} planned
                  </Text>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.round(
                            (Math.max(0, currentDay - 1) / Math.max(1, totalDays - 1)) * 100
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </LinearGradient>
          )}

          {/* ── Upcoming / past summary chip ── */}
          {status !== 'active' && totalPlaces > 0 && (
            <View style={styles.summaryChip}>
              <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.summaryChipText}>
                {totalPlaces} place{totalPlaces !== 1 ? 's' : ''} planned across {completedDays + (totalDays - completedDays)} days
              </Text>
            </View>
          )}

          {/* ── Timeline ── */}
          <View style={styles.timeline}>
            {itinerary.map((day, index) =>
              renderDay(day, index, index === itinerary.length - 1)
            )}
          </View>
        </ScrollView>
      )}

      {!loading && itinerary.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📅</Text>
          <Text variant="h3" center>No itinerary yet</Text>
          <Text variant="caption" center style={styles.emptySub}>
            Itinerary days load automatically from your trip dates.
          </Text>
        </View>
      )}
    </Screen>
  );
}

// ── DayRow ────────────────────────────────────────────────────────────

const DayRow = memo(function DayRow({
  day,
  index,
  tripId,
  isToday,
  isPast,
  isLast,
}: {
  day: ItineraryDay;
  index: number;
  tripId: string;
  isToday: boolean;
  isPast: boolean;
  isLast: boolean;
}) {
  const placeCount = day.places.length;
  const entryCount = day.journalEntries.length;
  const hasContent = placeCount > 0 || entryCount > 0;

  return (
    <View style={styles.rowWrap}>
      {/* ── Timeline column ── */}
      <View style={styles.timelineCol}>
        <View
          style={[
            styles.dayBadge,
            isToday && styles.dayBadgeToday,
            isPast && !isToday && styles.dayBadgePast,
          ]}
        >
          {isPast && !isToday ? (
            <Ionicons name="checkmark" size={14} color={Colors.white} />
          ) : (
            <Text
              style={[
                styles.dayNum,
                isToday && styles.dayNumToday,
                isPast && !isToday && styles.dayNumPast,
              ]}
            >
              {index + 1}
            </Text>
          )}
        </View>
        {!isLast && (
          <View
            style={[styles.timelineLine, isPast && styles.timelineLinePast]}
          />
        )}
      </View>

      {/* ── Card ── */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => router.push(`/(app)/trips/${tripId}/itinerary/${day.id}`)}
        style={[
          styles.card,
          isToday && styles.cardToday,
          isPast && !isToday && styles.cardPast,
        ]}
      >
        {/* Top row */}
        <View style={styles.cardTop}>
          <Text
            style={[
              styles.dayLabel,
              isPast && !isToday && styles.dayLabelPast,
            ]}
            numberOfLines={1}
          >
            {formatDayLabel(day.date)}
          </Text>
          {isToday && (
            <View style={styles.todayBadge}>
              <Text style={styles.todayBadgeText}>Today</Text>
            </View>
          )}
          {isPast && !isToday && (
            <Text style={styles.pastHint}>Completed</Text>
          )}
        </View>

        {/* Content pills / empty hint */}
        {hasContent ? (
          <View style={styles.pills}>
            {placeCount > 0 && (
              <View style={[styles.pill, isPast && styles.pillPast]}>
                <Ionicons
                  name="location-outline"
                  size={11}
                  color={isPast ? Colors.placeholder : Colors.textSecondary}
                />
                <Text style={[styles.pillText, isPast && styles.pillTextPast]}>
                  {placeCount} place{placeCount !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
            {entryCount > 0 && (
              <View style={[styles.pill, isPast && styles.pillPast]}>
                <Ionicons
                  name="pencil-outline"
                  size={11}
                  color={isPast ? Colors.placeholder : Colors.textSecondary}
                />
                <Text style={[styles.pillText, isPast && styles.pillTextPast]}>
                  {entryCount} entr{entryCount !== 1 ? 'ies' : 'y'}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.emptyHint}>
            {isToday ? 'Add places for today →' : 'Tap to plan this day'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
});

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingTop: Spacing['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerSub: { color: Colors.textSecondary, marginTop: 1 },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.success + '18',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.success },
  activeText: { fontSize: 12, fontWeight: FontWeight.semibold, color: Colors.success },

  scroll: { paddingBottom: Spacing['4xl'] },

  // ── Active progress banner ─────────────────────────────────────────
  progressBanner: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    ...Shadow.md,
  },
  progressBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressBannerLabel: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: FontWeight.semibold,
  },
  progressBannerDay: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    color: Colors.white,
    marginTop: 2,
  },
  progressBannerRight: { alignItems: 'flex-end', gap: 6 },
  progressBannerPlaces: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: FontWeight.medium,
  },
  progressTrack: {
    width: 100,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.white,
    borderRadius: 2,
  },

  // ── Summary chip (upcoming / past) ────────────────────────────────
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'center',
    backgroundColor: Colors.chipBackground,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  summaryChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },

  // ── Timeline ──────────────────────────────────────────────────────
  timeline: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  rowWrap: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },

  // Left column: badge + connecting line
  timelineCol: {
    alignItems: 'center',
    width: 36,
    paddingTop: 4,
  },
  dayBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.chipBackground,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    flexShrink: 0,
  },
  dayBadgeToday: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayBadgePast: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  dayNum: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  dayNumToday: { color: Colors.white },
  dayNumPast: { color: Colors.white },

  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.border,
    marginTop: Spacing.xs,
    borderRadius: 1,
    minHeight: 20,
  },
  timelineLinePast: {
    backgroundColor: Colors.success + '60',
  },

  // Card
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  cardToday: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    backgroundColor: Colors.primary + '04',
  },
  cardPast: {
    backgroundColor: Colors.background,
    borderColor: Colors.borderLight,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  dayLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  dayLabelPast: { color: Colors.textSecondary },

  todayBadge: {
    backgroundColor: Colors.primary + '18',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  todayBadgeText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  pastHint: {
    fontSize: FontSize.xs,
    color: Colors.success,
    fontWeight: FontWeight.medium,
  },

  pills: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.chipBackground,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  pillPast: { backgroundColor: Colors.background },
  pillText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  pillTextPast: { color: Colors.placeholder },
  emptyHint: {
    fontSize: FontSize.xs,
    color: Colors.placeholder,
    fontStyle: 'italic',
  },

  // ── Empty state ───────────────────────────────────────────────────
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
    gap: Spacing.md,
  },
  emptyEmoji: { fontSize: 48, lineHeight: 58 },
  emptySub: { color: Colors.textSecondary, marginTop: Spacing.xs, lineHeight: 20 },
});
