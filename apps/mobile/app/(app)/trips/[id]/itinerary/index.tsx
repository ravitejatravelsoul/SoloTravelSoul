import { useEffect, memo, useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, Text, ScreenHeader, PressableScale } from '@/components/ui';
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
  Fonts,
} from '@/constants/theme';
import { TripMapView } from '@/components/map/TripMapView';
import type { ItineraryDay } from '@solotravelsoul/shared';

export default function ItineraryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useTripStore((s) => s.trips.find((t) => t.id === id));
  const { itinerary, loading, load } = useItinerary(id);
  const status = trip ? tripStatus(trip.startDate, trip.endDate) : 'upcoming';
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

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
      <ScreenHeader
        title={trip?.destination ?? 'Itinerary'}
        subtitle={itinerary.length > 0 && !loading ? `${itinerary.length} day${itinerary.length !== 1 ? 's' : ''} planned` : undefined}
        right={
          <View style={styles.headerRight}>
            {status === 'active' && (
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Active</Text>
              </View>
            )}
            {itinerary.length > 0 && !loading && (
              <PressableScale
                onPress={() => setViewMode((v) => (v === 'list' ? 'map' : 'list'))}
                guardMs={300}
                style={styles.mapToggleBtn}
                accessibilityRole="button"
                accessibilityLabel={viewMode === 'map' ? 'Show the day list' : 'Show the map'}
              >
                <Ionicons name={viewMode === 'map' ? 'list-outline' : 'map-outline'} size={22} color={Colors.primaryDark} />
              </PressableScale>
            )}
          </View>
        }
      />

      {!loading && itinerary.length > 0 && viewMode === 'map' && (
        <TripMapView itinerary={itinerary} />
      )}

      {!loading && itinerary.length > 0 && viewMode === 'list' && (
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
                {totalPlaces} place{totalPlaces !== 1 ? 's' : ''} planned across {totalDays} days
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

      {!loading && itinerary.length === 0 && viewMode === 'list' && (
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
      <PressableScale
        scaleTo={0.98}
        guardMs={500}
        accessibilityRole="button"
        accessibilityLabel={`${formatDayLabel(day.date)}, ${placeCount} place${placeCount !== 1 ? 's' : ''}${isToday ? ', today' : ''}`}
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
      </PressableScale>
    </View>
  );
});

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  mapToggleBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
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
    borderRadius: Radius.xl,
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
    fontFamily: Fonts.displayHeavy,
    fontSize: FontSize['2xl'],
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
    fontSize: FontSize.sm,
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
    width: 40,
    paddingTop: 4,
  },
  dayBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontFamily: Fonts.display,
    fontSize: FontSize.md,
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
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  cardToday: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    backgroundColor: Colors.tealSoft,
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
    fontFamily: Fonts.display,
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    lineHeight: 26,
  },
  dayLabelPast: { color: Colors.textSecondary },

  todayBadge: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  todayBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.white,
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
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  pillPast: { backgroundColor: Colors.background },
  pillText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  pillTextPast: { color: Colors.textSecondary },
  emptyHint: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
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
