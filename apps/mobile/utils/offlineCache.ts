import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlannedTrip, ItineraryDay, ChecklistItem, SavedPlace } from '@solotravelsoul/shared';

// ── Key builders ──────────────────────────────────────────────────────

const K = {
  trips:       (uid: string)                 => `@sts:trips:${uid}`,
  itinerary:   (uid: string, tripId: string) => `@sts:itinerary:${uid}:${tripId}`,
  checklist:   (uid: string, tripId: string) => `@sts:checklist:${uid}:${tripId}`,
  savedPlaces: (uid: string)                 => `@sts:savedplaces:${uid}`,
  lastSync:    (uid: string)                 => `@sts:lastsync:${uid}`,
};

// ── Date reviver ──────────────────────────────────────────────────────

function revive(v: unknown): unknown {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v);
  if (Array.isArray(v)) return v.map(revive);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, revive(val)])
    );
  }
  return v;
}

// ── Typed helpers ─────────────────────────────────────────────────────

async function get<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return revive(JSON.parse(raw)) as T;
  } catch {
    return null;
  }
}

async function put<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — silently skip cache write
  }
}

// ── Trips ─────────────────────────────────────────────────────────────

export const cacheTrips    = (uid: string, trips: PlannedTrip[]) => put(K.trips(uid), trips);
export const getCachedTrips = (uid: string) => get<PlannedTrip[]>(K.trips(uid));

// ── Itinerary ─────────────────────────────────────────────────────────

export const cacheItinerary    = (uid: string, tripId: string, days: ItineraryDay[]) =>
  put(K.itinerary(uid, tripId), days);
export const getCachedItinerary = (uid: string, tripId: string) =>
  get<ItineraryDay[]>(K.itinerary(uid, tripId));

// ── Checklist ─────────────────────────────────────────────────────────

export const cacheChecklist    = (uid: string, tripId: string, items: ChecklistItem[]) =>
  put(K.checklist(uid, tripId), items);
export const getCachedChecklist = (uid: string, tripId: string) =>
  get<ChecklistItem[]>(K.checklist(uid, tripId));

// ── Saved places ──────────────────────────────────────────────────────

export const cacheSavedPlaces    = (uid: string, places: SavedPlace[]) =>
  put(K.savedPlaces(uid), places);
export const getCachedSavedPlaces = (uid: string) =>
  get<SavedPlace[]>(K.savedPlaces(uid));

// ── Last-sync timestamps ──────────────────────────────────────────────

export async function setLastSync(uid: string, resource: string): Promise<void> {
  const map = (await get<Record<string, number>>(K.lastSync(uid))) ?? {};
  map[resource] = Date.now();
  await put(K.lastSync(uid), map);
}

export async function getLastSyncs(uid: string): Promise<Record<string, number>> {
  return (await get<Record<string, number>>(K.lastSync(uid))) ?? {};
}

export async function getLatestSyncTime(uid: string): Promise<Date | null> {
  const map = await getLastSyncs(uid);
  const timestamps = Object.values(map);
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}
