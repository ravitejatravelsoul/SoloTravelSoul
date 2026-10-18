// Keeps the traveler-discovery record (nearbyTravelers/{uid}) in step with the profile.
// The record exists only while the user is discoverable (public profile + explicit
// opt-in); what it contains is decided by discoveryRecordFields() in the shared package.
// Settings that affect it are saved together with it in one batch (setDiscoverySettings),
// and firestore.rules refuse a profile write that would leave shared data behind.
import { upsertNearbyTraveler, deleteNearbyTraveler, setDiscoverySettings, updateUserProfile } from '@solotravelsoul/firebase';
import { isDiscoverable, destinationKey } from '@solotravelsoul/shared';
import type { PlannedTrip, SharedTrip, UserProfile } from '@solotravelsoul/shared';

const startOfToday = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate());

/** The user's own trips that can be matched or shared: not archived, not over, with a destination. */
export function upcomingTrips(trips: PlannedTrip[], now = new Date()): PlannedTrip[] {
  const today = startOfToday(now);
  return trips
    .filter((t) => !t.isArchived && t.endDate >= today && !!destinationKey(t.destination))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/** The trip the user chose to show in discovery, if it is still upcoming. */
export function sharedTripFor(profile: Partial<UserProfile> | null, trips: PlannedTrip[], now = new Date()): SharedTrip | null {
  const id = profile?.discoveryTripId;
  if (!id) return null;
  const trip = upcomingTrips(trips, now).find((t) => t.id === id);
  return trip ? { destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate } : null;
}

/** Re-writes the discovery record after a profile, consent or trip change (no-op when not discoverable). */
export async function syncDiscovery(uid: string, profile: UserProfile, trips: PlannedTrip[]): Promise<void> {
  if (!isDiscoverable(profile)) return;
  await upsertNearbyTraveler(uid, profile, sharedTripFor(profile, trips));
}

/** Consent withdrawal: leaving discovery removes the record entirely. */
export async function leaveDiscovery(uid: string): Promise<void> {
  await deleteNearbyTraveler(uid);
}

/**
 * Saves discovery settings (opt-in, consent, shared trip) and the discovery record in one
 * batch. Rejects on failure: nothing changed, and the caller must say so.
 */
export async function applyDiscoverySettings(uid: string, profile: UserProfile, patch: Partial<UserProfile>, trips: PlannedTrip[]): Promise<UserProfile> {
  const next = { ...profile, ...patch } as UserProfile;
  await setDiscoverySettings(uid, profile, patch, sharedTripFor(next, trips));
  return next;
}

/** Profile save that also refreshes (or removes) the discovery record atomically when it is involved. */
export async function saveProfileWithDiscovery(uid: string, profile: UserProfile, patch: Partial<UserProfile>, trips: PlannedTrip[]): Promise<UserProfile> {
  const next = { ...profile, ...patch } as UserProfile;
  if (isDiscoverable(profile) || isDiscoverable(next)) await setDiscoverySettings(uid, profile, patch, sharedTripFor(next, trips));
  else await updateUserProfile(uid, patch);
  return next;
}

/**
 * Discovery side of a change to one of the user's trips. Only the trip the user chose to
 * show is affected (never another trip). `tripAfter` is the trip after the change, or null
 * when it was archived/deleted (its details are then removed and the choice cleared).
 * `record` says whether a discovery record is written (only while discoverable).
 */
export function tripDiscoveryUpdate(profile: UserProfile | null, tripId: string, tripAfter: PlannedTrip | null, now = new Date()):
  { profile: UserProfile; sharedTrip: SharedTrip | null; record: boolean } | undefined {
  if (!profile || !profile.discoveryTripId || profile.discoveryTripId !== tripId) return undefined;
  const live = tripAfter && !tripAfter.isArchived && tripAfter.endDate >= startOfToday(now) && destinationKey(tripAfter.destination);
  return {
    profile,
    sharedTrip: live ? { destination: tripAfter!.destination, startDate: tripAfter!.startDate, endDate: tripAfter!.endDate } : null,
    record: isDiscoverable(profile),
  };
}
