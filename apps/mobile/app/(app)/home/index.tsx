import { useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, OfflineBanner } from '@/components/ui';
import { PostCard } from '@/components/posts/PostCard';
import { TripHeroCard } from '@/components/trips/TripHeroCard';
import { useFeed } from '@/hooks/useFeed';
import { useTrips } from '@/hooks/useTrips';
import { useAuthStore } from '@/stores/authStore';
import { useNetworkState } from '@/hooks/useNetworkState';
import { useNotifications } from '@/hooks/useNotifications';
import { getUserInitials } from '@solotravelsoul/shared';
import { tripStatus } from '@/utils/dateUtils';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import type { FeedItem } from '@/hooks/useFeed';

function FeedHeader() {
  const profile = useAuthStore((s) => s.profile);
  const { unreadCount } = useNotifications();
  const initials = getUserInitials(profile?.name ?? '?');

  return (
    <View style={styles.header}>
      <View style={styles.logoRow}>
        <Ionicons name="airplane" size={22} color={Colors.primary} />
        <Text style={styles.logo}>SoloTravelSoul</Text>
      </View>
      <View style={styles.headerRight}>
        <TouchableOpacity
          onPress={() => router.push('/(app)/post/create' as never)}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Ionicons name="add-circle-outline" size={26} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/(app)/notifications/index' as never)}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Ionicons name="notifications-outline" size={24} color={Colors.textPrimary} />
          {unreadCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/(app)/profile')}
          hitSlop={6}
        >
          <Avatar uri={profile?.photoURL} initials={initials} size={32} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EmptyFeed({ isNewUser }: { isNewUser: boolean }) {
  return (
    <View style={styles.emptyWrap}>
      <Ionicons name="earth-outline" size={56} color={Colors.border} />
      <Text style={styles.emptyTitle}>
        {isNewUser ? "Follow travelers to see their posts" : "No posts yet"}
      </Text>
      <Text style={styles.emptySub}>
        {isNewUser
          ? "Discover travelers in the Community tab to fill your feed"
          : "Be the first to share a travel memory"}
      </Text>
      <View style={styles.emptyActions}>
        {isNewUser ? (
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push('/(app)/community' as never)}
          >
            <Ionicons name="people-outline" size={16} color={Colors.white} />
            <Text style={styles.emptyBtnText}>Explore Community</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.emptyBtn, isNewUser && styles.emptyBtnSecondary]}
          onPress={() => router.push('/(app)/post/create' as never)}
        >
          <Ionicons name="camera-outline" size={16} color={isNewUser ? Colors.primary : Colors.white} />
          <Text style={[styles.emptyBtnText, isNewUser && { color: Colors.primary }]}>
            Share a Post
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function FeedScreen() {
  const { items, loading, refreshing, refresh, isEmpty, isNewUser } = useFeed();
  const { upcoming } = useTrips();
  const { isConnected } = useNetworkState();

  const activeTrip = upcoming.find((t) => tripStatus(t.startDate, t.endDate) === 'active');
  const nextTrip = activeTrip ?? upcoming.find((t) => tripStatus(t.startDate, t.endDate) === 'upcoming');

  const renderItem = useCallback(({ item }: { item: FeedItem }) => {
    return <PostCard post={item.data} />;
  }, []);

  const keyExtractor = useCallback((item: FeedItem) => item.data.postId, []);

  const ListHeaderComponent = useCallback(() => (
    <>
      {!isConnected && <OfflineBanner />}
      <FeedHeader />
      {nextTrip ? (
        <View style={styles.tripBanner}>
          <TripHeroCard trip={nextTrip} />
        </View>
      ) : null}
      {loading && items.length === 0 ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : null}
    </>
  ), [isConnected, nextTrip, loading, items.length]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={isEmpty ? [] : items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={loading ? null : <EmptyFeed isNewUser={isNewUser} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={10}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerBtn: { position: 'relative' },
  notifBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.error,
    borderRadius: Radius.full,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    fontSize: 9,
    color: Colors.white,
    fontWeight: FontWeight.bold,
  },
  tripBanner: {
    marginHorizontal: Spacing['2xl'],
    marginVertical: Spacing.lg,
  },
  list: { flexGrow: 1 },
  centerLoader: { padding: Spacing['4xl'], alignItems: 'center' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['4xl'],
    gap: Spacing.md,
    minHeight: 400,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  emptyBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  emptyBtnText: { fontSize: FontSize.sm, color: Colors.white, fontWeight: FontWeight.semibold },
});
