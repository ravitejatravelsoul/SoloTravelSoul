import { useCallback, useState } from 'react';
import { getItinerary, upsertItineraryDay } from '@solotravelsoul/firebase';
import type { PlaceEntry, ItineraryDay } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

interface DayRef {
  id: string;
  date: Date;
}

export function useAddToTrip() {
  const uid = useAuthStore((s) => s.user?.uid);
  const addToast = useUIStore((s) => s.addToast);
  const [loading, setLoading] = useState(false);

  // Loads the target day from Firestore, appends the place, writes back.
  // One read + one write per call — only triggered on explicit user action.
  const addPlaceToDay = useCallback(
    async (tripId: string, dayRef: DayRef, place: PlaceEntry): Promise<boolean> => {
      if (!uid) return false;
      setLoading(true);
      try {
        const existingDays = await getItinerary(uid, tripId);
        const existingDay = existingDays.find((d) => d.id === dayRef.id);
        const day: ItineraryDay = existingDay ?? {
          id: dayRef.id,
          date: dayRef.date,
          places: [],
          journalEntries: [],
        };
        await upsertItineraryDay(uid, tripId, {
          ...day,
          places: [...day.places, place],
        });
        addToast('Added to itinerary!', 'success');
        return true;
      } catch {
        addToast('Could not add to itinerary.', 'error');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [uid, addToast]
  );

  return { addPlaceToDay, loading };
}
