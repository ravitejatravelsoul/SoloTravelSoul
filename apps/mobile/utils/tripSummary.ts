// What a traveler should understand before asking to join a public trip, and what an organizer should see
// before approving someone. Everything shown is a stated answer or a trip fact: nothing is inferred, a missing
// answer is "not provided" (never a mismatch), and compatibility is not presented as a safety judgement.
import { compareTravelers, PACE_OPTIONS, SCHEDULE_OPTIONS, GROUP_SIZE_OPTIONS, TRAVEL_STYLE_LABELS, INTEREST_LABELS } from '@solotravelsoul/shared';
import type { CompatibilityAnswers, CompatibilityResult, NearbyTraveler, PublicTrip, TravelPreferences } from '@solotravelsoul/shared';

const NOT_PROVIDED = 'Not provided';

const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
const labelOf = <T extends string>(opts: readonly { value: T; label: string }[], v: T | null | undefined) =>
  (v && opts.find((o) => o.value === v)?.label) || null;

export interface SummaryRow { label: string; value: string; provided: boolean }

/** The trip facts, in the order a traveler decides on them. */
export function tripFacts(trip: PublicTrip): SummaryRow[] {
  const total = trip.maxMembers != null ? `${trip.memberCount} of ${trip.maxMembers} places taken` : `${trip.memberCount} member${trip.memberCount === 1 ? '' : 's'}, no limit set`;
  const status = trip.maxMembers != null && trip.memberCount >= trip.maxMembers ? 'Full' : trip.isAcceptingMembers ? 'Open to requests' : 'Not accepting requests';
  return [
    { label: 'Destination', value: trip.destination, provided: true },
    { label: 'Dates', value: `${day(trip.startDate)} – ${day(trip.endDate)} (${days(trip.startDate, trip.endDate)} days)`, provided: true },
    { label: 'Group size', value: `${total} · ${status}`, provided: true },
    { label: 'Budget', value: trip.budgetNote?.trim() || NOT_PROVIDED, provided: !!trip.budgetNote?.trim() },
    { label: 'Organizer expects', value: trip.expectations?.trim() || NOT_PROVIDED, provided: !!trip.expectations?.trim() },
  ];
}

/** The organizer's own stated answers (from their discovery record, which exists only with their consent). */
export function organizerAnswers(organizer: NearbyTraveler | null): SummaryRow[] {
  const o = organizer;
  const list = <T extends string>(v: readonly T[] | undefined | null, labels: Record<T, string>) => (v && v.length ? v.map((x) => labels[x] ?? x).join(', ') : null);
  const rows: [string, string | null][] = [
    ['Travel style', list(o?.travelStyles, TRAVEL_STYLE_LABELS)],
    ['Interests', list(o?.interests, INTEREST_LABELS)],
    ['Languages', o?.languages?.length ? o.languages.join(', ') : null],
    ['Pace', labelOf(PACE_OPTIONS, o?.travelPace)],
    ['Schedule', labelOf(SCHEDULE_OPTIONS, o?.travelSchedule)],
    ['Preferred group size', labelOf(GROUP_SIZE_OPTIONS, o?.groupSizePreference)],
  ];
  return rows.map(([label, value]) => ({ label, value: value ?? NOT_PROVIDED, provided: !!value }));
}

export interface AnswerComparison {
  /** True when the other traveler's answers could be read at all (public, discoverable, consented where required). */
  otherShared: boolean;
  shared: string[];
  differences: string[];
  notProvided: string[];
  youHaveNotAnswered: string[];
  result: CompatibilityResult;
}

/** The viewer's stated answers against the other traveler's. No trip window: dates are shown as facts, not as a match. */
export function compareAnswers(mine: TravelPreferences | CompatibilityAnswers, other: Partial<CompatibilityAnswers> | null): AnswerComparison {
  const result = compareTravelers(mine, other ?? {});
  return {
    otherShared: !!other,
    shared: result.reasons,
    differences: result.differences,
    notProvided: result.notProvided,
    youHaveNotAnswered: result.youHaveNotAnswered,
    result,
  };
}

/** One sentence per block, so screens never claim more than the answers support. */
export function comparisonHeadline(c: AnswerComparison): string {
  if (!c.otherShared) return 'They have not shared their travel answers, so nothing can be compared.';
  if (c.shared.length === 0 && c.differences.length === 0) return 'Not enough answers on both sides to compare.';
  const parts = [] as string[];
  if (c.shared.length) parts.push(`${c.shared.length} shared`);
  if (c.differences.length) parts.push(`${c.differences.length} difference${c.differences.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
