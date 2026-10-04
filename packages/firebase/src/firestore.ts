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
  startAfter,
  serverTimestamp,
  Timestamp,
  writeBatch,
  increment,
  runTransaction,
  type DocumentData,
  type QueryDocumentSnapshot,
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
  PublicProfile,
  PublicTrip,
  TripJoinRequest,
  TripMember,
  CommunityGroup,
  CommunityGroupMember,
  CommunityGroupJoinRequest,
  FeedItem,
  FeedItemType,
  NearbyTraveler,
  TravelStyle,
  Interest,
  ProfileVisibility,
  RequestStatus,
  ReportTargetType,
} from '@solotravelsoul/shared';
import { DEFAULT_USER_PROFILE, REPORT_HIDE_THRESHOLD } from '@solotravelsoul/shared';

// Use memoryLocalCache so documents fetched this session are reused if
// Firestore briefly goes offline (avoids "client is offline" on re-reads).
// initializeFirestore can only be called once per app â€” guard against HMR re-runs.
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
  } catch {
    // Fast refresh â€” already initialized, return existing instance.
    return getFirestore(app);
  }
}

export const db = createDb();

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function tsToDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function dateToTs(d: Date): Timestamp {
  return Timestamp.fromDate(d);
}

// â”€â”€ User Profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    if (isOfflineError(err)) return null; // Offline at startup â€” caller handles null profile
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

// â”€â”€ Trips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// Real-time listener â€” returns unsubscribe.
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
    if (err.code !== 'permission-denied' && err.code !== 'failed-precondition') {
      console.error('[Firestore] subscribeToTrips error:', err.code, err.message);
    }
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

// Soft delete â€” keeps data, just hides from lists.
export async function archiveTrip(uid: string, tripId: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'trips', tripId), {
    isArchived: true,
    updatedAt: serverTimestamp(),
  });
}

// â”€â”€ Itinerary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    if (isOfflineError(err)) return []; // Offline â€” caller uses local stubs from buildItineraryDays
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

// â”€â”€ Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    if (err.code !== 'permission-denied' && err.code !== 'failed-precondition') {
      console.error('[Firestore] subscribeToNotifications error:', err.code, err.message);
    }
  });
}

export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
}

// â”€â”€ Saved Places â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      // Rules not yet deployed â€” run: firebase deploy --only firestore:rules
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

// â”€â”€ Checklist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Trip Reminder Preferences â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Places Cache (Phase 2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Account Deletion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Account deletion runs server-side (R2 worker POST /account/delete) so the
// Auth identity is removed only after every cleanup step has succeeded.

// â”€â”€ Community: Public Profiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function publicProfileFromDoc(uid: string, d: DocumentData): PublicProfile {
  return {
    uid,
    displayName: (d.displayName as string) ?? '',
    photoURL: (d.photoURL as string | null) ?? null,
    bio: (d.bio as string) ?? '',
    currentCity: (d.currentCity as string) ?? '',
    homeCountry: (d.homeCountry as string) ?? '',
    languages: (d.languages as string[]) ?? [],
    travelStyles: (d.travelStyles as TravelStyle[]) ?? [],
    countriesVisited: (d.countriesVisited as string[]) ?? [],
    dreamDestinations: (d.dreamDestinations as string[]) ?? [],
    interests: (d.interests as Interest[]) ?? [],
    tripCount: (d.tripCount as number) ?? 0,
    memberSince: tsToDate(d.memberSince ?? d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  };
}

export async function getPublicProfile(uid: string): Promise<PublicProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'publicProfiles', uid));
    if (!snap.exists()) return null;
    return publicProfileFromDoc(uid, snap.data());
  } catch (err) {
    if (isOfflineError(err)) return null;
    throw err;
  }
}

export async function upsertPublicProfile(
  uid: string,
  profile: UserProfile
): Promise<void> {
  const batch = writeBatch(db);

  const communityFields = {
    travelStyles: profile.travelStyles ?? [],
    countriesVisited: profile.countriesVisited ?? [],
    interests: profile.interests ?? [],
    profileVisibility: profile.profileVisibility ?? 'private',
    showInNearbyTravelers: profile.showInNearbyTravelers ?? false,
    currentDestination: profile.currentDestination ?? null,
    tripCount: profile.tripCount ?? 0,
  };

  batch.update(doc(db, 'users', uid), {
    ...communityFields,
    updatedAt: serverTimestamp(),
  });

  const publicRef = doc(db, 'publicProfiles', uid);
  batch.set(publicRef, {
    uid,
    displayName: profile.name,
    photoURL: profile.photoURL ?? null,
    bio: profile.bio ?? '',
    currentCity: profile.city ?? '',
    homeCountry: profile.country ?? '',
    languages: profile.languages ?? [],
    travelStyles: profile.travelStyles ?? [],
    countriesVisited: profile.countriesVisited ?? [],
    dreamDestinations: profile.favoriteDestinations ?? [],
    interests: profile.interests ?? [],
    tripCount: profile.tripCount ?? 0,
    memberSince: profile.createdAt ? dateToTs(profile.createdAt) : serverTimestamp(),
    profileVisibility: profile.profileVisibility ?? 'private',
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await batch.commit();
}

export async function deletePublicProfile(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'publicProfiles', uid)).catch(() => {});
}

export async function updateProfileVisibility(
  uid: string,
  profile: UserProfile,
  visibility: ProfileVisibility
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    profileVisibility: visibility,
    updatedAt: serverTimestamp(),
  });
  // Keep relationship counters when visibility changes. Rules hide private profiles.
  await upsertPublicProfile(uid, { ...profile, profileVisibility: visibility });
  if (visibility !== 'public') {
    // Going private must also remove any stale nearbyTravelers opt-in doc —
    // otherwise the user keeps showing up in other travelers' Nearby list.
    await deleteNearbyTraveler(uid);
  }
}

// â”€â”€ Community: Public Trips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function publicTripFromDoc(id: string, d: DocumentData): PublicTrip {
  return {
    tripId: id,
    ownerUid: d.ownerUid as string,
    ownerName: (d.ownerName as string) ?? '',
    ownerPhotoURL: (d.ownerPhotoURL as string | null) ?? null,
    title: (d.title as string) ?? '',
    destination: (d.destination as string) ?? '',
    startDate: tsToDate(d.startDate),
    endDate: tsToDate(d.endDate),
    description: (d.description as string) ?? '',
    tags: (d.tags as string[]) ?? [],
    memberCount: (d.memberCount as number) ?? 1,
    maxMembers: (d.maxMembers as number | null) ?? null,
    isAcceptingMembers: (d.isAcceptingMembers as boolean) ?? true,
    coverPhotoURL: (d.coverPhotoURL as string | null) ?? null,
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  };
}

export async function setTripVisibility(
  uid: string,
  tripId: string,
  visibility: 'private' | 'public',
  publicData?: {
    title: string;
    destination: string;
    startDate: Date;
    endDate: Date;
    description: string;
    tags: string[];
    maxMembers: number | null;
    isAcceptingMembers: boolean;
    coverPhotoURL: string | null;
    ownerName: string;
    ownerPhotoURL: string | null;
    memberCount: number;
  }
): Promise<void> {
  const batch = writeBatch(db);

  batch.update(doc(db, 'users', uid, 'trips', tripId), {
    visibility,
    updatedAt: serverTimestamp(),
    ...(publicData ? {
      description: publicData.description,
      tags: publicData.tags,
      maxMembers: publicData.maxMembers,
      isAcceptingMembers: publicData.isAcceptingMembers,
      coverPhotoURL: publicData.coverPhotoURL,
    } : {}),
  });

  const publicRef = doc(db, 'publicTrips', tripId);
  if (visibility === 'public' && publicData) {
    batch.set(publicRef, {
      tripId,
      ownerUid: uid,
      ownerName: publicData.ownerName,
      ownerPhotoURL: publicData.ownerPhotoURL,
      title: publicData.title,
      destination: publicData.destination,
      startDate: dateToTs(publicData.startDate),
      endDate: dateToTs(publicData.endDate),
      description: publicData.description,
      tags: publicData.tags,
      memberCount: publicData.memberCount,
      maxMembers: publicData.maxMembers,
      isAcceptingMembers: publicData.isAcceptingMembers,
      coverPhotoURL: publicData.coverPhotoURL,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Ensure owner is in members subcollection
    batch.set(doc(db, 'trips', tripId, 'members', uid), {
      uid,
      displayName: publicData.ownerName,
      photoURL: publicData.ownerPhotoURL,
      role: 'owner',
      joinedAt: serverTimestamp(),
    });
  } else {
    batch.delete(publicRef);
  }

  await batch.commit();
}

export async function getPublicTrip(tripId: string): Promise<PublicTrip | null> {
  try {
    const snap = await getDoc(doc(db, 'publicTrips', tripId));
    if (!snap.exists()) return null;
    return publicTripFromDoc(tripId, snap.data());
  } catch (err) {
    if (isOfflineError(err)) return null;
    throw err;
  }
}

export function subscribePublicTrips(
  filters: { destination?: string; acceptingOnly?: boolean },
  pageLimit: number,
  lastDoc: QueryDocumentSnapshot | null,
  callback: (trips: PublicTrip[], last: QueryDocumentSnapshot | null) => void
): () => void {
  // where() must come before orderBy() â€” required for composite index resolution.
  // "acceptingOnly" path uses index: isAcceptingMembers ASC + createdAt DESC.
  // Default path uses single-field index on createdAt.
  let q = filters.acceptingOnly
    ? query(
        collection(db, 'publicTrips'),
        where('isAcceptingMembers', '==', true),
        orderBy('createdAt', 'desc'),
        limit(pageLimit)
      )
    : query(
        collection(db, 'publicTrips'),
        orderBy('createdAt', 'desc'),
        limit(pageLimit)
      );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  return onSnapshot(q, (snap) => {
    const trips = snap.docs.map((d) => publicTripFromDoc(d.id, d.data()));
    const last = snap.docs[snap.docs.length - 1] ?? null;
    let filtered = trips;
    if (filters.destination) {
      const dest = filters.destination.toLowerCase();
      filtered = trips.filter((t) => t.destination.toLowerCase().includes(dest));
    }
    callback(filtered, last as QueryDocumentSnapshot | null);
  }, (err) => {
    if (err.code !== 'permission-denied') {
      console.error('[Firestore] subscribePublicTrips error:', err.code, err.message);
    }
  });
}

export function subscribePublicTripMembers(
  tripId: string,
  callback: (members: TripMember[]) => void
): () => void {
  return onSnapshot(
    collection(db, 'trips', tripId, 'members'),
    (snap) => {
      callback(snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: data.uid as string,
          displayName: (data.displayName as string) ?? '',
          photoURL: (data.photoURL as string | null) ?? null,
          role: (data.role as 'owner' | 'member') ?? 'member',
          joinedAt: tsToDate(data.joinedAt),
        };
      }));
    },
    (err) => {
      console.error('[Firestore] subscribePublicTripMembers error:', err.code, err.message);
    }
  );
}

// â”€â”€ Community: Trip Join Requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function joinRequestFromDoc(d: DocumentData): TripJoinRequest {
  return {
    requestId: d.requestId as string,
    tripId: d.tripId as string,
    tripTitle: (d.tripTitle as string) ?? '',
    tripDestination: (d.tripDestination as string) ?? '',
    ownerUid: d.ownerUid as string,
    requestorUid: d.requestorUid as string,
    requestorName: (d.requestorName as string) ?? '',
    requestorPhotoURL: (d.requestorPhotoURL as string | null) ?? null,
    requestorBio: (d.requestorBio as string) ?? '',
    message: (d.message as string) ?? '',
    status: d.status as RequestStatus,
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  };
}

export async function submitTripJoinRequest(
  tripId: string,
  trip: Pick<PublicTrip, 'ownerUid' | 'destination'> & { title: string },
  requestor: UserProfile,
  message: string
): Promise<void> {
  // Block check: owner has blocked this requester
  const blockedSnap = await getDoc(doc(db, 'blocks', trip.ownerUid, 'blocked', requestor.id));
  if (blockedSnap.exists()) {
    throw Object.assign(new Error('You cannot request to join this trip.'), { code: 'community/blocked' });
  }

  const requestId = `${tripId}_${requestor.id}`;
  await setDoc(doc(db, 'tripJoinRequests', requestId), {
    requestId,
    tripId,
    tripTitle: trip.title,
    tripDestination: trip.destination,
    ownerUid: trip.ownerUid,
    requestorUid: requestor.id,
    requestorName: requestor.name,
    requestorPhotoURL: requestor.photoURL ?? null,
    requestorBio: requestor.bio ?? '',
    message: message.trim(),
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function cancelTripJoinRequest(
  requestId: string,
  requestorUid: string
): Promise<void> {
  await updateDoc(doc(db, 'tripJoinRequests', requestId), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
}

export async function approveTripJoinRequest(
  requestId: string,
  tripId: string,
  ownerUid: string,
  requestor: Pick<TripJoinRequest, 'requestorUid' | 'requestorName' | 'requestorPhotoURL'>
): Promise<void> {
  // Guard: trip capacity
  const tripSnap = await getDoc(doc(db, 'publicTrips', tripId));
  if (tripSnap.exists()) {
    const td = tripSnap.data();
    const maxMembers = td.maxMembers as number | null;
    const memberCount = (td.memberCount as number) ?? 0;
    if (maxMembers !== null && memberCount >= maxMembers) {
      throw Object.assign(new Error('Trip is full. No more members can be added.'), { code: 'community/trip-full' });
    }
  }

  // Guard: already a member (idempotent — just update request status and return)
  const memberSnap = await getDoc(doc(db, 'trips', tripId, 'members', requestor.requestorUid));
  if (memberSnap.exists()) {
    await updateDoc(doc(db, 'tripJoinRequests', requestId), { status: 'approved', updatedAt: serverTimestamp() });
    return;
  }

  const batch = writeBatch(db);

  batch.update(doc(db, 'tripJoinRequests', requestId), {
    status: 'approved',
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'trips', tripId, 'members', requestor.requestorUid), {
    uid: requestor.requestorUid,
    displayName: requestor.requestorName,
    photoURL: requestor.requestorPhotoURL ?? null,
    role: 'member',
    joinedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'publicTrips', tripId), {
    memberCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function rejectTripJoinRequest(
  requestId: string,
  ownerUid: string
): Promise<void> {
  await updateDoc(doc(db, 'tripJoinRequests', requestId), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
  });
}

export function subscribeMyJoinRequests(
  requestorUid: string,
  callback: (requests: TripJoinRequest[]) => void
): () => void {
  const q = query(
    collection(db, 'tripJoinRequests'),
    where('requestorUid', '==', requestorUid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => joinRequestFromDoc(d.data())));
  }, (err) => {
    if (err.code !== 'permission-denied' && err.code !== 'failed-precondition') {
      console.error('[Firestore] subscribeMyJoinRequests error:', err.code, err.message);
    }
  });
}

export function subscribeTripJoinRequestsForOwner(
  ownerUid: string,
  callback: (requests: TripJoinRequest[]) => void
): () => void {
  const q = query(
    collection(db, 'tripJoinRequests'),
    where('ownerUid', '==', ownerUid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => joinRequestFromDoc(d.data())));
  }, (err) => {
    if (err.code !== 'permission-denied' && err.code !== 'failed-precondition') {
      console.error('[Firestore] subscribeTripJoinRequestsForOwner error:', err.code, err.message);
    }
  });
}

export function subscribeRequestsForTrip(
  tripId: string,
  callback: (requests: TripJoinRequest[]) => void
): () => void {
  const q = query(
    collection(db, 'tripJoinRequests'),
    where('tripId', '==', tripId),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => joinRequestFromDoc(d.data())));
  }, (err) => {
    if (err.code !== 'permission-denied' && err.code !== 'failed-precondition') {
      console.error('[Firestore] subscribeRequestsForTrip error:', err.code, err.message);
    }
  });
}

export async function getTripJoinRequestStatus(
  tripId: string,
  requestorUid: string
): Promise<RequestStatus | null> {
  try {
    const requestId = `${tripId}_${requestorUid}`;
    const snap = await getDoc(doc(db, 'tripJoinRequests', requestId));
    if (!snap.exists()) return null;
    return snap.data().status as RequestStatus;
  } catch (err) {
    if (isOfflineError(err)) return null;
    // permission-denied when the doc doesn't exist yet â€” treat as no request
    if ((err as { code?: string }).code === 'permission-denied') return null;
    throw err;
  }
}

// â”€â”€ Community: Travel Groups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function travelGroupFromDoc(id: string, d: DocumentData): CommunityGroup {
  return {
    groupId: id,
    ownerUid: d.ownerUid as string,
    ownerName: (d.ownerName as string) ?? '',
    ownerPhotoURL: (d.ownerPhotoURL as string | null) ?? null,
    name: (d.name as string) ?? '',
    description: (d.description as string) ?? '',
    destination: (d.destination as string) ?? '',
    startDate: d.startDate ? tsToDate(d.startDate) : null,
    endDate: d.endDate ? tsToDate(d.endDate) : null,
    capacity: (d.capacity as number) ?? 10,
    memberCount: (d.memberCount as number) ?? 1,
    visibility: (d.visibility as 'public' | 'private') ?? 'public',
    tags: (d.tags as string[]) ?? [],
    rules: (d.rules as string) ?? '',
    chatGroupId: (d.chatGroupId as string | null) ?? null,
    isAcceptingMembers: (d.isAcceptingMembers as boolean) ?? true,
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  };
}

export async function createTravelGroup(
  uid: string,
  ownerName: string,
  ownerPhotoURL: string | null,
  data: {
    name: string;
    description: string;
    destination: string;
    startDate: Date | null;
    endDate: Date | null;
    capacity: number;
    tags: string[];
    rules: string;
  }
): Promise<string> {
  const groupRef = doc(collection(db, 'travelGroups'));
  const batch = writeBatch(db);

  batch.set(groupRef, {
    groupId: groupRef.id,
    ownerUid: uid,
    ownerName,
    ownerPhotoURL,
    ...data,
    startDate: data.startDate ? dateToTs(data.startDate) : null,
    endDate: data.endDate ? dateToTs(data.endDate) : null,
    memberCount: 1,
    visibility: 'public',
    chatGroupId: null,
    isAcceptingMembers: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'travelGroups', groupRef.id, 'members', uid), {
    uid,
    displayName: ownerName,
    photoURL: ownerPhotoURL,
    role: 'owner',
    joinedAt: serverTimestamp(),
  });

  await batch.commit();
  return groupRef.id;
}

export async function updateTravelGroup(
  groupId: string,
  uid: string,
  data: Partial<Pick<CommunityGroup, 'name' | 'description' | 'destination' | 'startDate' | 'endDate' | 'capacity' | 'tags' | 'rules' | 'isAcceptingMembers'>>
): Promise<void> {
  const payload: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() };
  if (data.startDate) payload.startDate = dateToTs(data.startDate);
  if (data.endDate) payload.endDate = dateToTs(data.endDate);
  await updateDoc(doc(db, 'travelGroups', groupId), payload);
}

export async function getTravelGroup(groupId: string): Promise<CommunityGroup | null> {
  try {
    const snap = await getDoc(doc(db, 'travelGroups', groupId));
    if (!snap.exists()) return null;
    return travelGroupFromDoc(groupId, snap.data());
  } catch (err) {
    if (isOfflineError(err)) return null;
    throw err;
  }
}

export function subscribePublicTravelGroups(
  filters: { destination?: string; acceptingOnly?: boolean },
  pageLimit: number,
  callback: (groups: CommunityGroup[]) => void
): () => void {
  const q = query(
    collection(db, 'travelGroups'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(pageLimit)
  );
  return onSnapshot(q, (snap) => {
    let groups = snap.docs.map((d) => travelGroupFromDoc(d.id, d.data()));
    if (filters.destination) {
      const dest = filters.destination.toLowerCase();
      groups = groups.filter((g) => g.destination.toLowerCase().includes(dest));
    }
    if (filters.acceptingOnly) {
      groups = groups.filter((g) => g.isAcceptingMembers && g.memberCount < g.capacity);
    }
    if (process.env.NODE_ENV !== 'production') console.log('[TravelGroups] docs:', groups.length);
    callback(groups);
  }, (err) => {
    if (err.code !== 'permission-denied' && err.code !== 'failed-precondition') {
      console.error('[Firestore] subscribePublicTravelGroups error:', err.code, err.message);
    }
  });
}

export function subscribeGroupMembers(
  groupId: string,
  callback: (members: CommunityGroupMember[]) => void
): () => void {
  return onSnapshot(
    collection(db, 'travelGroups', groupId, 'members'),
    (snap) => {
      callback(snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: data.uid as string,
          displayName: (data.displayName as string) ?? '',
          photoURL: (data.photoURL as string | null) ?? null,
          role: (data.role as 'owner' | 'admin' | 'member') ?? 'member',
          joinedAt: tsToDate(data.joinedAt),
        };
      }));
    },
    (err) => {
      console.error('[Firestore] subscribeGroupMembers error:', err.code, err.message);
    }
  );
}

function groupJoinRequestFromDoc(d: DocumentData): CommunityGroupJoinRequest {
  return {
    requestId: d.requestId as string,
    groupId: d.groupId as string,
    groupName: (d.groupName as string) ?? '',
    ownerUid: d.ownerUid as string,
    requestorUid: d.requestorUid as string,
    requestorName: (d.requestorName as string) ?? '',
    requestorPhotoURL: (d.requestorPhotoURL as string | null) ?? null,
    message: (d.message as string) ?? '',
    status: d.status as RequestStatus,
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  };
}

export async function submitGroupJoinRequest(
  groupId: string,
  groupName: string,
  ownerUid: string,
  requestor: UserProfile,
  message: string
): Promise<void> {
  // Block check: owner has blocked this requester
  const blockedSnap = await getDoc(doc(db, 'blocks', ownerUid, 'blocked', requestor.id));
  if (blockedSnap.exists()) {
    throw Object.assign(new Error('You cannot request to join this group.'), { code: 'community/blocked' });
  }

  const requestId = `${groupId}_${requestor.id}`;
  await setDoc(doc(db, 'groupJoinRequests', requestId), {
    requestId,
    groupId,
    groupName,
    ownerUid,
    requestorUid: requestor.id,
    requestorName: requestor.name,
    requestorPhotoURL: requestor.photoURL ?? null,
    message: message.trim(),
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function approveGroupJoinRequest(
  requestId: string,
  groupId: string,
  requestor: Pick<CommunityGroupJoinRequest, 'requestorUid' | 'requestorName' | 'requestorPhotoURL'>
): Promise<void> {
  // Guard: group capacity
  const groupSnap = await getDoc(doc(db, 'travelGroups', groupId));
  if (groupSnap.exists()) {
    const gd = groupSnap.data();
    const capacity = (gd.capacity as number) ?? 10;
    const memberCount = (gd.memberCount as number) ?? 0;
    if (memberCount >= capacity) {
      throw Object.assign(new Error('Group is full. No more members can be added.'), { code: 'community/group-full' });
    }
  }

  // Guard: already a member (idempotent)
  const memberSnap = await getDoc(doc(db, 'travelGroups', groupId, 'members', requestor.requestorUid));
  if (memberSnap.exists()) {
    await updateDoc(doc(db, 'groupJoinRequests', requestId), { status: 'approved', updatedAt: serverTimestamp() });
    return;
  }

  const batch = writeBatch(db);

  batch.update(doc(db, 'groupJoinRequests', requestId), {
    status: 'approved',
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'travelGroups', groupId, 'members', requestor.requestorUid), {
    uid: requestor.requestorUid,
    displayName: requestor.requestorName,
    photoURL: requestor.requestorPhotoURL ?? null,
    role: 'member',
    joinedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'travelGroups', groupId), {
    memberCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function rejectGroupJoinRequest(
  requestId: string,
  ownerUid: string
): Promise<void> {
  await updateDoc(doc(db, 'groupJoinRequests', requestId), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
  });
}

export async function removeGroupMember(
  groupId: string,
  memberUid: string,
  ownerUid: string
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'travelGroups', groupId, 'members', memberUid));
  batch.update(doc(db, 'travelGroups', groupId), {
    memberCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'travelGroups', groupId, 'members', uid));
  batch.update(doc(db, 'travelGroups', groupId), {
    memberCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export function subscribeGroupJoinRequestsForOwner(
  ownerUid: string,
  callback: (requests: CommunityGroupJoinRequest[]) => void
): () => void {
  const q = query(
    collection(db, 'groupJoinRequests'),
    where('ownerUid', '==', ownerUid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => groupJoinRequestFromDoc(d.data())));
  }, (err) => {
    if (err.code !== 'permission-denied' && err.code !== 'failed-precondition') {
      console.error('[Firestore] subscribeGroupJoinRequestsForOwner error:', err.code, err.message);
    }
  });
}

export function subscribeMyGroupJoinRequests(
  requestorUid: string,
  callback: (requests: CommunityGroupJoinRequest[]) => void
): () => void {
  const q = query(
    collection(db, 'groupJoinRequests'),
    where('requestorUid', '==', requestorUid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => groupJoinRequestFromDoc(d.data())));
  }, (err) => {
    if (err.code !== 'permission-denied' && err.code !== 'failed-precondition') {
      console.error('[Firestore] subscribeMyGroupJoinRequests error:', err.code, err.message);
    }
  });
}

export async function getGroupJoinRequestStatus(
  groupId: string,
  requestorUid: string
): Promise<RequestStatus | null> {
  try {
    const requestId = `${groupId}_${requestorUid}`;
    const snap = await getDoc(doc(db, 'groupJoinRequests', requestId));
    if (!snap.exists()) return null;
    return snap.data().status as RequestStatus;
  } catch (err) {
    if (isOfflineError(err)) return null;
    if ((err as { code?: string }).code === 'permission-denied') return null;
    throw err;
  }
}

// â”€â”€ Community: Nearby Travelers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function nearbyTravelerFromDoc(d: DocumentData): NearbyTraveler {
  return {
    uid: d.uid as string,
    displayName: (d.displayName as string) ?? '',
    photoURL: (d.photoURL as string | null) ?? null,
    currentCity: (d.currentCity as string) ?? '',
    travelStyles: (d.travelStyles as TravelStyle[]) ?? [],
    destination: (d.destination as string | null) ?? null,
    destinationStartDate: d.destinationStartDate ? tsToDate(d.destinationStartDate) : null,
    destinationEndDate: d.destinationEndDate ? tsToDate(d.destinationEndDate) : null,
    updatedAt: tsToDate(d.updatedAt),
  };
}

export async function upsertNearbyTraveler(
  uid: string,
  profile: UserProfile
): Promise<void> {
  await setDoc(doc(db, 'nearbyTravelers', uid), {
    uid,
    displayName: profile.name,
    photoURL: profile.photoURL ?? null,
    currentCity: profile.city ?? '',
    travelStyles: profile.travelStyles ?? [],
    destination: profile.currentDestination ?? null,
    destinationStartDate: null,
    destinationEndDate: null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteNearbyTraveler(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'nearbyTravelers', uid)).catch(() => {});
}

export function subscribeNearbyTravelers(
  city: string,
  callback: (travelers: NearbyTraveler[]) => void
): () => void {
  const q = query(
    collection(db, 'nearbyTravelers'),
    where('currentCity', '==', city),
    orderBy('updatedAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    if (process.env.NODE_ENV !== 'production') console.log('[NearbyTravelers] city:', city, '| docs:', snap.docs.length);
    callback(snap.docs.map((d) => nearbyTravelerFromDoc(d.data())));
  }, (err) => {
    if (err.code !== 'permission-denied' && err.code !== 'failed-precondition') {
      console.error('[Firestore] subscribeNearbyTravelers error:', err.code, err.message);
    }
  });
}

export function subscribeDestinationTravelers(
  destination: string,
  callback: (travelers: NearbyTraveler[]) => void
): () => void {
  const q = query(
    collection(db, 'nearbyTravelers'),
    where('destination', '==', destination),
    orderBy('updatedAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => nearbyTravelerFromDoc(d.data())));
  }, (err) => {
    if (err.code !== 'permission-denied' && err.code !== 'failed-precondition') {
      console.error('[Firestore] subscribeDestinationTravelers error:', err.code, err.message);
    }
  });
}

// â”€â”€ Community: Activity Feed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function feedItemFromDoc(d: DocumentData): FeedItem {
  return {
    feedItemId: d.feedItemId as string,
    type: d.type as FeedItemType,
    actorUid: d.actorUid as string,
    actorName: (d.actorName as string) ?? '',
    actorPhotoURL: (d.actorPhotoURL as string | null) ?? null,
    targetId: d.targetId as string,
    targetType: d.targetType as 'trip' | 'group' | 'memory',
    targetTitle: (d.targetTitle as string) ?? '',
    targetDestination: (d.targetDestination as string | null) ?? null,
    visibility: 'public',
    createdAt: tsToDate(d.createdAt),
  };
}

export async function addFeedItem(
  actorUid: string,
  actorName: string,
  actorPhotoURL: string | null,
  type: FeedItemType,
  targetId: string,
  targetType: 'trip' | 'group' | 'memory',
  targetTitle: string,
  targetDestination: string | null
): Promise<void> {
  const ref = doc(collection(db, 'activityFeed'));
  await setDoc(ref, {
    feedItemId: ref.id,
    actorUid,
    actorName,
    actorPhotoURL,
    type,
    targetId,
    targetType,
    targetTitle,
    targetDestination,
    visibility: 'public',
    createdAt: serverTimestamp(),
  });
}

export function subscribeActivityFeed(
  pageLimit: number,
  callback: (items: FeedItem[]) => void
): () => void {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const q = query(
    collection(db, 'activityFeed'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(pageLimit)
  );
  return onSnapshot(q, (snap) => {
    if (process.env.NODE_ENV !== 'production') console.log('[CommunityFeed] docs:', snap.docs.length);
    callback(snap.docs.map((d) => feedItemFromDoc(d.data())));
  }, (err) => {
    if (err.code !== 'permission-denied' && err.code !== 'failed-precondition') {
      console.error('[Firestore] subscribeActivityFeed error:', err.code, err.message);
    }
  });
}

export async function deleteFeedItem(feedItemId: string, actorUid: string): Promise<void> {
  await deleteDoc(doc(db, 'activityFeed', feedItemId)).catch(() => {});
}

// Cascade a new photoURL to every community document the user owns.
// Called after profile photo upload so travelGroups and publicTrips
// always reflect the current avatar — not a stale Firebase Storage URL.
export async function updateOwnerPhotoInCommunityDocs(
  uid: string,
  photoURL: string | null
): Promise<void> {
  const [groupsSnap, tripsSnap] = await Promise.all([
    getDocs(query(collection(db, 'travelGroups'), where('ownerUid', '==', uid))),
    getDocs(query(collection(db, 'publicTrips'), where('ownerUid', '==', uid))),
  ]);

  if (groupsSnap.empty && tripsSnap.empty) return;

  const batch = writeBatch(db);
  for (const d of groupsSnap.docs) {
    batch.update(d.ref, { ownerPhotoURL: photoURL ?? null, updatedAt: serverTimestamp() });
  }
  for (const d of tripsSnap.docs) {
    batch.update(d.ref, { ownerPhotoURL: photoURL ?? null, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}


// â”€â”€ Community: Block / Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function blockUser(blockerUid: string, blockedUid: string): Promise<void> {
  await setDoc(doc(db, 'blocks', blockerUid, 'blocked', blockedUid), {
    blockedUid,
    blockedAt: serverTimestamp(),
  });
}

export async function unblockUser(blockerUid: string, blockedUid: string): Promise<void> {
  await deleteDoc(doc(db, 'blocks', blockerUid, 'blocked', blockedUid)).catch(() => {});
}

export function subscribeBlockList(
  uid: string,
  callback: (blockedUids: string[]) => void
): () => void {
  return onSnapshot(
    collection(db, 'blocks', uid, 'blocked'),
    (snap) => {
      callback(snap.docs.map((d) => d.id));
    },
    (err) => {
      if (err.code !== 'permission-denied') {
        console.error('[Firestore] subscribeBlockList error:', err.code, err.message);
      }
      callback([]);
    }
  );
}

export async function isBlocked(blockerUid: string, blockedUid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'blocks', blockerUid, 'blocked', blockedUid));
    return snap.exists();
  } catch {
    return false;
  }
}

/**
 * One report per reporter and target (deterministic ID; repeating is a no-op).
 * Reports on posts and journals also increment the item's reportCount in the
 * same transaction; at REPORT_HIDE_THRESHOLD a public item is hidden as
 * 'under_review' until a moderator restores or removes it (enforced by rules).
 */
export async function reportContent(
  reporterUid: string,
  targetType: ReportTargetType,
  targetId: string,
  reason: 'spam' | 'inappropriate' | 'harassment' | 'fake' | 'safety' | 'other',
  details: string
): Promise<void> {
  const reportRef = doc(db, 'reports', `${targetType}___${targetId}___${reporterUid}`);
  const counted = targetType === 'post' ? 'travelPosts' : targetType === 'journal' ? 'travelJournals' : null;
  await runTransaction(db, async (tx) => {
    if ((await tx.get(reportRef)).exists()) return;
    const targetRef = counted ? doc(db, counted, targetId) : null;
    const target = targetRef ? await tx.get(targetRef) : null;
    tx.set(reportRef, {
      reporterUid,
      targetType,
      targetId,
      reason,
      details: details.trim(),
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    if (targetRef && target?.exists()) {
      const next = ((target.data().reportCount as number | undefined) ?? 0) + 1;
      const hide = next >= REPORT_HIDE_THRESHOLD && (target.data().visibility ?? 'public') === 'public';
      tx.update(targetRef, hide ? { reportCount: next, visibility: 'under_review' } : { reportCount: next });
    }
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

