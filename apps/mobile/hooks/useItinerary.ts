import { useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  getItinerary,
  upsertItineraryDay,
} from '@solotravelsoul/firebase';
import type { ItineraryDay, PlaceEntry } from '@solotravelsoul/shared';
import { buildItineraryDays } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useUIStore } from '@/stores/uiStore';
import { useNetworkState } from './useNetworkState';
import {
  getCachedItinerary,
  cacheItinerary,
  setLastSync,
} from '@/utils/offlineCache';
import { enqueueOp, getQueueSize } from '@/utils/syncQueue';

function pushPendingCount(uid: string) {
  getQueueSize(uid).then((n) => useTripStore.getState().setPendingOpsCount(n));
}

export function useItinerary(tripId: string) {
  const uid = useAuthStore((s) => s.user?.uid);
  const { itinerary, setItinerary, patchItineraryDay, setCurrentItineraryTripId } = useTripStore(
    useShallow((s) => ({
      itinerary: s.itinerary,
      setItinerary: s.setItinerary,
      patchItineraryDay: s.patchItineraryDay,
      setCurrentItineraryTripId: s.setCurrentItineraryTripId,
    }))
  );
  const addToast = useUIStore((s) => s.addToast);
  const { isConnected } = useNetworkState();
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (startDate: Date, endDate: Date) => {
      if (!uid) return;

      // Show cached itinerary immediately for instant display
      const cached = await getCachedItinerary(uid, tripId);
      if (cached && cached.length > 0) {
        setItinerary(cached);
        setCurrentItineraryTripId(tripId);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const days = await getItinerary(uid, tripId);

        if (days.length > 0) {
          setItinerary(days);
          setCurrentItineraryTripId(tripId);
          // Cache real data — stubs are never cached
          await cacheItinerary(uid, tripId, days);
          await setLastSync(uid, `itinerary:${tripId}`);
        } else if (!cached || cached.length === 0) {
          // First ever load — generate day stubs from trip date range
          const stubs: ItineraryDay[] = buildItineraryDays(startDate, endDate).map((s) => ({
            ...s,
            places: [],
            journalEntries: [],
          }));
          setItinerary(stubs);
          setCurrentItineraryTripId(tripId);
          // Do not cache stubs — they carry no real data
        }
        // If days is empty but we have cache: Firestore may be offline (empty memory cache).
        // The cached data is already shown — leave it as-is.
      } catch {
        if (!cached || cached.length === 0) {
          addToast('Could not load itinerary.', 'error');
        }
        // If we showed cached data, silently continue offline
      } finally {
        setLoading(false);
      }
    },
    [uid, tripId, setItinerary, setCurrentItineraryTripId, addToast]
  );

  const addPlace = useCallback(
    async (dayId: string, place: PlaceEntry) => {
      if (!uid) return;
      const day = itinerary.find((d) => d.id === dayId);
      if (!day) return;
      const updated: ItineraryDay = { ...day, places: [...day.places, place] };
      patchItineraryDay(dayId, { places: updated.places });

      if (!isConnected) {
        const updatedItinerary = itinerary.map((d) => (d.id === dayId ? updated : d));
        await cacheItinerary(uid, tripId, updatedItinerary);
        await enqueueOp(uid, { type: 'itinerary.day', tripId, dayId, day: updated });
        pushPendingCount(uid);
        return;
      }

      await upsertItineraryDay(uid, tripId, updated).catch(() =>
        addToast('Could not save place.', 'error')
      );
    },
    [uid, tripId, itinerary, patchItineraryDay, addToast, isConnected]
  );

  const removePlace = useCallback(
    async (dayId: string, placeId: string) => {
      if (!uid) return;
      const day = itinerary.find((d) => d.id === dayId);
      if (!day) return;
      const updated: ItineraryDay = {
        ...day,
        places: day.places.filter((p) => p.id !== placeId),
      };
      patchItineraryDay(dayId, { places: updated.places });

      if (!isConnected) {
        const updatedItinerary = itinerary.map((d) => (d.id === dayId ? updated : d));
        await cacheItinerary(uid, tripId, updatedItinerary);
        await enqueueOp(uid, { type: 'itinerary.day', tripId, dayId, day: updated });
        pushPendingCount(uid);
        return;
      }

      await upsertItineraryDay(uid, tripId, updated).catch(() =>
        addToast('Could not remove place.', 'error')
      );
    },
    [uid, tripId, itinerary, patchItineraryDay, addToast, isConnected]
  );

  return { itinerary, loading, load, addPlace, removePlace };
}
