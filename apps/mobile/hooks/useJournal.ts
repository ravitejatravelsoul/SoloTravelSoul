import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { upsertItineraryDay } from '@solotravelsoul/firebase';
import type { JournalEntry, ItineraryDay } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useUIStore } from '@/stores/uiStore';
import { useNetworkState } from './useNetworkState';
import { cacheItinerary } from '@/utils/offlineCache';
import { enqueueOp, getQueueSize } from '@/utils/syncQueue';

function pushPendingCount(uid: string) {
  getQueueSize(uid).then((n) => useTripStore.getState().setPendingOpsCount(n));
}

export function useJournal(tripId: string) {
  const uid = useAuthStore((s) => s.user?.uid);
  const { itinerary, patchItineraryDay } = useTripStore(
    useShallow((s) => ({ itinerary: s.itinerary, patchItineraryDay: s.patchItineraryDay }))
  );
  const addToast = useUIStore((s) => s.addToast);
  const { isConnected } = useNetworkState();

  const addEntry = useCallback(
    async (dayId: string, entry: JournalEntry) => {
      if (!uid) return;
      const day = itinerary.find((d) => d.id === dayId);
      if (!day) return;
      const updated: ItineraryDay = {
        ...day,
        journalEntries: [entry, ...day.journalEntries],
      };
      patchItineraryDay(dayId, { journalEntries: updated.journalEntries });

      if (!isConnected) {
        const updatedItinerary = itinerary.map((d) => (d.id === dayId ? updated : d));
        await cacheItinerary(uid, tripId, updatedItinerary);
        await enqueueOp(uid, { type: 'itinerary.day', tripId, dayId, day: updated });
        pushPendingCount(uid);
        return;
      }

      await upsertItineraryDay(uid, tripId, updated).catch(() =>
        addToast('Could not save journal entry.', 'error')
      );
    },
    [uid, tripId, itinerary, patchItineraryDay, addToast, isConnected]
  );

  const editEntry = useCallback(
    async (dayId: string, entryId: string, updates: Partial<JournalEntry>) => {
      if (!uid) return;
      const day = itinerary.find((d) => d.id === dayId);
      if (!day) return;
      const updated: ItineraryDay = {
        ...day,
        journalEntries: day.journalEntries.map((j) =>
          j.id === entryId ? { ...j, ...updates } : j
        ),
      };
      patchItineraryDay(dayId, { journalEntries: updated.journalEntries });

      if (!isConnected) {
        // editEntry while offline: persist the updated day snapshot
        const updatedItinerary = itinerary.map((d) => (d.id === dayId ? updated : d));
        await cacheItinerary(uid, tripId, updatedItinerary);
        await enqueueOp(uid, { type: 'itinerary.day', tripId, dayId, day: updated });
        pushPendingCount(uid);
        return;
      }

      await upsertItineraryDay(uid, tripId, updated).catch(() =>
        addToast('Could not update journal entry.', 'error')
      );
    },
    [uid, tripId, itinerary, patchItineraryDay, addToast, isConnected]
  );

  const deleteEntry = useCallback(
    async (dayId: string, entryId: string) => {
      if (!uid) return;
      const day = itinerary.find((d) => d.id === dayId);
      if (!day) return;
      const updated: ItineraryDay = {
        ...day,
        journalEntries: day.journalEntries.filter((j) => j.id !== entryId),
      };
      patchItineraryDay(dayId, { journalEntries: updated.journalEntries });

      if (!isConnected) {
        const updatedItinerary = itinerary.map((d) => (d.id === dayId ? updated : d));
        await cacheItinerary(uid, tripId, updatedItinerary);
        await enqueueOp(uid, { type: 'itinerary.day', tripId, dayId, day: updated });
        pushPendingCount(uid);
        return;
      }

      await upsertItineraryDay(uid, tripId, updated).catch(() =>
        addToast('Could not delete journal entry.', 'error')
      );
    },
    [uid, tripId, itinerary, patchItineraryDay, addToast, isConnected]
  );

  return { addEntry, editEntry, deleteEntry };
}
