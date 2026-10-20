export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  birthday: string;             // "YYYY-MM-DD"
  gender: string;
  country: string;
  city: string;
  bio: string;
  photoURL: string | null;
  preferences: string[];
  favoriteDestinations: string[];
  languages: string[];
  emergencyContact: string;
  socialLinks: string;
  privacyEnabled: boolean;
  fcmToken: string | null;      // Phase 2 — push notifications
  createdAt: Date;
  updatedAt: Date;

  // ── Community fields (all optional — additive, no migration needed) ──
  travelStyles?: import('./Community').TravelStyle[];
  countriesVisited?: string[];
  interests?: import('./Community').Interest[];
  profileVisibility?: import('./Community').ProfileVisibility;
  showInNearbyTravelers?: boolean;
  currentDestination?: string | null;
  tripCount?: number;

  // ── Phase 2: Social Network fields ──────────────────────────────────
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  journalsCount?: number;
  coverPhotoURL?: string | null;
  badges?: import('./Reputation').BadgeType[];

  // ── Travel compatibility preferences (all optional; missing = not provided) ──
  travelPace?: import('../preferences').TravelPace | null;
  travelSchedule?: import('../preferences').TravelSchedule | null;
  groupSizePreference?: import('../preferences').GroupSizePreference | null;
  /** Consent: include pace, schedule and group size in the discovery record. Default off. */
  shareCompatibility?: boolean;
  /** Optional preference setup progress (resume after skip/exit). */
  preferenceSetup?: import('../preferences').PreferenceSetupProgress;
  /** The user's own trip shared in traveler discovery (destination and dates only), if any. */
  discoveryTripId?: string | null;
  /** Terms/Privacy version the user accepted (see TERMS_VERSION); absent until they accept. */
  termsAcceptedVersion?: string;
}

// Ported from Swift's computed `initials` property
export function getUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export const DEFAULT_USER_PROFILE: Omit<
  UserProfile,
  'id' | 'email' | 'createdAt' | 'updatedAt'
> = {
  name: '',
  phone: '',
  birthday: '',
  gender: '',
  country: '',
  city: '',
  bio: '',
  photoURL: null,
  preferences: [],
  favoriteDestinations: [],
  languages: [],
  emergencyContact: '',
  socialLinks: '',
  privacyEnabled: false,
  fcmToken: null,
};
