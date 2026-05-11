import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';
import { app } from './config';

function isOfflineError(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  // 'unavailable' = Firestore offline; 'failed-precondition' can also mean offline in some SDK versions
  return code === 'unavailable' || code === 'failed-precondition';
}
import type {
  UserProfile,
  PlannedTrip,
  ItineraryDay,
  JournalEntry,
  PlaceEntry,
  AppNotification,
  SavedPlace,
  ChecklistItem,
  CachedPlace,
  TripReminderPrefs,
} from '@solotravelsoul/shared';
import { DEFAULT_USER_PROFILE } from '@solotravelsoul/shared';

// Use memoryLocalCache so documents fetched this session are reused if
// Firestore briefly goes offline (avoids "client is offline" on re-reads).
// initializeFirestore can only be called once per app — guard against HMR re-runs.
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
  } catch {
    // Fast refresh — already initialized, return existing instance.
    return getFirestore(app);
  }
}

export const db = createDb();

// ── Helpers ───────────────────────────────────────────────────────────

function tsToDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function dateToTs(d: Date): Timestamp {
  return Timestamp.fromDate(d);
}

// ── User Profile ──────────────────────────────────────────────────────

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      ...(d as DocumentData),
      id: uid,
      createdAt: tsToDate(d.createdAt),
      updatedAt: tsToDate(d.updatedAt),
    } as UserProfile;
  } catch (err) {
    if (isOfflineError(err)) return null; // Offline at startup — caller handles null profile
    throw err;
  }
}

export async function createUserProfile(
  uid: string,
  data: { email: string; name: string }
): Promise<void> {
  await setDoc(doc(db, 'users', uid), {
    ...DEFAULT_USER_PROFILE,
    ...data,
    id: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<Omit<UserProfile, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

// ── Trips ─────────────────────────────────────────────────────────────

function tripFromDoc(id: string, d: DocumentData): PlannedTrip {
  return {
    ...(d as PlannedTrip),
    id,
    startDate: tsToDate(d.startDate),
    endDate: tsToDate(d.endDate),
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  };
}

// Real-time listener — returns unsubscribe.
export function subscribeToTrips(
  uid: string,
  callback: (trips: PlannedTrip[]) => void
): () => void {
  const q = query(
    collection(db, 'users', uid, 'trips'),
    where('isArchived', '==', false),
    orderBy('startDate', 'desc'),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => tripFromDoc(d.id, d.data())));
  }, (err) => {
    console.error('[Firestore] subscribeToTrips error:', err.code, err.message);
  });
}

export async function createTrip(
  uid: string,
  trip: Omit<PlannedTrip, 'id' | 'userId' | 'isArchived' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = doc(collection(db, 'users', uid, 'trips'));
  await setDoc(ref, {
    ...trip,
    userId: uid,
    isArchived: false,
    startDate: dateToTs(trip.startDate),
    endDate: dateToTs(trip.endDate),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTrip(
  uid: string,
  tripId: string,
  updates: Partial<
    Pick<PlannedTrip, 'destination' | 'startDate' | 'endDate' | 'notes' | 'coverPhotoURL'>
  >
): Promise<void> {
  const payload: Record<string, unknown> = { ...updates, updatedAt: serverTimestamp() };
  if (updates.startDate) payload.startDate = dateToTs(updates.startDate);
  if (updates.endDate) payload.endDate = dateToTs(updates.endDate);
  await updateDoc(doc(db, 'users', uid, 'trips', tripId), payload);
}

// Soft delete — keeps data, just hides from lists.
export async function archiveTrip(uid: string, tripId: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'trips', tripId), {
    isArchived: true,
    updatedAt: serverTimestamp(),
  });
}

// ── Itinerary ─────────────────────────────────────────────────────────

function journalFromRaw(j: DocumentData): JournalEntry {
  return {
    id: j.id as string,
    ...(j.title !== undefined && { title: j.title as string }),
    text: j.text as string,
    ...(j.mood !== undefined && { mood: j.mood as JournalEntry['mood'] }),
    ...(j.placeId !== undefined && { placeId: j.placeId as string }),
    ...(j.placeName !== undefined && { placeName: j.placeName as string }),
    photoURL: (j.photoURL as string | null) ?? null,
    createdAt: tsToDate(j.createdAt),
    ...(j.updatedAt !== undefined && { updatedAt: tsToDate(j.updatedAt) }),
  };
}

export async function getItinerary(
  uid: string,
  tripId: string
): Promise<ItineraryDay[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'trips', tripId, 'itinerary'),
        orderBy('date', 'asc')
      )
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        date: tsToDate(data.date),
        places: (data.places ?? []) as PlaceEntry[],
        journalEntries: ((data.journalEntries ?? []) as DocumentData[]).map(journalFromRaw),
      } as ItineraryDay;
    });
  } catch (err) {
    if (isOfflineError(err)) return []; // Offline — caller uses local stubs from buildItineraryDays
    throw err;
  }
}

export async function upsertItineraryDay(
  uid: string,
  tripId: string,
  day: ItineraryDay
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'trips', tripId, 'itinerary', day.id),
    {
      date: dateToTs(day.date),
      places: day.places,
      journalEntries: day.journalEntries.map((j) => ({
        id: j.id,
        ...(j.title !== undefined && { title: j.title }),
        text: j.text,
        ...(j.mood !== undefined && { mood: j.mood }),
        ...(j.placeId !== undefined && { placeId: j.placeId }),
        ...(j.placeName !== undefined && { placeName: j.placeName }),
        photoURL: j.photoURL,
        createdAt: dateToTs(j.createdAt),
        ...(j.updatedAt !== undefined && { updatedAt: dateToTs(j.updatedAt) }),
      })),
    }
  );
}

// ── Notifications ─────────────────────────────────────────────────────

export function subscribeToNotifications(
  uid: string,
  callback: (notifications: AppNotification[]) => void
): () => void {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          ...(data as AppNotification),
          id: d.id,
          createdAt: tsToDate(data.createdAt),
        };
      })
    );
  }, (err) => {
    console.error('[Firestore] subscribeToNotifications error:', err.code, err.message);
  });
}

export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
}

// ── Saved Places ──────────────────────────────────────────────────────

export function subscribeSavedPlaces(
  uid: string,
  callback: (places: SavedPlace[]) => void
): () => void {
  const q = query(
    collection(db, 'users', uid, 'saved_places'),
    orderBy('savedAt', 'desc'),
    limit(200)
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({
        ...(d.data() as SavedPlace),
        id: d.id,
        savedAt: tsToDate(d.data().savedAt),
      }))
    );
  }, (err) => {
    if (err.code === 'permission-denied') {
      // Rules not yet deployed — run: firebase deploy --only firestore:rules
      console.warn('[Firestore] subscribeSavedPlaces: permission-denied. Deploy rules first.');
    } else {
      console.error('[Firestore] subscribeSavedPlaces error:', err.code, err.message);
    }
  });
}

export async function savePlace(
  uid: string,
  place: Omit<SavedPlace, 'id' | 'userId' | 'savedAt'>
): Promise<string> {
  const ref = doc(collection(db, 'users', uid, 'saved_places'));
  await setDoc(ref, {
    ...place,
    userId: uid,
    savedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function unsavePlace(uid: string, placeId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'saved_places', placeId));
}

// ── Checklist ─────────────────────────────────────────────────────────

export async function getChecklist(uid: string, tripId: string): Promise<ChecklistItem[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'trips', tripId, 'checklist'),
        orderBy('createdAt', 'asc')
      )
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        text: data.text as string,
        checked: data.checked as boolean,
        createdAt: tsToDate(data.createdAt),
      };
    });
  } catch (err) {
    if (isOfflineError(err)) return [];
    throw err;
  }
}

export async function upsertChecklistItem(
  uid: string,
  tripId: string,
  item: ChecklistItem
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'trips', tripId, 'checklist', item.id),
    {
      text: item.text,
      checked: item.checked,
      createdAt: dateToTs(item.createdAt),
    }
  );
}

export async function deleteChecklistItem(
  uid: string,
  tripId: string,
  itemId: string
): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'trips', tripId, 'checklist', itemId));
}

// ── Trip Reminder Preferences ─────────────────────────────────────────
// Stored at users/{uid}/trips/{tripId}/reminders/prefs (single doc).
// Notification IDs are device-local (AsyncStorage) and not stored here.

export async function getTripReminderPrefs(
  uid: string,
  tripId: string
): Promise<TripReminderPrefs | null> {
  try {
    const snap = await getDoc(
      doc(db, 'users', uid, 'trips', tripId, 'reminders', 'prefs')
    );
    if (!snap.exists()) return null;
    const d = snap.data();
    return { ...(d as TripReminderPrefs), tripId, updatedAt: tsToDate(d.updatedAt) };
  } catch (err) {
    if (isOfflineError(err)) return null;
    throw err;
  }
}

export async function setTripReminderPrefs(
  uid: string,
  tripId: string,
  prefs: Omit<TripReminderPrefs, 'tripId' | 'updatedAt'>
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'trips', tripId, 'reminders', 'prefs'),
    { ...prefs, tripId, updatedAt: serverTimestamp() }
  );
}

// ── Places Cache (Phase 2) ────────────────────────────────────────────
// Stores Foursquare API results at /places_cache/{fsq_id} so the same
// place is never fetched from the API twice. TTL = 7 days, checked by
// the caller (cachedAt timestamp comparison before calling these fns).

export async function getCachedPlace(fsqId: string): Promise<CachedPlace | null> {
  try {
    const snap = await getDoc(doc(db, 'places_cache', fsqId));
    if (!snap.exists()) return null;
    const d = snap.data();
    return { ...(d as DocumentData), id: snap.id, cachedAt: tsToDate(d.cachedAt) } as CachedPlace;
  } catch (err) {
    if (isOfflineError(err)) return null;
    throw err;
  }
}

export async function upsertCachedPlace(place: CachedPlace): Promise<void> {
  await setDoc(doc(db, 'places_cache', place.id), {
    ...place,
    cachedAt: dateToTs(place.cachedAt),
  });
}

// Firestore has no full-text search, so we fetch the most recently cached
// places and filter client-side. Works for Phase 2 since the cache is small.
export async function searchCachedPlaces(
  searchQuery: string,
  maxResults = 10
): Promise<CachedPlace[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'places_cache'),
        orderBy('cachedAt', 'desc'),
        limit(maxResults * 4)
      )
    );
    const q = searchQuery.trim().toLowerCase();
    return snap.docs
      .map((d) => {
        const data = d.data();
        return { ...(data as DocumentData), id: d.id, cachedAt: tsToDate(data.cachedAt) } as CachedPlace;
      })
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      )
      .slice(0, maxResults);
  } catch (err) {
    if (isOfflineError(err)) return [];
    throw err;
  }
}
