import { useState, useCallback, memo } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, Chip, EmptyState, TripListSkeleton } from '@/components/ui';
import { TripCard } from '@/components/trips/TripCard';
import { useTrips } from '@/hooks/useTrips';
import { Colors, Spacing, Radius } from '@/constants/theme';
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
          <Text variant="h2">My Trips</Text>
          <View style={styles.addBtnPlaceholder} />
        </View>
        <TripListSkeleton count={4} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="h2">My Trips</Text>
        <TouchableOpacity
          onPress={() => router.push('/(app)/trips/create')}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={24} color={Colors.white} />
        </TouchableOpacity>
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
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnPlaceholder: { width: 40, height: 40 },
  filters: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  list: { padding: Spacing.lg, gap: Spacing.md },
  listEmpty: { flex: 1 },
});
