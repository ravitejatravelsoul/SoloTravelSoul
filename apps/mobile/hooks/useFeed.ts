import { useState, useEffect, useCallback } from 'react';
import { getPostsFromUsers, getTrendingPosts } from '@solotravelsoul/firebase';
import { useFollowingIds } from '@/hooks/useFollows';
import { useBlockStore } from '@/stores/blockStore';
import type { TravelPost } from '@solotravelsoul/shared';

export type FeedItem = { type: 'post'; data: TravelPost };

export function useFeed() {
  const { ids: followingIds, loading: followsLoading } = useFollowingIds();
  const [followedPosts, setFollowedPosts] = useState<TravelPost[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<TravelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const blockedUids = useBlockStore((s) => s.blockedUids);

  const fetch = useCallback(async (ids: string[]) => {
    const [followed, trending] = await Promise.all([
      ids.length > 0 ? getPostsFromUsers(ids, 50) : Promise.resolve([]),
      getTrendingPosts(20),
    ]);
    setFollowedPosts(followed);
    setTrendingPosts(trending);
  }, []);

  useEffect(() => {
    if (followsLoading) return;
    setLoading(true);
    fetch(followingIds).finally(() => setLoading(false));
  }, [followingIds, followsLoading, fetch]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetch(followingIds);
    setRefreshing(false);
  }, [followingIds, fetch]);

  // Merge: followed posts first, then trending posts not already in followed
  const followedIds = new Set(followedPosts.map((p) => p.postId));
  const extraTrending = trendingPosts.filter((p) => !followedIds.has(p.postId));
  // Blocked users' posts never appear (App Store guideline 1.2).
  const items: FeedItem[] = [...followedPosts, ...extraTrending]
    .filter((p) => !blockedUids.includes(p.authorId))
    .map((p) => ({ type: 'post', data: p }));

  const isEmpty = !loading && items.length === 0;
  const isNewUser = !followsLoading && followingIds.length === 0;

  return {
    items,
    loading: loading || followsLoading,
    refreshing,
    refresh,
    isEmpty,
    isNewUser,
    followingCount: followingIds.length,
  };
}
