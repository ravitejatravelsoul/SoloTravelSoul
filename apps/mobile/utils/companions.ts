// Companion matching on the device: building ranked cards from raw query results, and a
// latest-only guard so a slow response for an earlier trip or account never replaces the
// current one. Cards are derived (not stored), so preference, consent and block changes
// re-rank or hide them without another query.
import { compareTravelers, rankByCompatibility, destinationKey } from '@solotravelsoul/shared';
import type { CompatibilityResult, NearbyTraveler, PlannedTrip, PublicTrip, TravelPreferences, TripWindow } from '@solotravelsoul/shared';

export interface RawMatches { travelers: NearbyTraveler[]; trips: PublicTrip[]; owners: NearbyTraveler[] }
export const EMPTY_RAW: RawMatches = { travelers: [], trips: [], owners: [] };

export type TravelerItem = { id: string; name: string; traveler: NearbyTraveler; result: CompatibilityResult };
export type TripItem = { id: string; name: string; trip: PublicTrip; owner: NearbyTraveler | null; result: CompatibilityResult };

export interface MatchContext {
  uid: string;
  blockedUids: string[];
  me: TravelPreferences;
  selected: Pick<PlannedTrip, 'id' | 'destination' | 'startDate' | 'endDate'> | null;
}

export const windowOf = (t: { destination: string | null; startDate: Date | null; endDate: Date | null }): TripWindow => ({
  destination: t.destination, destinationKey: destinationKey(t.destination), startDate: t.startDate, endDate: t.endDate,
});

/** Ranked cards for the current trip and account; results for any other destination are dropped. */
export function buildMatches(raw: RawMatches, ctx: MatchContext): { travelers: TravelerItem[]; trips: TripItem[] } {
  if (!ctx.selected) return { travelers: [], trips: [] };
  const mine = windowOf(ctx.selected);
  const hidden = (other: string) => other === ctx.uid || ctx.blockedUids.includes(other);
  const here = (key: string | null | undefined) => !!key && key === mine.destinationKey;
  const travelers = rankByCompatibility(raw.travelers
    .filter((r) => !hidden(r.uid) && here(r.destinationKey))
    .map((r) => ({
      id: r.uid, name: r.displayName, traveler: r,
      result: compareTravelers(ctx.me, r, mine, windowOf({ destination: r.destination, startDate: r.destinationStartDate, endDate: r.destinationEndDate })),
    })));
  const trips = rankByCompatibility(raw.trips
    .filter((t) => !hidden(t.ownerUid) && t.tripId !== ctx.selected!.id && here(t.destinationKey ?? destinationKey(t.destination)))
    .map((t) => {
      const owner = raw.owners.find((o) => o.uid === t.ownerUid) ?? null;
      return { id: t.tripId, name: t.title, trip: t, owner, result: compareTravelers(ctx.me, owner ?? {}, mine, windowOf(t)) };
    }));
  return { travelers, trips };
}

/** Each load takes a token; only the most recent one may update state. cancel() invalidates all. */
export function latestOnly() {
  let current = 0;
  return {
    begin: () => ++current,
    isCurrent: (token: number) => token === current,
    cancel: () => { current++; },
  };
}
