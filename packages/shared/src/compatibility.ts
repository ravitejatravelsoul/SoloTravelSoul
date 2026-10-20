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
export type PreferenceLevel = 'strong' | 'good' | 'some' | 'few' | 'not_enough_info';
/** Overall level for the selected trip. Known non-overlapping dates are never Strong/Good. */
export type CompatibilityLevel = PreferenceLevel | 'dates_differ';
export type DatesStatus = 'overlap' | 'no_overlap' | 'unknown' | 'not_applicable';

export interface CompatibilityResult {
  trip: { match: TripMatch; overlapDays: number };
  /** Travel dates, reported apart from preferences. */
  dates: { status: DatesStatus; overlapDays: number; label: string | null };
  /** Stated preferences only (ignores dates). */
  preferences: { level: PreferenceLevel };
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
  strong: 'Strong match', good: 'Good match', some: 'Possible match', few: 'Possible match', not_enough_info: 'Not enough information',
  dates_differ: "Dates don't overlap",
};
export const PREFERENCE_LABELS: Record<PreferenceLevel, string> = {
  strong: 'Strong preference match', good: 'Good preference match', some: 'Some shared preferences', few: 'Few shared preferences', not_enough_info: 'Not enough information',
};

const dayIndex = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

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

  // 1. The selected trip comes first: same destination, then date overlap. Dates are
  // reported separately from preferences (result.dates), never as a shared preference.
  const trip = compareTrips(myTrip, theirTrip);
  let dates: CompatibilityResult['dates'];
  if (trip.match === 'overlap' && trip.overlap) {
    dates = { status: 'overlap', overlapDays: trip.overlapDays, label: `Dates overlap: ${trip.overlapDays} day${trip.overlapDays === 1 ? '' : 's'}` };
    rank += 1000 + Math.min(trip.overlapDays, 60);
  } else if (trip.match === 'dates_unknown') {
    dates = { status: 'unknown', overlapDays: 0, label: 'Dates unknown' };
    notProvided.push('trip dates');
    rank += 500;
  } else if (trip.match === 'no_overlap') {
    dates = { status: 'no_overlap', overlapDays: 0, label: "Dates don't overlap" };
    rank += 200;
  } else {
    dates = { status: 'not_applicable', overlapDays: 0, label: null };
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

  // 3. Levels: explicit thresholds on what was actually compared.
  // Preferences alone:
  // 'few' = enough answers on both sides to compare, but nothing shared (previously mislabelled "Some shared preferences").
  const prefLevel: PreferenceLevel = compared < 2 ? 'not_enough_info' : agreements >= 4 ? 'strong' : agreements >= 2 ? 'good' : agreements === 1 ? 'some' : 'few';
  // For the selected trip: known non-overlapping dates are never Strong/Good; unknown dates
  // stay unknown (at most "Possible match"); without a trip it is the preference level.
  let level: CompatibilityLevel;
  if (dates.status === 'no_overlap') level = 'dates_differ';
  else if (dates.status === 'overlap') level = agreements >= 3 ? 'strong' : agreements >= 1 ? 'good' : 'some';
  else if (dates.status === 'unknown') level = compared < 2 ? 'not_enough_info' : 'some';
  else level = prefLevel;

  return { trip: { match: trip.match, overlapDays: trip.overlapDays }, dates, preferences: { level: prefLevel }, reasons, differences, notProvided, youHaveNotAnswered, level, rank };
}

/** Stable order: rank, then name, then id. */
export function rankByCompatibility<T extends { id: string; name: string; result: CompatibilityResult }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.result.rank - a.result.rank || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
