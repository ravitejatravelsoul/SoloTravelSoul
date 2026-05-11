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
