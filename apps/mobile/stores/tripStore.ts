import { create } from 'zustand';
import type { PlannedTrip, ItineraryDay, ChecklistItem } from '@solotravelsoul/shared';

export interface SyncStatus {
  syncing: boolean;
  hasFailed: boolean;
  lastSyncedAt: Date | null;
}

interface TripState {
  trips: PlannedTrip[];
  activeTrip: PlannedTrip | null;
  itinerary: ItineraryDay[];
  currentItineraryTripId: string | null;
  checklist: ChecklistItem[];
  loading: boolean;

  /** Number of queued offline operations waiting to sync */
  pendingOpsCount: number;
  syncStatus: SyncStatus;

  setTrips: (trips: PlannedTrip[]) => void;
  setActiveTrip: (trip: PlannedTrip | null) => void;
  setItinerary: (days: ItineraryDay[]) => void;
  setCurrentItineraryTripId: (id: string | null) => void;
  setChecklist: (items: ChecklistItem[]) => void;
  setLoading: (v: boolean) => void;
  setPendingOpsCount: (n: number) => void;
  setSyncStatus: (patch: Partial<SyncStatus>) => void;

  addTrip: (trip: PlannedTrip) => void;
  patchTrip: (id: string, updates: Partial<PlannedTrip>) => void;
  removeTrip: (id: string) => void;

  patchItineraryDay: (dayId: string, updates: Partial<ItineraryDay>) => void;

  addChecklistItem: (item: ChecklistItem) => void;
  patchChecklistItem: (itemId: string, updates: Partial<ChecklistItem>) => void;
  removeChecklistItem: (itemId: string) => void;
}

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  activeTrip: null,
  itinerary: [],
  currentItineraryTripId: null,
  checklist: [],
  loading: false,
  pendingOpsCount: 0,
  syncStatus: { syncing: false, hasFailed: false, lastSyncedAt: null },

  setTrips: (trips) => set({ trips }),
  setActiveTrip: (trip) => set({ activeTrip: trip }),
  setItinerary: (itinerary) => set({ itinerary }),
  setCurrentItineraryTripId: (id) => set({ currentItineraryTripId: id }),
  setChecklist: (checklist) => set({ checklist }),
  setLoading: (loading) => set({ loading }),
  setPendingOpsCount: (pendingOpsCount) => set({ pendingOpsCount }),
  setSyncStatus: (patch) =>
    set((s) => ({ syncStatus: { ...s.syncStatus, ...patch } })),

  addTrip: (trip) => set({ trips: [trip, ...get().trips] }),

  patchTrip: (id, updates) =>
    set((state) => ({
      trips: state.trips.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      activeTrip:
        state.activeTrip?.id === id
          ? { ...state.activeTrip, ...updates }
          : state.activeTrip,
    })),

  removeTrip: (id) =>
    set((state) => ({
      trips: state.trips.filter((t) => t.id !== id),
      activeTrip: state.activeTrip?.id === id ? null : state.activeTrip,
    })),

  patchItineraryDay: (dayId, updates) =>
    set((state) => ({
      itinerary: state.itinerary.map((d) =>
        d.id === dayId ? { ...d, ...updates } : d
      ),
    })),

  addChecklistItem: (item) =>
    set((state) => ({ checklist: [...state.checklist, item] })),

  patchChecklistItem: (itemId, updates) =>
    set((state) => ({
      checklist: state.checklist.map((c) =>
        c.id === itemId ? { ...c, ...updates } : c
      ),
    })),

  removeChecklistItem: (itemId) =>
    set((state) => ({
      checklist: state.checklist.filter((c) => c.id !== itemId),
    })),
}));
