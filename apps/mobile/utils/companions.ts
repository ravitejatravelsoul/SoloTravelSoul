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

export interface LoadContext { uid: string; discoverable: boolean; selected: MatchContext['selected'] }
export interface LoadState { raw: RawMatches; loading: boolean; error: boolean }

/**
 * What the queries depend on: account, discoverability and the selected trip's destination.
 * Not the trip ID or dates — a destination edit on the same trip queries again; a date-only
 * edit does not (buildMatches recomputes overlap from the same results).
 */
export function matchQueryKey(ctx: LoadContext): string | null {
  const key = ctx.selected ? destinationKey(ctx.selected.destination) : null;
  return ctx.uid && key ? `${ctx.uid}|${ctx.discoverable ? 1 : 0}|${key}` : null;
}

/**
 * Runs the bounded companion queries when the query key changes (or on refresh), clears old
 * cards as a load starts, and lets only the latest load update state (older responses and
 * errors are ignored). cancel() stops all updates, e.g. when leaving the screen.
 */
export function createMatchLoader(fetchRaw: (ctx: LoadContext & { selected: NonNullable<LoadContext['selected']> }) => Promise<RawMatches>, set: (state: LoadState) => void) {
  const guard = latestOnly();
  let lastKey: string | null | undefined;
  return {
    load(ctx: LoadContext, force = false): void {
      const key = matchQueryKey(ctx);
      if (!force && key === lastKey) return;
      lastKey = key;
      const token = guard.begin();
      set({ raw: EMPTY_RAW, loading: !!key, error: false });
      if (!key || !ctx.selected) return;
      fetchRaw({ ...ctx, selected: ctx.selected }).then(
        (raw) => { if (guard.isCurrent(token)) set({ raw, loading: false, error: false }); },
        () => { if (guard.isCurrent(token)) set({ raw: EMPTY_RAW, loading: false, error: true }); },
      );
    },
    cancel(): void { guard.cancel(); lastKey = undefined; },
  };
}
