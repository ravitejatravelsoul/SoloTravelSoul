import { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, Chip, EmptyState, TripListSkeleton, PressableScale } from '@/components/ui';
import { TripCard } from '@/components/trips/TripCard';
import { useTrips } from '@/hooks/useTrips';
import { Colors, Spacing, Radius, Shadow } from '@/constants/theme';
import type { PlannedTrip } from '@solotravelsoul/shared';

type Filter = 'upcoming' | 'past';

export default function TripsScreen() {
  const { upcoming, past, loading, refreshing, refresh } = useTrips();
  const [filter, setFilter] = useState<Filter>('upcoming');

  const trips = filter === 'upcoming' ? upcoming : past;

  const renderItem = useCallback(
    ({ item }: { item: PlannedTrip }) => <TripCard trip={item} />,
    []
  );

  const keyExtractor = useCallback((t: PlannedTrip) => t.id, []);

  if (loading) {
    return (
      <Screen padded={false}>
        <View style={styles.header}>
          <Text variant="h2" accessibilityRole="header">My Trips</Text>
          <View style={styles.addBtnPlaceholder} />
        </View>
        <TripListSkeleton count={4} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="h2" accessibilityRole="header">My Trips</Text>
        <PressableScale
          onPress={() => router.push('/(app)/trips/create')}
          guardMs={500}
          style={styles.addBtn}
          accessibilityRole="button"
          accessibilityLabel="Plan a new trip"
        >
          <Ionicons name="add" size={26} color={Colors.white} />
        </PressableScale>
      </View>

      <View style={styles.filters}>
        <Chip
          label={`Upcoming (${upcoming.length})`}
          selected={filter === 'upcoming'}
          onPress={() => setFilter('upcoming')}
        />
        <Chip
          label={`Past (${past.length})`}
          selected={filter === 'past'}
          onPress={() => setFilter('past')}
        />
      </View>

      <FlatList
        data={trips}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, trips.length === 0 && styles.listEmpty]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={5}
        windowSize={10}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            emoji="🗺️"
            title={filter === 'upcoming' ? 'No upcoming trips' : 'No past trips'}
            subtitle={
              filter === 'upcoming'
                ? 'Tap + to plan your next adventure'
                : 'Completed trips will appear here'
            }
            actionLabel={filter === 'upcoming' ? 'Plan a trip' : undefined}
            onAction={filter === 'upcoming' ? () => router.push('/(app)/trips/create') : undefined}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingTop: Spacing['2xl'],
  },
  addBtn: {
    backgroundColor: Colors.coral,
    borderRadius: Radius.full,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.md,
  },
  addBtnPlaceholder: { width: 46, height: 46 },
  filters: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  list: { padding: Spacing.lg, gap: Spacing.md },
  listEmpty: { flex: 1 },
});
