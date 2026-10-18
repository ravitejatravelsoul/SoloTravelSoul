// Keeps the traveler-discovery record (nearbyTravelers/{uid}) in step with the profile.
// The record exists only while the user is discoverable (public profile + explicit
// opt-in); what it contains is decided by discoveryRecordFields() in the shared package.
import { upsertNearbyTraveler, deleteNearbyTraveler } from '@solotravelsoul/firebase';
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
