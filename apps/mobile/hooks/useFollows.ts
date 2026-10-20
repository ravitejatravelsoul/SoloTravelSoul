import { useState, useEffect, useCallback, useRef } from 'react';
import {
  followUser,
  unfollowUser,
  isFollowing,
  getFollowCounts,
  subscribeFollowers,
  subscribeFollowing,
  getFollowingIds,
} from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useFollowStore } from '@/stores/followStore';
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
        useFollowStore.getState().remove(myUid, targetUid);
      } else {
        await followUser(myUid, targetUid);
        useFollowStore.getState().add(myUid, targetUid);
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
  const storeUid = useFollowStore((s) => s.uid);
  const ids = useFollowStore((s) => s.ids);
  const loaded = useFollowStore((s) => s.loaded);
  const ready = loaded && storeUid === myUid;
  const [loading, setLoading] = useState(!ready);

  // Loaded once per account; later follows and unfollows update the shared store directly.
  useEffect(() => {
    if (!myUid) { setLoading(false); return; }
    if (useFollowStore.getState().loaded && useFollowStore.getState().uid === myUid) { setLoading(false); return; }
    setLoading(true);
    getFollowingIds(myUid)
      .then((list) => { if (useAuthStore.getState().user?.uid === myUid) useFollowStore.getState().set(myUid, list); })
      .finally(() => setLoading(false));
  }, [myUid]);

  return { ids: ready ? ids : [], loading: loading && !ready };
}
