// ── Bundled attractions loaded from local assets/attractions.json ─────
// Zero API cost — bundled at build time.
export interface BundledAttraction {
  id: string;
  name: string;
  description: string;
  type: string;
  state: string;
  city?: string;
  imageName: string;
  latitude: number;
  longitude: number;
}

// ── User-saved place (Phase 1 + Phase 2) ─────────────────────────────
// Stored in /users/{uid}/saved_places/{id}
export interface SavedPlace {
  id: string;
  userId: string;
  name: string;
  category: string;
  localId?: string;     // Phase 1: bundled attraction ID
  fsqId?: string;       // Phase 2: Foursquare fsq_id
  city?: string;
  state?: string;
  description?: string;
  address?: string;
  notes?: string;
  savedAt: Date;
}

// ── User place review (Phase 2) ───────────────────────────────────────
// Stored in /user_place_reviews/{reviewId}
export interface PlaceReview {
  id: string;
  userId: string;
  placeId: string;      // Foursquare fsq_id or localId
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  photoURLs: string[];
  createdAt: Date;
}

// ── Phase 2: Foursquare cached place ─────────────────────────────────
// Every Foursquare result is written to Firestore places_cache so the
// same place is never fetched from the API twice (7-day TTL controlled
// by isCacheFresh() from dateUtils).
export interface CachedPlace {
  id: string;           // Foursquare fsq_id used as Firestore doc ID
  name: string;
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  category: string;
  rating: number | null;
  photoUrl: string | null;
  cachedAt: Date;
  source: 'foursquare' | 'manual';
}

// ── Phase 2: Discover feed item ───────────────────────────────────────
// Unified shape that both bundled attractions and Foursquare results
// map into, so the UI never needs to know which source was used.
export interface DiscoverItem {
  id: string;
  name: string;
  description: string;
  category: string;
  city?: string;
  region: string;
  rating?: number;
  photoUrl?: string;
  source: 'local' | 'foursquare';
  localId?: string;
  fsqId?: string;
  latitude?: number;
  longitude?: number;
}

// ── Phase 2: Foursquare integration interface ─────────────────────────
// This is the SHAPE of what the Foursquare API returns and how we'll
// map it. Implementation lives behind a feature flag in Phase 2.
// endpoint: GET https://api.foursquare.com/v3/places/search
//   params: query, ll (lat,lng), radius, limit, fields
// response.results → map each to CachedPlace → upsert to places_cache
// Read from places_cache first; only call API if cache miss or stale.
//
// interface FoursquareSearchResponse {
//   results: Array<{
//     fsq_id: string;
//     name: string;
//     location: { formatted_address: string; locality: string; country: string };
//     geocodes: { main: { latitude: number; longitude: number } };
//     categories: Array<{ name: string }>;
//     rating?: number;
//     photos?: Array<{ prefix: string; suffix: string }>;
//   }>;
// }

// ── Phase 2: Mapbox integration interface ─────────────────────────────
// Map view will use Mapbox GL JS / @rnmapbox/maps (managed workflow
// compatible via expo-modules). Trip pins cluster by destination.
// Static map thumbnails use Mapbox Static Images API (cached as trip
// cover photos in Firebase Storage to avoid per-request billing).
//
// interface MapboxStaticParams {
//   lon: number; lat: number; zoom: number;
//   width: number; height: number;
//   style: 'streets-v12' | 'outdoors-v12';
//   token: string; // EXPO_PUBLIC_MAPBOX_TOKEN
// }
