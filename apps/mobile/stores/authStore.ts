import { create } from 'zustand';
import type { User } from 'firebase/auth';
import type { UserProfile } from '@solotravelsoul/shared';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  initialized: boolean;   // true after first onAuthStateChanged fires
  loading: boolean;
  /** Current Firebase ID token, sent as Authorization on Worker media requests. */
  idToken: string | null;

  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setInitialized: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setIdToken: (token: string | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  initialized: false,
  loading: false,
  idToken: null,

  setUser: (user) => set((s) => ({ user, profile: s.user?.uid === user?.uid ? s.profile : null })),
  setProfile: (profile) => set({ profile }),
  setInitialized: (initialized) => set({ initialized }),
  setLoading: (loading) => set({ loading }),
  setIdToken: (idToken) => set({ idToken }),
  reset: () => set({ user: null, profile: null, loading: false, idToken: null }),
}));
