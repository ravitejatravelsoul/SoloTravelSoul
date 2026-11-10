import { Colors, Gradients, Shadow } from './theme';

export const DEFAULT_ACCENT = '#5652B7';

export const ACCENT_PRESETS = [
  { name: 'Indigo', hex: DEFAULT_ACCENT },
  { name: 'Ocean blue', hex: '#2164C4' },
  { name: 'Terracotta', hex: '#AD4D36' },
  { name: 'Berry', hex: '#A53D75' },
  { name: 'Amber', hex: '#BB7918' },
  { name: 'Teal', hex: '#00897B' },
] as const;

export function normalizeAccent(input: string): string | null {
  const hex = input.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex)) return '#' + [...hex].map(char => char.repeat(2)).join('').toUpperCase();
  return /^[\da-f]{6}$/i.test(hex) ? '#' + hex.toUpperCase() : null;
}

function channels(hex: string) {
  return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
}

function mix(from: string, to: string, amount: number) {
  const target = channels(to);
  return '#' + channels(from).map((channel, index) =>
    Math.round(channel + (target[index] - channel) * amount).toString(16).padStart(2, '0')
  ).join('').toUpperCase();
}

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function inkAgainstPaper(accent: string, minimum: number) {
  for (let i = 0; i < 20; i++) {
    const candidate = mix(accent, '#000000', i / 20);
    if (contrastRatio(candidate, Colors.background) >= minimum) return candidate;
  }
  return '#000000';
}

export function createAppTheme(selected: string) {
  const accent = normalizeAccent(selected) ?? DEFAULT_ACCENT;
  const primary = inkAgainstPaper(accent, 5);
  const primaryDark = inkAgainstPaper(mix(primary, '#000000', 0.22), 7);
  const soft = mix(accent, Colors.background, 0.88);
  const bright = mix(accent, '#FFFFFF', 0.54);
  return {
    Colors: {
      ...Colors, primary, primaryDark, accent: bright, accentSoft: soft,
      chipSelected: primary, catCity: primary,
    },
    Gradients: {
      ...Gradients,
      primary: [primary, primaryDark] as const,
      primarySoft: [primary, primaryDark] as const,
      ocean: [primary, primaryDark] as const,
      hero: [primary, primaryDark] as const,
      heroActive: [primary, primaryDark] as const,
      city: [primary, primaryDark] as const,
    },
    Shadow: { ...Shadow, hero: { ...Shadow.hero, shadowColor: primaryDark } },
  };
}

export type AppTheme = ReturnType<typeof createAppTheme>;

/** Reuse a stylesheet or color map for every component using the same palette. */
export function themed<T>(create: (theme: AppTheme) => T) {
  const cache = new WeakMap<AppTheme, T>();
  return (theme: AppTheme): T => {
    if (cache.has(theme)) return cache.get(theme)!;
    const result = create(theme);
    cache.set(theme, result);
    return result;
  };
}
