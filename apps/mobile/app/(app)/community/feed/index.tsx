import { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar } from '@/components/ui';
import { subscribeActivityFeed } from '@solotravelsoul/firebase';
import type { FeedItem } from '@solotravelsoul/shared';
import { useBlockStore } from '@/stores/blockStore';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

const FEED_LIMIT = 30;
let lastFetchTime = 0;
let cachedFeed: FeedItem[] = [];

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function feedItemText(item: FeedItem): string {
  switch (item.type) {
    case 'trip_created': return `created a public trip to ${item.targetDestination ?? item.targetTitle}`;
    case 'group_created': return `created the group "${item.targetTitle}"`;
    case 'joined_group': return `joined "${item.targetTitle}"`;
    case 'memory_added': return `added a memory from ${item.targetDestination ?? item.targetTitle}`;
    case 'place_saved': return `saved a place in ${item.targetTitle}`;
    default: return 'shared something';
  }
}

function feedItemIcon(type: FeedItem['type']): string {
  switch (type) {
    case 'trip_created': return 'map';
    case 'group_created': return 'people';
    case 'joined_group': return 'person-add';
    case 'memory_added': return 'camera';
    case 'place_saved': return 'heart';
    default: return 'pulse';
  }
}

export default function ActivityFeedScreen() {
  const { blockedUids } = useBlockStore();
  const [feed, setFeed] = useState<FeedItem[]>(cachedFeed);
  const [loading, setLoading] = useState(cachedFeed.length === 0);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const now = Date.now();
    // 5-minute client cache
    if (now - lastFetchTime < 5 * 60 * 1000 && cachedFeed.length > 0) {
      setFeed(cachedFeed);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeActivityFeed(FEED_LIMIT, (items) => {
      cachedFeed = items;
      lastFetchTime = Date.now();
      setFeed(items);
      setLoading(false);
    });
    unsubRef.current = unsub;
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, []);

  const visible = feed.filter((item) => !blockedUids.includes(item.actorUid));

  const handleItemPress = (item: FeedItem) => {
    if (item.targetType === 'trip') {
      router.push(`/(app)/discover/trips/${item.targetId}` as never);
    } else if (item.targetType === 'group') {
      router.push(`/(app)/community/groups/${item.targetId}` as never);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Activity Feed</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="pulse-outline" size={56} color={Colors.placeholder} />
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySubtitle}>
            Join groups and explore public trips to see activity here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.feedItemId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.feedItem}
              onPress={() => handleItemPress(item)}
              activeOpacity={0.8}
            >
              <TouchableOpacity onPress={() => router.push(`/(app)/community/profile/${item.actorUid}` as never)} activeOpacity={0.7}>
                <Avatar uri={item.actorPhotoURL} initials={getUserInitials(item.actorName)} size={40} />
              </TouchableOpacity>
              <View style={styles.feedText}>
                <Text style={styles.feedContent} numberOfLines={2}>
                  <Text style={styles.feedActor}>{item.actorName} </Text>
                  <Text>{feedItemText(item)}</Text>
                </Text>
                <Text style={styles.feedTime}>{timeAgo(item.createdAt)}</Text>
              </View>
              <View style={[styles.feedIcon, { backgroundColor: Colors.primary + '12' }]}>
                <Ionicons name={feedItemIcon(item.type) as never} size={16} color={Colors.primary} />
              </View>
            </TouchableOpacity>
          )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'], gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  list: { padding: Spacing.lg },
  feedItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  feedText: { flex: 1 },
  feedContent: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  feedActor: { fontWeight: FontWeight.semibold },
  feedTime: { fontSize: FontSize.xs, color: Colors.placeholder, marginTop: 4 },
  feedIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
