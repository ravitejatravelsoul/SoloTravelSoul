// ── Traveler Reputation ───────────────────────────────────────────────────────

export type BadgeType =
  | 'explorer'        // ≥ 1 completed trip
  | 'adventurer'      // ≥ 5 completed trips OR ≥ 3 countries visited
  | 'travel_guide'    // ≥ 3 journals published
  | 'community_helper' // approved into ≥ 1 group + profile ≥ 60% complete
  | 'world_traveler'; // ≥ 10 countries visited

export const BADGE_META: Record<BadgeType, { label: string; icon: string; description: string }> = {
  explorer: {
    label: 'Explorer',
    icon: 'compass',
    description: 'Completed at least one trip',
  },
  adventurer: {
    label: 'Adventurer',
    icon: 'map',
    description: '5+ trips or 3+ countries visited',
  },
  travel_guide: {
    label: 'Travel Guide',
    icon: 'book',
    description: 'Published 3 or more travel journals',
  },
  community_helper: {
    label: 'Community Helper',
    icon: 'people',
    description: 'Active group member with a complete profile',
  },
  world_traveler: {
    label: 'World Traveler',
    icon: 'earth',
    description: 'Visited 10 or more countries',
  },
};

export interface TravelerReputation {
  uid: string;
  badges: BadgeType[];
  score: number;             // weighted sum of signals
  tripsCompleted: number;
  countriesVisited: number;
  groupsJoined: number;
  postsPublished: number;
  journalsPublished: number;
  updatedAt: Date;
}

// ── Badge calculation (pure, no side effects) ─────────────────────────────────

export interface ReputationInputs {
  tripsCompleted: number;
  countriesVisited: number;
  groupsJoined: number;
  postsPublished: number;
  journalsPublished: number;
  profileCompletePct: number;  // 0–100
}

export function calculateBadges(inputs: ReputationInputs): BadgeType[] {
  const badges: BadgeType[] = [];

  if (inputs.tripsCompleted >= 1) {
    badges.push('explorer');
  }
  if (inputs.tripsCompleted >= 5 || inputs.countriesVisited >= 3) {
    badges.push('adventurer');
  }
  if (inputs.journalsPublished >= 3) {
    badges.push('travel_guide');
  }
  if (inputs.groupsJoined >= 1 && inputs.profileCompletePct >= 60) {
    badges.push('community_helper');
  }
  if (inputs.countriesVisited >= 10) {
    badges.push('world_traveler');
  }

  return badges;
}

export function calculateScore(inputs: ReputationInputs): number {
  return (
    inputs.tripsCompleted * 10 +
    inputs.countriesVisited * 5 +
    inputs.groupsJoined * 8 +
    inputs.postsPublished * 3 +
    inputs.journalsPublished * 15 +
    Math.round(inputs.profileCompletePct * 0.2)
  );
}

// Percentage of profile fields populated (out of the key community fields)
export function profileCompletePct(profile: {
  name?: string;
  bio?: string;
  city?: string;
  country?: string;
  photoURL?: string | null;
  languages?: string[];
  travelStyles?: string[];
  interests?: string[];
  countriesVisited?: string[];
}): number {
  const checks = [
    !!(profile.name?.trim()),
    !!(profile.bio?.trim()),
    !!(profile.city?.trim()),
    !!(profile.country?.trim()),
    !!profile.photoURL,
    (profile.languages?.length ?? 0) > 0,
    (profile.travelStyles?.length ?? 0) > 0,
    (profile.interests?.length ?? 0) > 0,
    (profile.countriesVisited?.length ?? 0) > 0,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}
