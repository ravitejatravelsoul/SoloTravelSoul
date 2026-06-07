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
import { Text, Skeleton } from '@/components/ui';
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
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Explore Trips</Text>
        <View style={{ width: 24 }} />
      </View>

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
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Couldn't load trips</Text>
          <TouchableOpacity onPress={reload} style={styles.retryBtn}>
            <Text style={styles.retryLabel}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : visibleTrips.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="map-outline" size={56} color={Colors.placeholder} />
          <Text style={styles.emptyTitle}>No public trips found</Text>
          <Text style={styles.emptySubtitle}>
            {debouncedSearch
              ? `No trips match "${debouncedSearch}"`
              : 'Check back later for new trips'}
          </Text>
          {debouncedSearch ? (
            <TouchableOpacity onPress={() => { setSearch(''); setDebouncedSearch(''); }} style={styles.retryBtn}>
              <Text style={styles.retryLabel}>Clear filters</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={visibleTrips}
          keyExtractor={(t) => t.tripId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <PublicTripCard
              trip={item}
              onPress={() => router.push(`/(app)/discover/trips/${item.tripId}` as never)}
            />
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
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  navTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  filterBar: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  list: { padding: Spacing.lg },
  skeleton: { height: 140, borderRadius: Radius.lg, marginBottom: Spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'], gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
  retryLabel: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semibold },
});
