import { useState, useEffect, useCallback, useRef } from 'react';
import {
  followUser,
  unfollowUser,
  isFollowing,
  getFollowCounts,
  subscribeFollowers,
  subscribeFollowing,
  getFollowingIds,
  createSocialNotification,
} from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import type { Follow, FollowCounts } from '@solotravelsoul/shared';

// ── useIsFollowing ────────────────────────────────────────────────────────────

export function useIsFollowing(targetUid: string) {
  const myUid = useAuthStore((s) => s.user?.uid ?? '');
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!myUid || !targetUid || myUid === targetUid) return;
    setLoading(true);
    isFollowing(myUid, targetUid)
      .then(setFollowing)
      .finally(() => setLoading(false));
  }, [myUid, targetUid]);

  const toggle = useCallback(async (targetName?: string, targetPhoto?: string | null) => {
    if (!myUid || !targetUid || myUid === targetUid || toggling) return;
    setToggling(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing); // optimistic

    try {
      if (wasFollowing) {
        await unfollowUser(myUid, targetUid);
      } else {
        await followUser(myUid, targetUid);
        // Send notification to the person being followed
        const myProfile = useAuthStore.getState().profile;
        if (myProfile) {
          await createSocialNotification({
            userId: targetUid,
            type: 'followed_you',
            actorId: myUid,
            actorName: myProfile.name,
            actorPhoto: myProfile.photoURL,
            targetId: myUid,
          }).catch(() => {});
        }
      }
    } catch {
      setFollowing(wasFollowing); // revert on error
    } finally {
      setToggling(false);
    }
  }, [myUid, targetUid, following, toggling]);

  return { following, loading, toggling, toggle };
}

// ── useFollowCounts ───────────────────────────────────────────────────────────

export function useFollowCounts(uid: string): FollowCounts & { loading: boolean } {
  const [counts, setCounts] = useState<FollowCounts>({ followersCount: 0, followingCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    getFollowCounts(uid)
      .then(setCounts)
      .finally(() => setLoading(false));
  }, [uid]);

  return { ...counts, loading };
}

// ── useFollowers ──────────────────────────────────────────────────────────────

export function useFollowers(uid: string, limit = 50) {
  const [followers, setFollowers] = useState<Follow[]>([]);
  const [loading, setLoading] = useState(true);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    unsubRef.current?.();
    unsubRef.current = subscribeFollowers(uid, limit, (data) => {
      setFollowers(data);
      setLoading(false);
    });
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, [uid, limit]);

  return { followers, loading };
}

// ── useFollowing ──────────────────────────────────────────────────────────────

export function useFollowing(uid: string, limit = 50) {
  const [following, setFollowing] = useState<Follow[]>([]);
  const [loading, setLoading] = useState(true);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    unsubRef.current?.();
    unsubRef.current = subscribeFollowing(uid, limit, (data) => {
      setFollowing(data);
      setLoading(false);
    });
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, [uid, limit]);

  return { following, loading };
}

// ── useFollowingIds ───────────────────────────────────────────────────────────
// Returns the list of UIDs that the current user follows — used for feed building.

export function useFollowingIds() {
  const myUid = useAuthStore((s) => s.user?.uid ?? '');
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!myUid) { setLoading(false); return; }
    setLoading(true);
    getFollowingIds(myUid)
      .then(setIds)
      .finally(() => setLoading(false));
  }, [myUid]);

  return { ids, loading };
}
