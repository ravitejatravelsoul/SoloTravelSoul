import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createJournal,
  updateJournal,
  deleteJournal,
  getJournal,
  subscribeJournalsByAuthor,
  subscribeExploreJournals,
  likeJournal,
  unlikeJournal,
  isJournalLiked,
} from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import type { TravelJournal } from '@solotravelsoul/shared';

export function useAuthorJournals(authorId: string, limit = 20) {
  const [journals, setJournals] = useState<TravelJournal[]>([]);
  const [loading, setLoading] = useState(true);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!authorId) return;
    setLoading(true);
    unsubRef.current?.();
    unsubRef.current = subscribeJournalsByAuthor(authorId, limit, (data) => {
      setJournals(data);
      setLoading(false);
    });
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, [authorId, limit]);

  return { journals, loading };
}

export function useExploreJournals(limit = 20) {
  const [journals, setJournals] = useState<TravelJournal[]>([]);
  const [loading, setLoading] = useState(true);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setLoading(true);
    subscribeExploreJournals(limit, (data) => {
      setJournals(data);
      setLoading(false);
    }).then((unsub) => { unsubRef.current = unsub; });
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, [limit]);

  return { journals, loading };
}

export function useLikeJournal(journalId: string) {
  const myUid = useAuthStore((s) => s.user?.uid ?? '');
  const [liked, setLiked] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!myUid || !journalId) return;
    isJournalLiked(journalId, myUid).then(setLiked);
  }, [journalId, myUid]);

  const toggle = useCallback(async (currentCount?: number) => {
    if (!myUid || toggling) return;
    setToggling(true);
    const wasLiked = liked;
    setLiked(!wasLiked);
    try {
      if (wasLiked) await unlikeJournal(journalId, myUid);
      else await likeJournal(journalId, myUid);
    } catch {
      setLiked(wasLiked);
    } finally {
      setToggling(false);
    }
  }, [journalId, myUid, liked, toggling]);

  return { liked, toggling, toggle };
}

export function useCreateJournal() {
  const profile = useAuthStore((s) => s.profile);
  const [creating, setCreating] = useState(false);

  const create = useCallback(async (data: Omit<TravelJournal, 'journalId' | 'authorId' | 'authorName' | 'authorPhoto' | 'likeCount' | 'commentCount' | 'saveCount' | 'isArchived' | 'createdAt' | 'updatedAt'>): Promise<string | null> => {
    if (!profile) return null;
    setCreating(true);
    try {
      return await createJournal({
        ...data,
        authorId: profile.id,
        authorName: profile.name,
        authorPhoto: profile.photoURL,
      });
    } finally {
      setCreating(false);
    }
  }, [profile]);

  return { create, creating };
}
