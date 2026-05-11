import { create } from 'zustand';
import type { User } from 'firebase/auth';
import type { UserProfile } from '@solotravelsoul/shared';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  initialized: boolean;   // true after first onAuthStateChanged fires
  loading: boolean;

  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setInitialized: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  initialized: false,
  loading: false,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setInitialized: (initialized) => set({ initialized }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ user: null, profile: null, loading: false }),
}));
