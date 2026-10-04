import { getChatQueueSize } from '@/utils/chatQueue';
import { useState, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  getChecklist,
  upsertChecklistItem,
  deleteChecklistItem as fbDeleteChecklistItem,
} from '@solotravelsoul/firebase';
import type { ChecklistItem } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useUIStore } from '@/stores/uiStore';
import { useHaptics } from './useHaptics';
import { useNetworkState } from './useNetworkState';
import {
  getCachedChecklist,
  cacheChecklist,
  setLastSync,
} from '@/utils/offlineCache';
import { enqueueOp, getQueueSize } from '@/utils/syncQueue';

function genId(): string {
  return `cl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_ITEMS = [
  'Passport / ID',
  'Flight tickets',
  'Hotel booking',
  'Phone charger',
  'Clothes',
  'Medicines',
  'Wallet',
];

function pushPendingCount(uid: string) {
  Promise.all([getQueueSize(uid), getChatQueueSize(uid)]).then(([tripCount, chatCount]) => {
    if (useAuthStore.getState().user?.uid === uid) useTripStore.getState().setPendingOpsCount(tripCount + chatCount);
  });
}

export function useChecklist(tripId: string) {
  const uid = useAuthStore((s) => s.user?.uid);
  const { checklist: rawChecklist, checklistTripId, setChecklist, addChecklistItem, patchChecklistItem, removeChecklistItem } =
    useTripStore(
      useShallow((s) => ({
        checklist: s.checklist,
        checklistTripId: s.checklistTripId,
        setChecklist: s.setChecklist,
        addChecklistItem: s.addChecklistItem,
        patchChecklistItem: s.patchChecklistItem,
        removeChecklistItem: s.removeChecklistItem,
      }))
    );
  // Guard against rendering/editing the previous trip's checklist while this
  // trip's data is still loading (the store's checklist is a single shared array).
  const checklist = useMemo(
    () => (checklistTripId === tripId ? rawChecklist : []),
    [checklistTripId, tripId, rawChecklist]
  );
  const addToast = useUIStore((s) => s.addToast);
  const haptics = useHaptics();
  const { isConnected } = useNetworkState();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;

    // Show cached data immediately — no spinner if we have it
    const cached = await getCachedChecklist(uid, tripId);
    if (useAuthStore.getState().user?.uid !== uid) return;
    if (cached) {
      setChecklist(cached, tripId);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      let items = await getChecklist(uid, tripId);
      if (useAuthStore.getState().user?.uid !== uid) return;

      // Firestore returned empty + we have a valid local cache → likely offline memory miss
      if (items.length === 0 && cached && cached.length > 0) {
        setLoading(false);
        return;
      }

      // First time opening this trip's checklist — seed sensible defaults
      if (items.length === 0) {
        const now = Date.now();
        const defaults: ChecklistItem[] = DEFAULT_ITEMS.map((text, i) => ({
          id: genId(),
          text,
          checked: false,
          createdAt: new Date(now + i),
        }));
        await Promise.all(defaults.map((item) => upsertChecklistItem(uid, tripId, item)));
        items = defaults;
      }

      if (useAuthStore.getState().user?.uid !== uid) return;
      setChecklist(items, tripId);
      await cacheChecklist(uid, tripId, items);
      await setLastSync(uid, `checklist:${tripId}`);
    } catch {
      // If we already showed cache, silently continue; otherwise surface the error
      if (!cached) addToast('Could not load checklist.', 'error');
    } finally {
      setLoading(false);
    }
  }, [uid, tripId, setChecklist, addToast]);

  const toggleItem = useCallback(
    async (itemId: string) => {
      if (!uid) return;
      const item = checklist.find((c) => c.id === itemId);
      if (!item) return;
      const next = { ...item, checked: !item.checked };

      next.checked ? haptics.light() : haptics.selection();

      // Optimistic update
      patchChecklistItem(itemId, { checked: next.checked });

      if (!isConnected) {
        const updated = checklist.map((c) => (c.id === itemId ? next : c));
        await cacheChecklist(uid, tripId, updated);
        await enqueueOp(uid, { type: 'checklist.upsert', tripId, item: next });
        pushPendingCount(uid);
        return;
      }

      await upsertChecklistItem(uid, tripId, next).catch(() =>
        patchChecklistItem(itemId, { checked: item.checked })
      );
    },
    [uid, tripId, checklist, patchChecklistItem, isConnected]
  );

  const addItem = useCallback(
    async (text: string) => {
      if (!uid || !text.trim()) return;
      const item: ChecklistItem = {
        id: genId(),
        text: text.trim(),
        checked: false,
        createdAt: new Date(),
      };
      addChecklistItem(item);

      if (!isConnected) {
        const updated = [...checklist, item];
        await cacheChecklist(uid, tripId, updated);
        await enqueueOp(uid, { type: 'checklist.upsert', tripId, item });
        pushPendingCount(uid);
        return;
      }

      await upsertChecklistItem(uid, tripId, item).catch(() => {
        removeChecklistItem(item.id);
        addToast('Could not add item.', 'error');
      });
    },
    [uid, tripId, checklist, addChecklistItem, removeChecklistItem, addToast, isConnected]
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      if (!uid) return;
      const item = checklist.find((c) => c.id === itemId);
      if (!item) return;
      removeChecklistItem(itemId);

      if (!isConnected) {
        const updated = checklist.filter((c) => c.id !== itemId);
        await cacheChecklist(uid, tripId, updated);
        await enqueueOp(uid, { type: 'checklist.delete', tripId, itemId });
        pushPendingCount(uid);
        return;
      }

      await fbDeleteChecklistItem(uid, tripId, itemId).catch(() => {
        addChecklistItem(item);
        addToast('Could not delete item.', 'error');
      });
    },
    [uid, tripId, checklist, removeChecklistItem, addChecklistItem, addToast, isConnected]
  );

  return { checklist, loading, load, toggleItem, addItem, deleteItem };
}
