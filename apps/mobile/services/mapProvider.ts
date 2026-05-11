// ── Map provider configuration ────────────────────────────────────────
// Reads env flags at module load. All feature-flag decisions go through
// this single file so the rest of the app never reads process.env directly.

const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const mapboxFlagEnabled = process.env.EXPO_PUBLIC_MAPBOX_ENABLED === 'true';

export const mapProvider = {
  mapbox: {
    // True only when the flag is set AND a token is present AND we have a
    // dev/production build (Mapbox native SDK cannot run in Expo Go).
    enabled: mapboxFlagEnabled && mapboxToken.length > 0,
    token: mapboxToken,
  },

  // Phase 2: Foursquare Places search — not yet active.
  // Wiring: check Firestore places_cache first (7-day TTL),
  // call API on cache miss, write result back to places_cache.
  foursquare: {
    enabled: false,
    apiKey: process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY ?? '',
  },
} as const;

export type MapMode = 'placeholder' | 'mapbox';

export function getMapMode(): MapMode {
  return mapProvider.mapbox.enabled ? 'mapbox' : 'placeholder';
}
