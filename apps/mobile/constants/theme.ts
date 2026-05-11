// ── Ported from AppTheme.swift ────────────────────────────────────────
// primary  = rgb(0.07, 0.44, 0.76) → #1270C2
// accent   = rgb(0.20, 0.60, 0.86) → #3399DB

export const Colors = {
  // Brand
  primary: '#1270C2',
  primaryDark: '#0A4F8F',
  accent: '#3399DB',

  // Backgrounds
  background: '#F8F9FB',
  surface: '#FFFFFF',
  card: '#F2F2F7',

  // Text
  textPrimary: '#0D0D0D',
  textSecondary: '#6B7280',

  // UI
  chipBackground: '#E8EAED',
  chipSelected: '#1270C2',
  chipSelectedText: '#FFFFFF',
  searchBackground: '#EDEEF0',
  tabBar: '#FFFFFF',
  border: '#E5E7EB',
  borderLight: '#F0F1F3',

  // Semantic
  error: '#EF4444',
  success: '#10B981',
  successDark: '#059669',
  warning: '#F59E0B',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.45)',
  placeholder: '#9CA3AF',
  shadow: 'rgba(0,0,0,0.08)',

  // Category palette
  catBeach: '#F59E0B',
  catMountain: '#6366F1',
  catCity: '#1270C2',
  catFood: '#EF4444',
  catAdventure: '#10B981',
  catNightlife: '#8B5CF6',
  catHidden: '#F97316',
  catSolo: '#06B6D4',
} as const;

// Named gradient stops — pair with expo-linear-gradient
export const Gradients = {
  primary: ['#1A7FD4', '#0A4F8F'] as const,
  primarySoft: ['#2389E0', '#1270C2'] as const,
  success: ['#10B981', '#059669'] as const,
  sunset: ['#F59E0B', '#EF4444'] as const,
  ocean: ['#38BDF8', '#1270C2'] as const,
  hero: ['#1A7FD4', '#083F72'] as const,
  heroActive: ['#10B981', '#047857'] as const,
  // Categories
  beach: ['#FCD34D', '#F59E0B'] as const,
  mountain: ['#818CF8', '#4F46E5'] as const,
  city: ['#60A5FA', '#1D4ED8'] as const,
  food: ['#FCA5A5', '#EF4444'] as const,
  adventure: ['#34D399', '#059669'] as const,
  nightlife: ['#C4B5FD', '#7C3AED'] as const,
  hidden: ['#FDBA74', '#EA580C'] as const,
  solo: ['#67E8F9', '#0891B2'] as const,
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

// cardCornerRadius from AppTheme = 12
export const Radius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  full: 999,
} as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,   // bodyFont from AppTheme
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28, // headingFont from AppTheme
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

// cardShadow from AppTheme = 4
export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 8,
  },
  hero: {
    shadowColor: '#1270C2',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 12,
  },
} as const;
