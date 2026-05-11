import { useEffect, useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  subscribeToTrips,
  createTrip as fbCreateTrip,
  updateTrip as fbUpdateTrip,
  archiveTrip as fbArchiveTrip,
} from '@solotravelsoul/firebase';
import type { PlannedTrip } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useUIStore } from '@/stores/uiStore';
import { cacheTrips, getCachedTrips, setLastSync } from '@/utils/offlineCache';

export function useTrips() {
  const uid = useAuthStore((s) => s.user?.uid);
  const { trips, loading, setTrips, setLoading, patchTrip, removeTrip } =
    useTripStore(
      useShallow((s) => ({
        trips: s.trips,
        loading: s.loading,
        setTrips: s.setTrips,
        setLoading: s.setLoading,
        patchTrip: s.patchTrip,
        removeTrip: s.removeTrip,
      }))
    );
  const addToast = useUIStore((s) => s.addToast);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!uid) return;

    // Hydrate from cache immediately for instant cold-start display
    getCachedTrips(uid).then((cached) => {
      if (cached && cached.length > 0 && useTripStore.getState().trips.length === 0) {
        setTrips(cached);
      }
    });

    setLoading(true);
    const unsub = subscribeToTrips(uid, async (data) => {
      setTrips(data);
      setLoading(false);
      // Keep cache fresh so next cold-start is instant
      await cacheTrips(uid, data);
      await setLastSync(uid, 'trips');
    });
    return unsub;
  }, [uid]);

  // onSnapshot is real-time, so "refresh" just shows the indicator briefly.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setRefreshing(false);
  }, []);

  const createTrip = useCallback(
    async (
      trip: Omit<PlannedTrip, 'id' | 'userId' | 'isArchived' | 'createdAt' | 'updatedAt'>
    ) => {
      if (!uid) return null;
      try {
        const id = await fbCreateTrip(uid, trip);
        return id;
      } catch {
        addToast('Could not create trip.', 'error');
        return null;
      }
    },
    [uid, addToast]
  );

  const updateTrip = useCallback(
    async (
      id: string,
      updates: Partial<
        Pick<PlannedTrip, 'destination' | 'startDate' | 'endDate' | 'notes' | 'coverPhotoURL'>
      >
    ) => {
      if (!uid) return;
      try {
        await fbUpdateTrip(uid, id, updates);
        patchTrip(id, updates);
      } catch {
        addToast('Could not update trip.', 'error');
      }
    },
    [uid, patchTrip, addToast]
  );

  const deleteTrip = useCallback(
    async (id: string) => {
      if (!uid) return;
      try {
        await fbArchiveTrip(uid, id);
        removeTrip(id);
        addToast('Trip deleted.', 'success');
      } catch {
        addToast('Could not delete trip.', 'error');
      }
    },
    [uid, removeTrip, addToast]
  );

  const upcoming = trips.filter((t) => t.endDate >= new Date());
  const past = trips.filter((t) => t.endDate < new Date());

  return { trips, upcoming, past, loading, refreshing, refresh, createTrip, updateTrip, deleteTrip };
}
