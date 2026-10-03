import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar } from '@/components/ui';
import { ExploreSection } from '@/components/explore/ExploreSection';
import { TrendingDestCard } from '@/components/explore/TrendingDestCard';
import { PostCard } from '@/components/posts/PostCard';
import { JournalCard } from '@/components/journals/JournalCard';
import { PublicTripCard } from '@/components/discover/PublicTripCard';
import { useExplorePosts } from '@/hooks/usePosts';
import { useExploreJournals } from '@/hooks/useJournals';
import { subscribeNearbyTravelers, subscribePublicTrips } from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useBlockStore } from '@/stores/blockStore';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import type { TravelPost } from '@solotravelsoul/shared';
import type { NearbyTraveler, PublicTrip } from '@solotravelsoul/shared';

const DEBOUNCE_MS = 500;

// Group posts by country and count
function groupByCountry(posts: TravelPost[]): Array<{ country: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const p of posts) {
    if (p.country) counts[p.country] = (counts[p.country] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([country, count]) => ({ country, count }));
}

export default function ExploreScreen() {
  const profile = useAuthStore((s) => s.profile);
  const { blockedUids } = useBlockStore();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const { posts: allPosts, loading: postsLoading } = useExplorePosts(60);
  const { journals, loading: journalsLoading } = useExploreJournals(10);

  const [nearbyTravelers, setNearbyTravelers] = useState<NearbyTraveler[]>([]);
  const [weekendTrips, setWeekendTrips] = useState<PublicTrip[]>([]);

  const unsubNearbyRef = useRef<(() => void) | null>(null);
  const unsubTripsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const currentCity = profile?.city ?? '';
    if (!currentCity) return;

    unsubNearbyRef.current = subscribeNearbyTravelers(
      currentCity,
      (travelers) => {
        setNearbyTravelers(travelers.filter((t) => !blockedUids.includes(t.uid)));
      }
    );

    return () => { unsubNearbyRef.current?.(); };
  }, [profile?.city, blockedUids]);

  useEffect(() => {
    unsubTripsRef.current = subscribePublicTrips(
      { acceptingOnly: true },
      10,
      null,
      (trips) => {
        // Weekend trips = ≤ 3 days duration
        const short = trips.filter((t) => {
          const days = Math.ceil((t.endDate.getTime() - t.startDate.getTime()) / 86400000);
          return days <= 3;
        });
        setWeekendTrips(short.slice(0, 6));
      }
    );
    return () => { unsubTripsRef.current?.(); };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    await new Promise((r) => setTimeout(r, 800));
    setRefreshing(false);
  }, []);

  const visiblePosts = allPosts.filter((p) => !blockedUids.includes(p.authorId));
  const trendingDests = groupByCountry(visiblePosts);
  const hiddenGems = visiblePosts.filter((p) => p.postType === 'hidden_gem').slice(0, 8);
  const foodPosts = visiblePosts.filter((p) => p.postType === 'food').slice(0, 8);
  const loading = postsLoading || journalsLoading;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Search bar ── */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.placeholder} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search destinations, places..."
            placeholderTextColor={Colors.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => !searchQuery && setSearchFocused(false)}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchFocused(false); }} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Colors.placeholder} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
          }
        >
          {/* ── Trending Destinations ── */}
          {trendingDests.length > 0 && (
            <ExploreSection title="Trending Destinations" icon="trending-up">
              {trendingDests.map(({ country, count }) => (
                <TrendingDestCard
                  key={country}
                  country={country}
                  postCount={count}
                  onPress={() => router.push(`/(app)/discover/trips` as never)}
                />
              ))}
            </ExploreSection>
          )}

          {/* ── Popular Journals ── */}
          {journals.length > 0 && (
            <ExploreSection title="Popular Journals" icon="book-outline" horizontal={false}>
              {journals.slice(0, 3).map((j) => (
                <JournalCard key={j.journalId} journal={j} />
              ))}
            </ExploreSection>
          )}

          {/* ── Hidden Gems ── */}
          {hiddenGems.length > 0 && (
            <ExploreSection title="Hidden Gems" icon="diamond-outline">
              {hiddenGems.map((p) => (
                <View key={p.postId} style={styles.postCardWrap}>
                  <PostCard post={p} />
                </View>
              ))}
            </ExploreSection>
          )}

          {/* ── Food Experiences ── */}
          {foodPosts.length > 0 && (
            <ExploreSection title="Food Experiences" icon="restaurant-outline">
              {foodPosts.map((p) => (
                <View key={p.postId} style={styles.postCardWrap}>
                  <PostCard post={p} />
                </View>
              ))}
            </ExploreSection>
          )}

          {/* ── Weekend Trips ── */}
          {weekendTrips.length > 0 && (
            <ExploreSection
              title="Weekend Trips"
              icon="calendar-outline"
              onSeeAll={() => router.push('/(app)/discover/trips' as never)}
              horizontal={false}
            >
              {weekendTrips.map((t) => (
                <PublicTripCard
                  key={t.tripId}
                  trip={t}
                  onPress={() => router.push(`/(app)/discover/trips/${t.tripId}` as never)}
                />
              ))}
            </ExploreSection>
          )}

          {/* ── Nearby Travelers ── */}
          {nearbyTravelers.length > 0 && (
            <ExploreSection
              title="Nearby Travelers"
              icon="people-outline"
              onSeeAll={() => router.push('/(app)/community/travelers' as never)}
            >
              {nearbyTravelers.slice(0, 8).map((t) => (
                <TouchableOpacity
                  key={t.uid}
                  style={styles.travelerCard}
                  onPress={() => router.push(`/(app)/community/profile/${t.uid}` as never)}
                  activeOpacity={0.8}
                >
                  <Avatar uri={t.photoURL} initials={getUserInitials(t.displayName)} size={52} />
                  <Text style={styles.travelerName} numberOfLines={1}>{t.displayName.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </ExploreSection>
          )}

          {/* ── All Recent Posts ── */}
          {visiblePosts.length > 0 && (
            <ExploreSection title="Recent Travel Posts" icon="images-outline" horizontal={false}>
              {visiblePosts.slice(0, 5).map((p) => (
                <PostCard key={p.postId} post={p} />
              ))}
            </ExploreSection>
          )}

          <View style={{ height: Spacing['4xl'] }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  searchWrap: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    height: '100%',
  },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: Spacing.xl },
  postCardWrap: { width: 280 },
  travelerCard: { alignItems: 'center', gap: 6, width: 70 },
  travelerName: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center' },
});
