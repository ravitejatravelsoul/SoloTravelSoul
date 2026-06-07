import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribeSavedPosts, getPost, savePost, unsavePost, isSavedPost } from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import type { SavedPost, TravelPost } from '@solotravelsoul/shared';

export function useSavedPosts(limit = 50) {
  const myUid = useAuthStore((s) => s.user?.uid ?? '');
  const [savedMeta, setSavedMeta] = useState<SavedPost[]>([]);
  const [posts, setPosts] = useState<TravelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!myUid) return;
    setLoading(true);
    unsubRef.current?.();
    unsubRef.current = subscribeSavedPosts(myUid, limit, async (saved) => {
      setSavedMeta(saved);
      const resolved = await Promise.all(
        saved.map((s) => getPost(s.postId).catch(() => null))
      );
      setPosts(resolved.filter((p): p is TravelPost => p !== null && !p.isArchived));
      setLoading(false);
    });
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, [myUid, limit]);

  return { posts, savedMeta, loading };
}

export function useSavePost(postId: string) {
  const myUid = useAuthStore((s) => s.user?.uid ?? '');
  const [saved, setSaved] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!myUid || !postId) return;
    isSavedPost(postId, myUid).then(setSaved);
  }, [postId, myUid]);

  const toggle = useCallback(async () => {
    if (!myUid || toggling) return;
    setToggling(true);
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      if (wasSaved) await unsavePost(postId, myUid);
      else await savePost(postId, myUid);
    } catch {
      setSaved(wasSaved);
    } finally {
      setToggling(false);
    }
  }, [postId, myUid, saved, toggling]);

  return { saved, toggling, toggle };
}
