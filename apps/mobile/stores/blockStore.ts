import { create } from 'zustand';
import { blockUser as fbBlock, unblockUser as fbUnblock, subscribeBlockList } from '@solotravelsoul/firebase';

interface BlockState {
  blockedUids: string[];
  _unsubscribe: (() => void) | null;

  loadBlockList: (uid: string) => void;
  blockUser: (blockedUid: string) => Promise<void>;
  unblockUser: (blockedUid: string) => Promise<void>;
  reset: () => void;
}

let _currentUid: string | null = null;

export const useBlockStore = create<BlockState>((set, get) => ({
  blockedUids: [],
  _unsubscribe: null,

  loadBlockList: (uid: string) => {
    if (_currentUid === uid) return;
    _currentUid = uid;

    const prev = get()._unsubscribe;
    if (prev) prev();

    const unsub = subscribeBlockList(uid, (uids) => {
      if (_currentUid === uid) set({ blockedUids: uids });
    });

    set({ _unsubscribe: unsub });
  },

  blockUser: async (blockedUid: string) => {
    if (!_currentUid) return;
    await fbBlock(_currentUid, blockedUid);
    set((s) => ({ blockedUids: [...s.blockedUids, blockedUid] }));
  },

  unblockUser: async (blockedUid: string) => {
    if (!_currentUid) return;
    await fbUnblock(_currentUid, blockedUid);
    set((s) => ({ blockedUids: s.blockedUids.filter((u) => u !== blockedUid) }));
  },

  reset: () => {
    _currentUid = null;
    const unsub = get()._unsubscribe;
    if (unsub) unsub();
    set({ blockedUids: [], _unsubscribe: null });
  },
}));
