import AsyncStorage from '@react-native-async-storage/async-storage';
import { searchCachedPlaces, upsertCachedPlace } from '@solotravelsoul/firebase';
import type { CachedPlace, DiscoverItem } from '@solotravelsoul/shared';

const ENABLED = process.env.EXPO_PUBLIC_FOURSQUARE_ENABLED === 'true';
const API_KEY = process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY ?? '';

const DAILY_LIMIT = 50;
const dailyLimitKey = (uid: string) =>
  `fsq_daily_${uid}_${new Date().toISOString().slice(0, 10)}`;

export interface PlaceSearchResult {
  results: DiscoverItem[];
  source: 'foursquare' | 'cache' | 'disabled' | 'rate_limited';
}

// Raw shape returned by the Foursquare Places Search API
interface RawFsqPlace {
  fsq_id: string;
  name: string;
  location: { formatted_address: string; locality: string; country: string };
  geocodes: { main: { latitude: number; longitude: number } };
  categories: Array<{ name: string }>;
  rating?: number;
  photos?: Array<{ prefix: string; suffix: string }>;
}

function logApiCall(endpoint: string, params: Record<string, unknown>): void {
  if (__DEV__) {
    console.log('[Foursquare]', endpoint, JSON.stringify(params));
  }
}

async function getDailyCount(uid: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(dailyLimitKey(uid));
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

async function incrementDailyCount(uid: string): Promise<void> {
  try {
    const count = await getDailyCount(uid);
    await AsyncStorage.setItem(dailyLimitKey(uid), String(count + 1));
  } catch {
    // Non-critical — continue without updating counter
  }
}

function rawToDiscoverItem(r: RawFsqPlace): DiscoverItem {
  return {
    id: r.fsq_id,
    name: r.name,
    description: r.location.formatted_address,
    category: r.categories[0]?.name ?? 'Place',
    city: r.location.locality,
    region: r.location.country,
    rating: r.rating,
    photoUrl: r.photos?.[0]
      ? `${r.photos[0].prefix}300x300${r.photos[0].suffix}`
      : undefined,
    source: 'foursquare' as const,
    fsqId: r.fsq_id,
    latitude: r.geocodes?.main?.latitude,
    longitude: r.geocodes?.main?.longitude,
  };
}

function rawToCachedPlace(r: RawFsqPlace): CachedPlace {
  return {
    id: r.fsq_id,
    name: r.name,
    address: r.location.formatted_address,
    city: r.location.locality ?? '',
    country: r.location.country ?? '',
    latitude: r.geocodes?.main?.latitude ?? 0,
    longitude: r.geocodes?.main?.longitude ?? 0,
    category: r.categories[0]?.name ?? 'Place',
    rating: r.rating ?? null,
    photoUrl: r.photos?.[0]
      ? `${r.photos[0].prefix}300x300${r.photos[0].suffix}`
      : null,
    cachedAt: new Date(),
    source: 'foursquare' as const,
  };
}

// Shared fetch + rate-limit + cache-write logic used by both searchPlaces and searchNearby.
async function callFoursquareSearch(
  params: URLSearchParams,
  uid: string
): Promise<PlaceSearchResult> {
  const count = await getDailyCount(uid);
  if (count >= DAILY_LIMIT) {
    console.warn('[Foursquare] Daily search limit reached for uid:', uid);
    return { results: [], source: 'rate_limited' };
  }

  logApiCall('GET /v3/places/search', Object.fromEntries(params));

  try {
    const res = await fetch(
      `https://api.foursquare.com/v3/places/search?${params.toString()}`,
      { headers: { Authorization: API_KEY, Accept: 'application/json' } }
    );

    if (!res.ok) {
      console.error('[Foursquare] API error:', res.status, res.statusText);
      return { results: [], source: 'foursquare' };
    }

    const data = await res.json() as { results: RawFsqPlace[] };
    await incrementDailyCount(uid);

    const items = data.results.map(rawToDiscoverItem);

    // Write to Firestore cache — fire and forget so next text search hits cache
    const cachePlaces = data.results.map(rawToCachedPlace);
    Promise.all(cachePlaces.map((p) => upsertCachedPlace(p))).catch(
      (err) => console.warn('[Foursquare] cache write failed:', err)
    );

    return { results: items, source: 'foursquare' };
  } catch (err) {
    console.error('[Foursquare] fetch error:', err);
    return { results: [], source: 'foursquare' };
  }
}

/**
 * Text search for places matching `query`.
 * Cache-first: checks Firestore places_cache before hitting the API.
 * Min 3-char guard and 600ms debounce are enforced at the call site.
 */
export async function searchPlaces(
  query: string,
  uid: string,
  options?: { ll?: string; limit?: number }
): Promise<PlaceSearchResult> {
  if (!ENABLED) return { results: [], source: 'disabled' };
  if (!API_KEY) {
    console.warn('[Foursquare] API key not configured — set EXPO_PUBLIC_FOURSQUARE_API_KEY');
    return { results: [], source: 'disabled' };
  }

  // Cache-first: Firestore hit avoids API quota cost entirely
  try {
    const cached = await searchCachedPlaces(query, options?.limit ?? 10);
    if (cached.length > 0) {
      return { results: cached.map(cachedPlaceToDiscoverItem), source: 'cache' };
    }
  } catch {
    // Cache read failed (offline or Firestore rules) — fall through to live API
  }

  const params = new URLSearchParams({
    query,
    limit: String(options?.limit ?? 10),
    fields: 'fsq_id,name,location,geocodes,categories,rating,photos',
  });
  if (options?.ll) params.set('ll', options.ll);

  return callFoursquareSearch(params, uid);
}

/**
 * Find places near the given coordinates — no text filter.
 * Does NOT use the text cache (location-based, not query-based).
 * Shares the same per-user daily limit as searchPlaces.
 * Results are written to Firestore cache to warm future text searches.
 */
export async function searchNearby(
  coords: { latitude: number; longitude: number },
  uid: string,
  limit = 20
): Promise<PlaceSearchResult> {
  if (!ENABLED) return { results: [], source: 'disabled' };
  if (!API_KEY) {
    console.warn('[Foursquare] API key not configured — set EXPO_PUBLIC_FOURSQUARE_API_KEY');
    return { results: [], source: 'disabled' };
  }

  const ll = `${coords.latitude.toFixed(4)},${coords.longitude.toFixed(4)}`;
  const params = new URLSearchParams({
    ll,
    limit: String(limit),
    fields: 'fsq_id,name,location,geocodes,categories,rating,photos',
  });

  return callFoursquareSearch(params, uid);
}

/** Returns true if the Foursquare feature flag is on. */
export function isFoursquareEnabled(): boolean {
  return ENABLED;
}

/** Maps a Firestore CachedPlace into the unified DiscoverItem UI shape. */
export function cachedPlaceToDiscoverItem(p: CachedPlace): DiscoverItem {
  return {
    id: p.id,
    name: p.name,
    description: p.address,
    category: p.category,
    city: p.city,
    region: p.country,
    rating: p.rating ?? undefined,
    photoUrl: p.photoUrl ?? undefined,
    source: 'foursquare',
    fsqId: p.id,
    latitude: p.latitude || undefined,
    longitude: p.longitude || undefined,
  };
}
