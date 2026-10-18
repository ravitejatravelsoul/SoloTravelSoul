// Travel compatibility preferences: one definition for the optional setup, profile
// editing, the discovery record and the Firestore rules (firestore.rules mirrors the
// option lists below; a release test fails if they differ).
import type { TravelStyle, Interest } from './types/Community';
import type { UserProfile } from './types/UserProfile';

export type TravelPace = 'relaxed' | 'balanced' | 'active';
export type TravelSchedule = 'planned' | 'spontaneous';
export type GroupSizePreference = 'pair' | 'small' | 'large';

export const TRAVEL_STYLE_OPTIONS: readonly TravelStyle[] = ['solo', 'budget', 'luxury', 'adventure', 'cultural', 'food', 'digital-nomad', 'eco'];
export const TRAVEL_STYLE_LABELS: Record<TravelStyle, string> = {
  solo: 'Solo', budget: 'Budget', luxury: 'Luxury', adventure: 'Adventure',
  cultural: 'Cultural', food: 'Food', 'digital-nomad': 'Digital Nomad', eco: 'Eco',
};
export const INTEREST_OPTIONS: readonly Interest[] = ['hiking', 'photography', 'food', 'nightlife', 'history', 'beach', 'languages', 'volunteering', 'yoga', 'art', 'sports', 'music'];
export const INTEREST_LABELS: Record<Interest, string> = {
  hiking: 'Hiking', photography: 'Photography', food: 'Food', nightlife: 'Nightlife',
  history: 'History', beach: 'Beach', languages: 'Languages', volunteering: 'Volunteering',
  yoga: 'Yoga', art: 'Art', sports: 'Sports', music: 'Music',
};
export const LANGUAGE_OPTIONS: readonly string[] = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Chinese', 'Korean', 'Arabic', 'Hindi', 'Russian'];

export const PACE_OPTIONS: readonly { value: TravelPace; label: string; description: string }[] = [
  { value: 'relaxed', label: 'Relaxed', description: 'Few plans a day, plenty of downtime' },
  { value: 'balanced', label: 'Balanced', description: 'A mix of sightseeing and rest' },
  { value: 'active', label: 'Active', description: 'Full days, early starts' },
];
export const SCHEDULE_OPTIONS: readonly { value: TravelSchedule; label: string; description: string }[] = [
  { value: 'planned', label: 'Planned', description: 'I like an itinerary and bookings ahead' },
  { value: 'spontaneous', label: 'Spontaneous', description: 'I decide as I go' },
];
export const GROUP_SIZE_OPTIONS: readonly { value: GroupSizePreference; label: string; description: string }[] = [
  { value: 'pair', label: 'One companion', description: 'Traveling as two' },
  { value: 'small', label: 'Small group', description: '3 to 5 people' },
  { value: 'large', label: 'Larger group', description: '6 or more people' },
];

export const MAX_TRAVEL_STYLES = TRAVEL_STYLE_OPTIONS.length;
export const MAX_INTERESTS = INTEREST_OPTIONS.length;
export const MAX_LANGUAGES = 12;
export const MAX_LANGUAGE_LENGTH = 40;

export interface TravelPreferences {
  travelStyles: TravelStyle[];
  interests: Interest[];
  languages: string[];
  travelPace: TravelPace | null;
  travelSchedule: TravelSchedule | null;
  groupSizePreference: GroupSizePreference | null;
  shareCompatibility: boolean;
}

const pick = <T extends string>(allowed: readonly T[], v: unknown): T | null => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null);
const pickList = <T extends string>(allowed: readonly T[], v: unknown, max: number): T[] =>
  (Array.isArray(v) ? v : []).filter((x, i, a): x is T => (allowed as readonly string[]).includes(x) && a.indexOf(x) === i).slice(0, max);

/** The one validation used by setup, editing and the discovery record. Unknown values are dropped, never guessed. */
export function sanitizePreferences(input: Partial<Record<keyof TravelPreferences, unknown>>): TravelPreferences {
  const languages = (Array.isArray(input.languages) ? input.languages : [])
    .filter((l): l is string => typeof l === 'string')
    .map((l) => l.trim())
    .filter((l, i, a) => l.length > 0 && l.length <= MAX_LANGUAGE_LENGTH && a.indexOf(l) === i)
    .slice(0, MAX_LANGUAGES);
  return {
    travelStyles: pickList(TRAVEL_STYLE_OPTIONS, input.travelStyles, MAX_TRAVEL_STYLES),
    interests: pickList(INTEREST_OPTIONS, input.interests, MAX_INTERESTS),
    languages,
    travelPace: pick(PACE_OPTIONS.map((o) => o.value), input.travelPace),
    travelSchedule: pick(SCHEDULE_OPTIONS.map((o) => o.value), input.travelSchedule),
    groupSizePreference: pick(GROUP_SIZE_OPTIONS.map((o) => o.value), input.groupSizePreference),
    shareCompatibility: input.shareCompatibility === true,
  };
}

export function preferencesOf(profile: Partial<UserProfile> | null | undefined): TravelPreferences {
  return sanitizePreferences({
    travelStyles: profile?.travelStyles, interests: profile?.interests, languages: profile?.languages,
    travelPace: profile?.travelPace, travelSchedule: profile?.travelSchedule, groupSizePreference: profile?.groupSizePreference,
    shareCompatibility: profile?.shareCompatibility,
  });
}

// ── Optional setup (progress, skip, resume) ───────────────────────────────────

export const PREFERENCE_STEPS = ['styles', 'interests', 'languages', 'pace', 'schedule', 'groupSize', 'sharing'] as const;
export type PreferenceStep = (typeof PREFERENCE_STEPS)[number];

export interface PreferenceSetupProgress {
  status: 'in_progress' | 'completed' | 'skipped';
  /** Index into PREFERENCE_STEPS of the step to resume at. */
  step: number;
  updatedAtMs: number;
}

const clampStep = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) ? Math.min(Math.max(n, 0), PREFERENCE_STEPS.length - 1) : 0);

/** Where setup opens: the saved step while in progress, otherwise the first step (editing from the start). */
export function resumeStep(progress: PreferenceSetupProgress | null | undefined): number {
  return progress && progress.status === 'in_progress' ? clampStep(progress.step) : 0;
}
export function progressAt(step: number, nowMs: number): PreferenceSetupProgress {
  return { status: 'in_progress', step: clampStep(step), updatedAtMs: nowMs };
}
export function finishedProgress(status: 'completed' | 'skipped', nowMs: number): PreferenceSetupProgress {
  return { status, step: status === 'completed' ? PREFERENCE_STEPS.length - 1 : 0, updatedAtMs: nowMs };
}
/** Existing users without a record and users who left setup part-way are offered it; finished or skipped are not. */
export function shouldOfferPreferenceSetup(profile: Partial<UserProfile> | null | undefined): boolean {
  if (!profile) return false;
  const p = profile.preferenceSetup;
  return !p || p.status === 'in_progress';
}

// ── Discovery record ──────────────────────────────────────────────────────────

/** City-level matching key: diacritics removed, lower case, text before the first comma, single spaces. */
export function destinationKey(destination: string | null | undefined): string | null {
  if (typeof destination !== 'string') return null;
  const key = destination.normalize('NFKD').replace(/[̀-ͯ]/g, '').split(',')[0].toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
  return key || null;
}

export interface SharedTrip { destination: string; startDate: Date; endDate: Date }

/** Discovery requires a public profile and the explicit discovery opt-in. */
export function isDiscoverable(profile: Partial<UserProfile> | null | undefined): boolean {
  return !!profile && profile.profileVisibility === 'public' && profile.showInNearbyTravelers === true;
}

/**
 * Fields of nearbyTravelers/{uid} (without updatedAt). Pace, schedule and group size are
 * included only with shareCompatibility; a trip only when the user chose one to share.
 */
export function discoveryRecordFields(uid: string, profile: Partial<UserProfile>, sharedTrip: SharedTrip | null) {
  const prefs = preferencesOf(profile);
  const share = prefs.shareCompatibility;
  const trip = sharedTrip && destinationKey(sharedTrip.destination) && sharedTrip.endDate >= sharedTrip.startDate ? sharedTrip : null;
  return {
    uid,
    displayName: (profile.name ?? '').slice(0, 100),
    photoURL: profile.photoURL ?? null,
    currentCity: (profile.city ?? '').slice(0, 100),
    travelStyles: prefs.travelStyles,
    interests: prefs.interests,
    languages: prefs.languages,
    travelPace: share ? prefs.travelPace : null,
    travelSchedule: share ? prefs.travelSchedule : null,
    groupSizePreference: share ? prefs.groupSizePreference : null,
    destination: trip ? trip.destination.trim().slice(0, 100) : null,
    destinationKey: trip ? destinationKey(trip.destination) : null,
    destinationStartDate: trip ? trip.startDate : null,
    destinationEndDate: trip ? trip.endDate : null,
  };
}
