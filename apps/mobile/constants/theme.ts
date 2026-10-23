// ── "Playful Explorer" design tokens ───────────────────────────────────
// Warm ivory surfaces, deep ink text, electric teal as the one primary accent and coral as a selective highlight.
// Every screen reads these tokens, so changing a value here re-skins the app. Contrast notes (WCAG, on the surface
// they are used on): ink on ivory 15:1, secondary text on ivory 6.4:1, white on primary 4.6:1, primaryDark on ivory
// 7.1:1 (links and small teal text), ink on coral 5.7:1 (coral carries ink text or icons, never white text).

export const Colors = {
  // Brand
  primary: '#00897B', // electric teal: buttons, selected states, active tab
  primaryDark: '#005F56', // teal for small text and links on ivory; pressed state
  accent: '#19C3B1', // bright teal: highlights, progress, decorative fills (carries ink text)
  coral: '#FF6B57', // selective highlight: badges, likes, celebration (carries ink text)
  coralSoft: '#FFE3DD',
  tealSoft: '#DDF5F1',
  sun: '#FFC857', // small celebratory / star accents

  // Backgrounds
  background: '#FFF8EE', // warm ivory
  surface: '#FFFFFF',
  card: '#FBF0E0',

  // Text
  textPrimary: '#1B1A2E', // deep ink
  textSecondary: '#5C566B',

  // UI
  chipBackground: '#F6E8D3',
  chipSelected: '#00897B',
  chipSelectedText: '#FFFFFF',
  searchBackground: '#F4E9D8',
  tabBar: '#FFFDF8',
  border: '#E9DCC8',
  borderLight: '#F3E9D9',

  // Semantic
  error: '#D93636',
  success: '#0F9D6B',
  successDark: '#0A7A53',
  warning: '#E58A0B',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(27,26,46,0.45)',
  placeholder: '#8A8396',
  shadow: 'rgba(42,30,10,0.10)',

  // Category palette (warm, friendly, all readable with ink or white labels at 14px bold)
  catBeach: '#F5A524',
  catMountain: '#6C63D9',
  catCity: '#00897B',
  catFood: '#E5533D',
  catAdventure: '#2FA866',
  catNightlife: '#8E54E0',
  catHidden: '#F07D2A',
  catSolo: '#14A5B8',
} as const;

// Named gradient stops — pair with expo-linear-gradient
export const Gradients = {
  primary: ['#12A596', '#00695F'] as const,
  primarySoft: ['#19B3A3', '#00897B'] as const,
  success: ['#2FBF86', '#0A7A53'] as const,
  sunset: ['#FFB454', '#FF6B57'] as const,
  ocean: ['#5FD3C8', '#00897B'] as const,
  hero: ['#12A596', '#00483F'] as const,
  heroActive: ['#2FBF86', '#0A7A53'] as const,
  ivory: ['#FFF8EE', '#FFEFD6'] as const,
  scrim: ['rgba(27,26,46,0)', 'rgba(27,26,46,0.72)'] as const,
  // Categories
  beach: ['#FFD97A', '#F5A524'] as const,
  mountain: ['#A39CF2', '#6C63D9'] as const,
  city: ['#5FD3C8', '#00897B'] as const,
  food: ['#FF9A8A', '#E5533D'] as const,
  adventure: ['#6ED79F', '#2FA866'] as const,
  nightlife: ['#C6A0F5', '#8E54E0'] as const,
  hidden: ['#FFB27A', '#F07D2A'] as const,
  solo: ['#6FD9E6', '#14A5B8'] as const,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
} as const;

// Rounder surfaces than before: cards 20, sheets 28, pills fully round.
export const Radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  '2xl': 36,
  full: 999,
} as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 34,
  '5xl': 42,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

/**
 * Display typeface for headings (Baloo 2, SIL Open Font License, bundled with the app: no network). Body text stays the
 * system font for readability and for the enlarged-text behaviour the app already handles. The fonts are loaded before
 * the splash screen is dismissed; until then (or if loading ever fails) text simply falls back to the system font.
 */
export const Fonts = {
  display: 'Baloo2_700Bold',
  displayHeavy: 'Baloo2_800ExtraBold',
} as const;

/** Warm, restrained depth: a brown-tinted shadow rather than pure black. */
export const Shadow = {
  sm: {
    shadowColor: '#2A1E0A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#2A1E0A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#2A1E0A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 8,
  },
  hero: {
    shadowColor: '#00695F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
} as const;

/** Motion: springs for selection and press feedback, short timings for fades. All of it is skipped under reduced motion. */
export const Motion = {
  pressScale: 0.96,
  spring: { damping: 14, stiffness: 220, mass: 0.8 },
  springSoft: { damping: 18, stiffness: 140, mass: 0.9 },
  fast: 140,
  base: 240,
  slow: 380,
} as const;

/** Minimum comfortable touch target (dp). */
export const TapTarget = 44;
