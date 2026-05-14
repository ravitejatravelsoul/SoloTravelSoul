import { useEffect, useState, useCallback } from 'react';
import {
  subscribeSavedPlaces,
  savePlace as fbSavePlace,
  unsavePlace as fbUnsavePlace,
} from '@solotravelsoul/firebase';
import type { SavedPlace } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { getCachedSavedPlaces, cacheSavedPlaces, setLastSync } from '@/utils/offlineCache';

export function useSavedPlaces() {
  const uid = useAuthStore((s) => s.user?.uid);
  const addToast = useUIStore((s) => s.addToast);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }

    // Hydrate from cache for cold-start display before subscription fires
    getCachedSavedPlaces(uid).then((cached) => {
      if (cached && cached.length > 0) {
        setSavedPlaces(cached);
        setLoading(false);
      }
    });

    setLoading(true);
    const unsub = subscribeSavedPlaces(uid, async (places) => {
      setSavedPlaces(places);
      setLoading(false);
      // Keep cache fresh
      await cacheSavedPlaces(uid, places);
      await setLastSync(uid, 'savedPlaces');
    });
    return unsub;
  }, [uid]);

  const savePlace = useCallback(
    async (place: Omit<SavedPlace, 'id' | 'userId' | 'savedAt'>) => {
      if (!uid) return;
      try {
        await fbSavePlace(uid, place);
        addToast('Place saved.', 'success');
      } catch {
        addToast('Could not save place.', 'error');
      }
    },
    [uid, addToast]
  );

  const unsavePlace = useCallback(
    async (placeId: string) => {
      if (!uid) return;
      // Optimistic removal
      setSavedPlaces((prev) => prev.filter((p) => p.id !== placeId));
      try {
        await fbUnsavePlace(uid, placeId);
      } catch {
        addToast('Could not remove saved place.', 'error');
      }
    },
    [uid, addToast]
  );

  const isSaved = useCallback(
    (localId: string) => savedPlaces.some((p) => p.localId === localId),
    [savedPlaces]
  );

  const getSavedId = useCallback(
    (localId: string) => savedPlaces.find((p) => p.localId === localId)?.id ?? null,
    [savedPlaces]
  );

  const isSavedByFsqId = useCallback(
    (fsqId: string) => savedPlaces.some((p) => p.fsqId === fsqId),
    [savedPlaces]
  );

  const getSavedIdByFsqId = useCallback(
    (fsqId: string) => savedPlaces.find((p) => p.fsqId === fsqId)?.id ?? null,
    [savedPlaces]
  );

  return { savedPlaces, loading, savePlace, unsavePlace, isSaved, getSavedId, isSavedByFsqId, getSavedIdByFsqId };
}
