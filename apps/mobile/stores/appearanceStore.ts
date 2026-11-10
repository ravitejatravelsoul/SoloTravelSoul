import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createAppTheme, DEFAULT_ACCENT, normalizeAccent } from '@/constants/appearance';
import { Colors, Gradients, Shadow } from '@/constants/theme';
import { useAuthStore } from './authStore';

export const EDITORIAL_APPEARANCE_ENABLED = Platform.OS === 'ios';
const baseTheme = { Colors, Gradients, Shadow };

interface AppearanceState {
  accents: Record<string, string>;
  setAccent: (uid: string, value: string) => void;
  resetAccent: (uid: string) => void;
}

export const useAppearanceStore = create<AppearanceState>()(persist(
  (set) => ({
    accents: {},
    setAccent: (uid, value) => {
      const hex = normalizeAccent(value);
      if (uid && hex) set(state => ({ accents: { ...state.accents, [uid]: hex } }));
    },
    resetAccent: (uid) => set(state => {
      const accents = { ...state.accents };
      delete accents[uid];
      return { accents };
    }),
  }),
  {
    name: 'sts-appearance-v1',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: state => ({ accents: state.accents }),
    skipHydration: !EDITORIAL_APPEARANCE_ENABLED,
  },
));

const palettes = new Map<string, ReturnType<typeof createAppTheme>>();

export function useAppTheme() {
  const uid = useAuthStore(state => state.user?.uid);
  const accent = useAppearanceStore(state => uid ? normalizeAccent(state.accents[uid] ?? '') ?? DEFAULT_ACCENT : DEFAULT_ACCENT);
  if (!EDITORIAL_APPEARANCE_ENABLED) return baseTheme;
  let palette = palettes.get(accent);
  if (!palette) {
    palette = createAppTheme(accent);
    if (palettes.size >= 24) {
      const oldest = palettes.keys().next().value;
      if (oldest !== undefined) palettes.delete(oldest);
    }
    palettes.set(accent, palette);
  }
  return palette;
}
