import { useEffect, useCallback } from 'react';
import { getReputation, upsertReputation } from '@solotravelsoul/firebase';
import { calculateBadges, calculateScore, profileCompletePct } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useTrips } from '@/hooks/useTrips';
import { useAuthorPosts } from '@/hooks/usePosts';
import { useAuthorJournals } from '@/hooks/useJournals';

// Calculates and syncs reputation to Firestore.
// Call this on profile load — it's idempotent and safe to call frequently.
export function useReputation() {
  const profile = useAuthStore((s) => s.profile);
  const uid = profile?.id ?? '';

  const { upcoming, past } = useTrips();
  const { posts } = useAuthorPosts(uid, 200);
  const { journals } = useAuthorJournals(uid, 100);

  const sync = useCallback(async () => {
    if (!uid || !profile) return;

    const tripsCompleted = past.length;
    const countriesVisited = (profile.countriesVisited ?? []).length;
    const groupsJoined = 0; // fetching groups is expensive — start at 0 until V2
    const postsPublished = posts.length;
    const journalsPublished = journals.length;
    const completePct = profileCompletePct(profile);

    const inputs = { tripsCompleted, countriesVisited, groupsJoined, postsPublished, journalsPublished, profileCompletePct: completePct };
    const badges = calculateBadges(inputs);
    const score = calculateScore(inputs);

    await upsertReputation({
      uid,
      badges,
      score,
      tripsCompleted,
      countriesVisited,
      groupsJoined,
      postsPublished,
      journalsPublished,
      updatedAt: new Date(),
    });
  }, [uid, profile, past.length, posts.length, journals.length]);

  // Sync once on mount (when data is loaded)
  useEffect(() => {
    if (!uid || past.length === 0 && posts.length === 0 && journals.length === 0) return;
    sync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, past.length, posts.length, journals.length]);

  return { sync };
}
