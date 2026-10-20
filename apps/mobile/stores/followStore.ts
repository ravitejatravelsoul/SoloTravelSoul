import { create } from 'zustand';

/**
 * Who the signed-in person follows, shared by everything that follows or unfollows and by the feed, so the feed
 * changes as soon as a follow or unfollow succeeds instead of waiting for a restart.
 */
interface FollowState {
  uid: string | null;
  ids: string[];
  loaded: boolean;
  set: (uid: string, ids: string[]) => void;
  add: (uid: string, target: string) => void;
  remove: (uid: string, target: string) => void;
  reset: () => void;
}

export const useFollowStore = create<FollowState>((set) => ({
  uid: null,
  ids: [],
  loaded: false,
  set: (uid, ids) => set({ uid, ids: [...new Set(ids)], loaded: true }),
  add: (uid, target) => set((s) => (s.uid !== uid || s.ids.includes(target) ? s : { ids: [...s.ids, target] })),
  remove: (uid, target) => set((s) => (s.uid !== uid || !s.ids.includes(target) ? s : { ids: s.ids.filter((id) => id !== target) })),
  reset: () => set({ uid: null, ids: [], loaded: false }),
}));
