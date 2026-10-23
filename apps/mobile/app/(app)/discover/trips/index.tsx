import { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Skeleton, ScreenHeader, EmptyState, Reveal } from '@/components/ui';
import { PublicTripCard } from '@/components/discover/PublicTripCard';
import { usePublicTrips } from '@/hooks/usePublicTrips';
import { useBlockStore } from '@/stores/blockStore';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

export default function PublicTripsScreen() {
  const [search, setSearch] = useState('');
  const [acceptingOnly, setAcceptingOnly] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { blockedUids } = useBlockStore();

  const filters = useMemo(() => ({ destination: debouncedSearch, acceptingOnly }), [debouncedSearch, acceptingOnly]);
  const { trips, loading, error, reload } = usePublicTrips(filters);

  const visibleTrips = useMemo(
    () => trips.filter((t) => !blockedUids.includes(t.ownerUid)),
    [trips, blockedUids]
  );

  const handleSearchSubmit = () => setDebouncedSearch(search.trim());

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Explore trips" subtitle="Public trips you can ask to join" />

      {/* Search + filter */}
      <View style={styles.filterBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.placeholder} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            placeholder="Search destination…"
            placeholderTextColor={Colors.placeholder}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); setDebouncedSearch(''); }} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.placeholder} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Open to join</Text>
          <Switch
            accessibilityLabel="Show only trips open to join"
            value={acceptingOnly}
            onValueChange={setAcceptingOnly}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={Colors.white}
          />
        </View>
      </View>

      {loading && trips.length === 0 ? (
        <View style={styles.list}>
          {[1, 2, 3].map((k) => (
            <Skeleton key={k} style={styles.skeleton} />
          ))}
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load trips" subtitle="Check your connection and try again." actionLabel="Try again" onAction={reload} />
      ) : visibleTrips.length === 0 ? (
        <EmptyState
          emoji="🗺️"
          title="No public trips found"
          subtitle={debouncedSearch ? `No trips match "${debouncedSearch}"` : 'Check back later for new trips'}
          actionLabel={debouncedSearch ? 'Clear filters' : undefined}
          onAction={debouncedSearch ? () => { setSearch(''); setDebouncedSearch(''); } : undefined}
        />
      ) : (
        <FlatList
          data={visibleTrips}
          keyExtractor={(t) => t.tripId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Reveal index={index}>
              <PublicTripCard
                trip={item}
                onPress={() => router.push(`/(app)/discover/trips/${item.tripId}` as never)}
              />
            </Reveal>
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          ListFooterComponent={loading ? <ActivityIndicator style={{ marginTop: Spacing.lg }} color={Colors.primary} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  filterBar: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, paddingVertical: Spacing.sm },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.sm },
  filterLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  list: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },
  skeleton: { height: 260, borderRadius: Radius.xl, marginBottom: Spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'], gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
  retryLabel: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semibold },
});
