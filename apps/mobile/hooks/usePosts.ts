import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createPost,
  updatePost,
  deletePost,
  getPost,
  subscribePostsByAuthor,
  subscribeExplorePosts,
  getPostsFromUsers,
  likePost,
  unlikePost,
  isPostLiked,
} from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import type { TravelPost, PostType, PostVisibility } from '@solotravelsoul/shared';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

// ── useAuthorPosts — for profile grids ───────────────────────────────────────

export function useAuthorPosts(authorId: string, limit = 30) {
  const [posts, setPosts] = useState<TravelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!authorId) return;
    setLoading(true);
    unsubRef.current?.();
    unsubRef.current = subscribePostsByAuthor(authorId, limit, (data, last) => {
      setPosts(data);
      setLastDoc(last);
      setLoading(false);
    });
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, [authorId, limit]);

  return { posts, loading, lastDoc };
}

// ── useExplorePosts — for explore feed ───────────────────────────────────────

export function useExplorePosts(limit = 30) {
  const [posts, setPosts] = useState<TravelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setLoading(true);
    unsubRef.current?.();
    unsubRef.current = subscribeExplorePosts(limit, null, (data) => {
      setPosts(data);
      setLoading(false);
    });
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, [limit]);

  return { posts, loading };
}

// ── useFeedPosts — posts from followed users for "For You" feed ───────────────

export function useFeedPosts(followingIds: string[], limit = 50) {
  const [posts, setPosts] = useState<TravelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const idsKey = followingIds.join(',');

  useEffect(() => {
    if (followingIds.length === 0) { setPosts([]); setLoading(false); return; }
    setLoading(true);
    getPostsFromUsers(followingIds, limit)
      .then(setPosts)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, limit]);

  return { posts, loading };
}

// ── useLikePost ───────────────────────────────────────────────────────────────

export function useLikePost(postId: string) {
  const myUid = useAuthStore((s) => s.user?.uid ?? '');
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [checking, setChecking] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!myUid || !postId) return;
    setChecking(true);
    isPostLiked(postId, myUid)
      .then(setLiked)
      .finally(() => setChecking(false));
  }, [postId, myUid]);

  const toggle = useCallback(async (currentCount?: number) => {
    if (!myUid || toggling) return;
    setToggling(true);
    const wasLiked = liked;
    setLiked(!wasLiked);
    if (currentCount !== undefined) {
      setLikeCount(wasLiked ? currentCount - 1 : currentCount + 1);
    }
    try {
      if (wasLiked) {
        await unlikePost(postId, myUid);
      } else {
        await likePost(postId, myUid);
      }
    } catch {
      setLiked(wasLiked); // revert
      if (currentCount !== undefined) setLikeCount(currentCount);
    } finally {
      setToggling(false);
    }
  }, [postId, myUid, liked, toggling]);

  return { liked, likeCount, checking, toggling, toggle };
}

// ── useCreatePost ─────────────────────────────────────────────────────────────

export function useCreatePost() {
  const profile = useAuthStore((s) => s.profile);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (data: {
    caption: string;
    body?: string;
    location?: string;
    country?: string;
    images: string[];
    hashtags?: string[];
    postType?: PostType;
    visibility?: PostVisibility;
    tripId?: string | null;
  }): Promise<string | null> => {
    if (!profile) { setError('Not authenticated'); return null; }
    setCreating(true);
    setError(null);
    try {
      const postId = await createPost({
        authorId: profile.id,
        authorName: profile.name,
        authorPhoto: profile.photoURL,
        caption: data.caption,
        body: data.body ?? '',
        location: data.location ?? '',
        country: data.country ?? '',
        tripId: data.tripId ?? null,
        images: data.images,
        hashtags: data.hashtags ?? [],
        postType: data.postType ?? 'photo',
        visibility: data.visibility ?? 'public',
      });
      return postId;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setCreating(false);
    }
  }, [profile]);

  return { create, creating, error };
}
