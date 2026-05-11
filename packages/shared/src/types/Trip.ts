// ── Ported from TripCoreModels.swift ─────────────────────────────────

export type PlaceCategory =
  | 'food'
  | 'attraction'
  | 'accommodation'
  | 'transport'
  | 'other';

// Manually-entered place (MVP — no external API needed)
export interface PlaceEntry {
  id: string;          // unique itinerary entry id — never reuse source ids here
  attractionId?: string; // source attraction/saved-place id (separate concept)
  name: string;
  category: PlaceCategory;
  notes: string;
}

export type JournalMood = 'amazing' | 'good' | 'okay' | 'tired' | 'challenging';

// Ported from JournalEntry in TripCoreModels.swift
export interface JournalEntry {
  id: string;
  title?: string;
  text: string;
  mood?: JournalMood;
  placeId?: string;
  placeName?: string;
  photoURL: string | null;
  createdAt: Date;
  updatedAt?: Date;
}

// Ported from ItineraryDay in TripCoreModels.swift
export interface ItineraryDay {
  id: string;
  date: Date;
  places: PlaceEntry[];
  journalEntries: JournalEntry[];
}

// Packing checklist item stored in users/{uid}/trips/{tripId}/checklist/{itemId}
export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  createdAt: Date;
}

// Ported from PlannedTrip in TripCoreModels.swift
export interface PlannedTrip {
  id: string;
  userId: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  notes: string;
  coverPhotoURL: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Derive an array of ItineraryDay stubs from trip date range
export function buildItineraryDays(
  startDate: Date,
  endDate: Date
): Omit<ItineraryDay, 'places' | 'journalEntries'>[] {
  const days: Omit<ItineraryDay, 'places' | 'journalEntries'>[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    days.push({
      id: `day-${current.toISOString().split('T')[0]}`,
      date: new Date(current),
    });
    current.setDate(current.getDate() + 1);
  }
  return days;
}
