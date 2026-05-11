import { useMemo } from 'react';
import type { PlannedTrip, ItineraryDay, ChecklistItem } from '@solotravelsoul/shared';
import {
  getPackingSuggestions,
  type PackingSuggestion,
  type TripContext,
} from '@/utils/packingSuggestions';

export type { PackingSuggestion, TripContext };

export function usePackingSuggestions(
  trip: PlannedTrip | undefined,
  itinerary: ItineraryDay[],
  checklist: ChecklistItem[]
): { suggestions: PackingSuggestion[]; context: TripContext } {
  return useMemo(() => {
    if (!trip) return { suggestions: [], context: { categories: [], labels: [] } };
    return getPackingSuggestions(trip, itinerary, checklist);
  }, [trip, itinerary, checklist]);
}
