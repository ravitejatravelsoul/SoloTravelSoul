import { useCallback } from 'react';
import {
  View,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, OfflineBanner, ExpandingMenu, PressableScale, Reveal } from '@/components/ui';
import { PostCard } from '@/components/posts/PostCard';
import { TripHeroCard } from '@/components/trips/TripHeroCard';
import { useFeed } from '@/hooks/useFeed';
import { useTrips } from '@/hooks/useTrips';
import { useAuthStore } from '@/stores/authStore';
import { useNetworkState } from '@/hooks/useNetworkState';
import { getUserInitials } from '@solotravelsoul/shared';
import { tripStatus } from '@/utils/dateUtils';
import { Colors, Spacing, Radius, FontSize, FontWeight, Fonts } from '@/constants/theme';
import type { FeedItem } from '@/hooks/useFeed';

function firstName(name: string | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first || 'traveler';
}

const SHORTCUTS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; route: string; tint: string }[] = [
  { key: 'explore', label: 'Explore trips', icon: 'compass', route: '/(app)/discover/trips', tint: Colors.tealSoft },
  { key: 'companions', label: 'Find companions', icon: 'people', route: '/(app)/community/companions', tint: Colors.coralSoft },
  { key: 'saved', label: 'Saved posts', icon: 'bookmark', route: '/(app)/saved-posts', tint: '#FFF1CC' },
  { key: 'groups', label: 'Groups', icon: 'chatbubbles', route: '/(app)/community/groups', tint: '#E9E6FB' },
];

function FeedHeader({ subtitle }: { subtitle: string }) {
  const profile = useAuthStore((s) => s.profile);
  const initials = getUserInitials(profile?.name ?? '?');

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.greetingWrap}>
          <Text style={styles.greeting} numberOfLines={2} accessibilityRole="header">
            Hi, {firstName(profile?.name)} 👋
          </Text>
          <Text variant="caption" numberOfLines={2}>{subtitle}</Text>
        </View>
        <View style={styles.headerRight}>
          <ExpandingMenu
            label="Create"
            actions={[
              { key: 'post', label: 'Share a photo post', icon: 'camera', onPress: () => router.push('/(app)/post/create' as never) },
              { key: 'journal', label: 'Write a journal entry', icon: 'book', onPress: () => router.push('/(app)/journal/create' as never) },
              { key: 'trip', label: 'Plan a trip', icon: 'map', onPress: () => router.push('/(app)/trips/create' as never) },
            ]}
          />
          <PressableScale
            onPress={() => router.push('/(app)/profile')}
            guardMs={500}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            hitSlop={6}
          >
            <Avatar uri={profile?.photoURL} initials={initials} size={44} />
          </PressableScale>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcuts} keyboardShouldPersistTaps="handled">
        {SHORTCUTS.map((c) => (
          <PressableScale
            key={c.key}
            guardMs={500}
            onPress={() => router.push(c.route as never)}
            accessibilityRole="button"
            accessibilityLabel={c.label}
            style={[styles.shortcut, { backgroundColor: c.tint }]}
          >
            <Ionicons name={c.icon} size={18} color={Colors.textPrimary} />
            <Text style={styles.shortcutText}>{c.label}</Text>
          </PressableScale>
        ))}
      </ScrollView>
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

  // Real data only: the next trip if there is one, otherwise a plain invitation.
  const headerSubtitle = nextTrip ? `Next up: ${nextTrip.destination}` : 'Where to next?';

  const renderItem = useCallback(({ item }: { item: FeedItem }) => {
    return <PostCard post={item.data} />;
  }, []);

  const keyExtractor = useCallback((item: FeedItem) => item.data.postId, []);

  const ListHeaderComponent = useCallback(() => (
    <>
      {!isConnected && <OfflineBanner />}
      <FeedHeader subtitle={headerSubtitle} />
      {nextTrip ? (
        <Reveal style={styles.tripBanner}>
          <TripHeroCard trip={nextTrip} />
        </Reveal>
      ) : null}
      {loading && items.length === 0 ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : null}
    </>
  ), [isConnected, nextTrip, loading, items.length, headerSubtitle]);

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
    gap: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  greetingWrap: { flex: 1, gap: 2 },
  greeting: { fontFamily: Fonts.displayHeavy, fontSize: FontSize['3xl'], lineHeight: 36, color: Colors.textPrimary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  shortcuts: { paddingHorizontal: Spacing['2xl'], paddingBottom: Spacing.lg, gap: Spacing.sm },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, minHeight: 44, borderRadius: Radius.full },
  shortcutText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
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
