# Place Search Strategy

## Why not Google Places?

The original iOS version of SoloTravelSoul used the Google Places API (Text Search + Place Details + Photos). This caused unexpected charges:

- **Text Search**: $17 per 1,000 requests
- **Place Details**: $17 per 1,000 requests  
- **Photos**: $7 per 1,000 requests

The API key was hardcoded in two source files with no debounce, no caching, and no key restrictions. A single power user (or a key leak) could generate hundreds of dollars in charges in a day.

**Decision**: Never use Google Maps or uncached Google Places again. All place search uses Foursquare (free tier) with a mandatory cache-first strategy.

---

## Foursquare API (Phase 2)

**Why Foursquare:**
- Free tier: 1,000 API calls/day, no credit card required to start
- `/v3/places/search` endpoint: query + lat/lon + radius → list of places with name, address, category, rating, photos
- No per-photo charge (photos are included in the Place Details response)

**Endpoint used:**
```
GET https://api.foursquare.com/v3/places/search
  ?query=<text>
  &ll=<lat,lon>          # optional — improves relevance
  &radius=50000          # meters
  &limit=10
  &fields=fsq_id,name,location,geocodes,categories,rating,photos
Authorization: <EXPO_PUBLIC_FOURSQUARE_API_KEY>
```

**API Key type — Service API Key only:**

The Foursquare Developer Dashboard (`developer.foursquare.com`) shows three credential types:

| Credential type | Used here? | Notes |
|---|---|---|
| **Service API Keys** | **Yes** | For `/v3/places/search` — copy this key into `.env` |
| OAuth Client ID / Secret | No | For user-facing OAuth flows — not needed |
| Legacy API Keys | No | For deprecated v2 API — ignored by v3 endpoints |

The `Authorization` header must contain the **Service API Key** exactly as shown in the dashboard. No `Bearer ` prefix, no `fsq3p_` prefix check — the key is passed as-is. A 401/403 response means the wrong key type was used or the key has been suspended.

**Feature flag:**  
`EXPO_PUBLIC_FOURSQUARE_ENABLED=false` in `.env`. The service returns `{ results: [], source: 'disabled' }` when false — zero API calls possible without explicitly enabling it. Set to `true` only after verifying the cost controls below.

---

## Cache-first Design

Every Foursquare result is written to Firestore `places_cache/{fsq_id}` immediately after it's fetched. Future searches check the cache first.

**Cache TTL:** 7 days (checked by comparing `cachedAt` timestamp before calling the API).

**Cache schema** (`CachedPlace` in `packages/shared/src/types/Place.ts`):
```typescript
{
  id: string;           // Foursquare fsq_id — also the Firestore doc ID
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
```

**Firestore helpers** (in `packages/firebase/src/firestore.ts`):
- `getCachedPlace(fsqId)` — single place by Foursquare ID
- `upsertCachedPlace(place)` — write/overwrite one place
- `searchCachedPlaces(query, limit?)` — fetch recent cache entries, filter client-side

**Firestore security rules** (add to `firestore.rules`):
```
match /places_cache/{placeId} {
  allow read: if request.auth != null;       // any signed-in user can read
  allow write: if request.auth != null;      // any user can populate cache
}
```

---

## Cost Control Rules

All rules are enforced in `apps/mobile/services/foursquareService.ts`.

| Control | Value | Why |
|---|---|---|
| Feature flag | `EXPO_PUBLIC_FOURSQUARE_ENABLED=false` | Hard off switch — zero calls without explicit opt-in |
| Minimum query length | 3 characters | Avoids single-letter searches that return huge result sets |
| Debounce | 600ms | Stops firing on every keystroke; user pauses before search triggers |
| Per-user daily limit | 50 searches | Prevents any one user from exhausting the free tier |
| Cache-first | 7-day TTL | Repeat searches for the same query never hit the API |
| Admin kill switch | `EXPO_PUBLIC_FOURSQUARE_ENABLED=false` | Same as feature flag — flip to false, redeploy, zero calls |
| API key restriction | Set in Foursquare dashboard | Restrict to your app's bundle ID to prevent key theft |
| Deduplication | `fsq_id` as Firestore doc ID | `upsertCachedPlace` is idempotent — writing the same place twice costs nothing extra |

---

## UI Behaviour (Current State)

The Discover screen currently operates in **local-only mode**:

1. Search filters the 33 bundled attractions in `assets/attractions.json` — zero API calls.
2. When query has ≥ 3 characters, a "Live destinations" section appears below local results.
3. Because `EXPO_PUBLIC_FOURSQUARE_ENABLED=false`, this section shows a **"Coming soon"** card rather than real results.
4. Debounce (600ms) runs regardless — it's in place for when live search is enabled.

**Enabling live search (Phase 2 checklist):**
- [ ] Sign up at `developer.foursquare.com`, create a project
- [ ] Go to **Service API Keys** tab — copy the key shown there
- [ ] Set `EXPO_PUBLIC_FOURSQUARE_ENABLED=true` in `apps/mobile/.env`
- [ ] Set `EXPO_PUBLIC_FOURSQUARE_API_KEY=<service-api-key>` in `apps/mobile/.env`
- [ ] Deploy Firestore `places_cache` security rules
- [ ] Open the app, tap map mode, tap the locate button — Metro should log `[Foursquare] searchNearby at …`
- [ ] If the map shows "Foursquare key rejected", the key is wrong type — re-check the **Service API Keys** tab
- [ ] Monitor daily call count in Foursquare dashboard for first 48h
