// Transparent, deterministic travel-compatibility matching. No scoring of people:
// it compares explicitly stated answers and a selected trip, and explains why.
// Missing answers are "not provided", never a mismatch. No inference of anything
// the traveler did not state; no safety judgement.
import type { TravelStyle, Interest } from './types/Community';
import {
  TRAVEL_STYLE_LABELS, INTEREST_LABELS, PACE_OPTIONS, SCHEDULE_OPTIONS, GROUP_SIZE_OPTIONS,
  type TravelPace, type TravelSchedule, type GroupSizePreference,
} from './preferences';

export interface CompatibilityAnswers {
  travelStyles?: TravelStyle[] | null;
  interests?: Interest[] | null;
  languages?: string[] | null;
  travelPace?: TravelPace | null;
  travelSchedule?: TravelSchedule | null;
  groupSizePreference?: GroupSizePreference | null;
}
export interface TripWindow {
  destinationKey: string | null;
  destination?: string | null;
  startDate: Date | null;
  endDate: Date | null;
}

export type TripMatch = 'overlap' | 'no_overlap' | 'dates_unknown' | 'other_destination' | 'no_trip';
export type CompatibilityLevel = 'strong' | 'good' | 'some' | 'not_enough_info';

export interface CompatibilityResult {
  trip: { match: TripMatch; overlapDays: number };
  reasons: string[];
  differences: string[];
  /** Questions the other traveler has not answered or not shared. */
  notProvided: string[];
  /** Questions you have not answered (they cannot be compared). */
  youHaveNotAnswered: string[];
  level: CompatibilityLevel;
  /** Deterministic ordering key; higher first. Not shown as a score. */
  rank: number;
}

export const LEVEL_LABELS: Record<CompatibilityLevel, string> = {
  strong: 'Strong match', good: 'Good match', some: 'Some overlap', not_enough_info: 'Not enough information',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayIndex = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
const fmt = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** Inclusive overlap in days of two date ranges (0 when they do not overlap). */
export function overlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(dayIndex(aStart), dayIndex(bStart));
  const end = Math.min(dayIndex(aEnd), dayIndex(bEnd));
  return end >= start ? end - start + 1 : 0;
}

export function compareTrips(mine: TripWindow | null, theirs: TripWindow | null): { match: TripMatch; overlapDays: number; overlap?: [Date, Date] } {
  if (!mine || !mine.destinationKey) return { match: 'no_trip', overlapDays: 0 };
  if (!theirs || !theirs.destinationKey || theirs.destinationKey !== mine.destinationKey) return { match: 'other_destination', overlapDays: 0 };
  if (!mine.startDate || !mine.endDate || !theirs.startDate || !theirs.endDate) return { match: 'dates_unknown', overlapDays: 0 };
  const days = overlapDays(mine.startDate, mine.endDate, theirs.startDate, theirs.endDate);
  if (!days) return { match: 'no_overlap', overlapDays: 0 };
  const from = dayIndex(mine.startDate) > dayIndex(theirs.startDate) ? mine.startDate : theirs.startDate;
  const to = dayIndex(mine.endDate) < dayIndex(theirs.endDate) ? mine.endDate : theirs.endDate;
  return { match: 'overlap', overlapDays: days, overlap: [from, to] };
}

const provided = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== '');
const label = <T extends string>(opts: readonly { value: T; label: string }[], v: T) => opts.find((o) => o.value === v)?.label ?? v;
const PACE_ORDER: TravelPace[] = ['relaxed', 'balanced', 'active'];

export function compareTravelers(me: CompatibilityAnswers, them: CompatibilityAnswers, myTrip: TripWindow | null = null, theirTrip: TripWindow | null = null): CompatibilityResult {
  const reasons: string[] = [];
  const differences: string[] = [];
  const notProvided: string[] = [];
  const youHaveNotAnswered: string[] = [];
  let rank = 0;
  let compared = 0;
  let agreements = 0;

  // 1. The selected trip comes first: same destination, then date overlap.
  const trip = compareTrips(myTrip, theirTrip);
  const place = myTrip?.destination || theirTrip?.destination || 'the same destination';
  if (trip.match === 'overlap' && trip.overlap) {
    reasons.push(`Both in ${place} ${fmt(trip.overlap[0])}–${fmt(trip.overlap[1])} (${trip.overlapDays} day${trip.overlapDays === 1 ? '' : 's'} overlap)`);
    rank += 1000 + Math.min(trip.overlapDays, 60);
  } else if (trip.match === 'dates_unknown') {
    reasons.push(`Also going to ${place}`);
    notProvided.push('trip dates');
    rank += 500;
  } else if (trip.match === 'no_overlap') {
    reasons.push(`Also going to ${place}`);
    differences.push('Your dates do not overlap');
    rank += 200;
  }

  // 2. Stated preferences. A dimension is compared only when both answered.
  const dim = (name: string, mine: unknown, theirs: unknown, compare: () => void) => {
    const a = provided(mine), b = provided(theirs);
    if (!b) notProvided.push(name);
    if (!a) youHaveNotAnswered.push(name);
    if (a && b) { compared++; compare(); }
  };
  dim('travel style', me.travelStyles, them.travelStyles, () => {
    const shared = (me.travelStyles ?? []).filter((s) => (them.travelStyles ?? []).includes(s));
    if (shared.length) { agreements++; rank += 3 * shared.length; reasons.push(`Shared travel style: ${shared.map((s) => TRAVEL_STYLE_LABELS[s]).join(', ')}`); }
  });
  dim('interests', me.interests, them.interests, () => {
    const shared = (me.interests ?? []).filter((s) => (them.interests ?? []).includes(s));
    if (shared.length) { agreements++; rank += 3 * shared.length; reasons.push(`Shared interests: ${shared.map((s) => INTEREST_LABELS[s]).join(', ')}`); }
  });
  dim('languages', me.languages, them.languages, () => {
    const shared = (me.languages ?? []).filter((s) => (them.languages ?? []).includes(s));
    if (shared.length) { agreements++; rank += 2; reasons.push(`Both speak ${shared.join(', ')}`); } else differences.push('No common language listed');
  });
  dim('pace', me.travelPace, them.travelPace, () => {
    const gap = Math.abs(PACE_ORDER.indexOf(me.travelPace!) - PACE_ORDER.indexOf(them.travelPace!));
    if (gap === 0) { agreements++; rank += 3; reasons.push(`Both prefer a ${label(PACE_OPTIONS, me.travelPace!).toLowerCase()} pace`); }
    else if (gap === 1) { rank += 1; differences.push(`Pace: you prefer ${label(PACE_OPTIONS, me.travelPace!).toLowerCase()}, they prefer ${label(PACE_OPTIONS, them.travelPace!).toLowerCase()} (close)`); }
    else differences.push(`Pace: you prefer ${label(PACE_OPTIONS, me.travelPace!).toLowerCase()}, they prefer ${label(PACE_OPTIONS, them.travelPace!).toLowerCase()}`);
  });
  dim('schedule', me.travelSchedule, them.travelSchedule, () => {
    if (me.travelSchedule === them.travelSchedule) { agreements++; rank += 2; reasons.push(`Both like ${me.travelSchedule === 'planned' ? 'a planned itinerary' : 'deciding as you go'}`); }
    else differences.push(`Schedule: you are ${label(SCHEDULE_OPTIONS, me.travelSchedule!).toLowerCase()}, they are ${label(SCHEDULE_OPTIONS, them.travelSchedule!).toLowerCase()}`);
  });
  dim('group size', me.groupSizePreference, them.groupSizePreference, () => {
    if (me.groupSizePreference === them.groupSizePreference) { agreements++; rank += 2; reasons.push(`Both prefer: ${label(GROUP_SIZE_OPTIONS, me.groupSizePreference!).toLowerCase()}`); }
    else differences.push(`Group size: you prefer ${label(GROUP_SIZE_OPTIONS, me.groupSizePreference!).toLowerCase()}, they prefer ${label(GROUP_SIZE_OPTIONS, them.groupSizePreference!).toLowerCase()}`);
  });

  // 3. Level: explicit thresholds on what was actually compared.
  const tripPositive = trip.match === 'overlap';
  let level: CompatibilityLevel;
  if (!tripPositive && compared < 2) level = 'not_enough_info';
  else if ((tripPositive && agreements >= 3) || agreements >= 4) level = 'strong';
  else if ((tripPositive && agreements >= 1) || agreements >= 2) level = 'good';
  else level = 'some';

  return { trip: { match: trip.match, overlapDays: trip.overlapDays }, reasons, differences, notProvided, youHaveNotAnswered, level, rank };
}

/** Stable order: rank, then name, then id. */
export function rankByCompatibility<T extends { id: string; name: string; result: CompatibilityResult }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.result.rank - a.result.rank || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
