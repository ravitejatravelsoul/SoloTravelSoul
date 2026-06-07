# Foursquare Places Setup

Foursquare powers live place search (text query + nearby) in the Discover screen.
When disabled, the app shows bundled attractions only — fully functional, no API cost.

---

## What Foursquare enables

| Feature | Foursquare off | Foursquare on |
|---|---|---|
| Bundled attractions (33 places) | ✅ Always | ✅ |
| Live text search | ❌ "Coming soon" card | ✅ Real results |
| Nearby search (Near me button) | ❌ Skipped | ✅ Real results |
| Live place pins on map | ❌ Bundled only | ✅ Bundled + Foursquare |
| Save live place | ❌ | ✅ |
| Add live place to trip | ❌ | ✅ |

---

## Step 1 — Create a Foursquare account and app

1. Sign up at **https://developer.foursquare.com**
2. Create a new project
3. Go to **API Keys**
4. Copy the **Service API Key** (starts with: alphanumeric, not OAuth)

Note: the free tier allows up to 1,000 API calls/day.
For beta testing with a small user base this is sufficient.
Production usage with many users requires a paid plan.

---

## Step 2 — Local `.env`

In `apps/mobile/.env`:
```
EXPO_PUBLIC_FOURSQUARE_ENABLED=true
EXPO_PUBLIC_FOURSQUARE_API_KEY=YOUR_SERVICE_API_KEY_HERE
```

---

## Step 3 — Add EAS environment variables

```bash
cd apps/mobile

# For each environment (preview, production, development):
eas env:create --environment preview    --name EXPO_PUBLIC_FOURSQUARE_ENABLED --value "true"
eas env:create --environment preview    --name EXPO_PUBLIC_FOURSQUARE_API_KEY  --value "YOUR_KEY_HERE" --type secret

eas env:create --environment production --name EXPO_PUBLIC_FOURSQUARE_ENABLED --value "true"
eas env:create --environment production --name EXPO_PUBLIC_FOURSQUARE_API_KEY  --value "YOUR_KEY_HERE" --type secret

eas env:create --environment development --name EXPO_PUBLIC_FOURSQUARE_ENABLED --value "true"
eas env:create --environment development --name EXPO_PUBLIC_FOURSQUARE_API_KEY  --value "YOUR_KEY_HERE" --type secret
```

---

## Cost controls built into the service

The `foursquareService.ts` implements multiple layers of protection:

| Control | Limit | Location |
|---|---|---|
| Daily per-user call limit | 50 calls / user / day | `AsyncStorage` counter |
| Minimum query length | 3 characters | `discover/index.tsx` |
| Debounce | 600 ms | `discover/index.tsx` |
| Nearby search | One-shot on location tap only | Not continuous |
| Nearby result cap | 20 results max | `searchNearby()` |
| Firestore cache | 7-day TTL per query/location | `places_cache` collection |
| Cache-first | Checks Firestore before calling API | `searchPlaces()` |

---

## Security note — client-side key

The `EXPO_PUBLIC_FOURSQUARE_API_KEY` is embedded in the JS bundle and visible
to anyone who reverse-engineers the app. This is acceptable for beta because:

- The key is rate-limited at the Foursquare dashboard level
- The daily per-user limit (50 calls) in the app further restricts abuse
- Foursquare does not currently support IP/bundle-ID restrictions for Service API Keys

**Before public launch, evaluate:**
1. Setting a daily quota in the Foursquare dashboard
2. Moving Foursquare calls to Firebase Cloud Functions (server-side key)

If you implement Cloud Functions: the function fetches from Foursquare using a
server-side secret, the client calls the function. The API key never reaches the device.

---

## How the feature flag works

```typescript
// services/foursquareService.ts
const ENABLED = process.env.EXPO_PUBLIC_FOURSQUARE_ENABLED === 'true';

export function isFoursquareEnabled(): boolean {
  return ENABLED;
}
```

| Flag value | Result |
|---|---|
| `false` or not set | No API calls; "Coming soon" shown in search |
| `true`, no key | `isFoursquareConfigured()` returns false; graceful error shown |
| `true`, valid key | Live search active |

---

## To disable Foursquare (rollback, no rebuild needed)

```bash
eas env:update --environment production --name EXPO_PUBLIC_FOURSQUARE_ENABLED --value "false"
```

The app reverts to bundled attractions only.

---

## Searching from the Foursquare dashboard

To monitor API usage:
1. Go to **developer.foursquare.com → Your Project → Usage**
2. Check daily call counts per endpoint
3. Set email alerts if approaching the free tier limit

---

## Foursquare endpoints used

| Endpoint | Used for |
|---|---|
| `POST /v3/places/search` (query + lat/lng) | Text search |
| `POST /v3/places/nearby` or `GET /v3/places/search?near=...` | Nearby search |

Fields requested: `fsq_id,name,location,geocodes,categories,rating,photos`
