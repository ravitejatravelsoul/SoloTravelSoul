# Map Strategy

## Architecture

SoloTravelSoul uses a **two-tier map architecture** that gives every user a real interactive
map regardless of build type.

```
canUseMapbox?  (ENABLED=true AND TOKEN present AND NOT Expo Go)
│
├─ yes → Mapbox native  (@rnmapbox/maps 10.3.1, GPU-rendered vector tiles)
│
└─ no  → WebLeafletMap  (react-native-webview + Leaflet.js + OpenStreetMap)
            │
            └─ mapErrored? → empty-state placeholder
```

---

## Tier 1 — WebLeafletMap (Expo Go + fallback)

Active whenever `canUseMapbox` is false:
- Flag disabled (`EXPO_PUBLIC_MAPBOX_ENABLED ≠ 'true'`)
- Token missing (`EXPO_PUBLIC_MAPBOX_TOKEN` empty)
- Running in Expo Go (`Constants.appOwnership === 'expo'`)

### How it works

- `WebLeafletMap` renders a `react-native-webview` with self-contained HTML
- Leaflet.js loaded from `unpkg.com` CDN (`leaflet@1.9.4`)
- Map tiles: `tile.openstreetmap.org` — free, no API key, no billing
- Markers are styled `L.divIcon` circles; day-numbered trip pins include a label
- Pin taps post `{ type: 'pinTap', id }` over the WebView bridge to React Native
- React Native looks up the full pin by ID and shows native UI (bottom card or name toast)
- On error, gracefully degrades to an empty-state placeholder

### Components

| Component | Used in | Purpose |
|---|---|---|
| `WebLeafletMap` | `DiscoverMapView`, `TripMapView` | Shared WebView renderer |
| `DiscoverWebMap` | `DiscoverMapView` | Bundled + Foursquare pins with bottom card |
| `TripWebMap` | `TripMapView` | Day-numbered pins with name toast |

### No Google APIs

Google Maps and Google Places are never used. Reasons:
- No free tier; meters every tile and API call
- Prior billing incident with Google APIs in the original SwiftUI app
- Foursquare + OpenStreetMap provide equivalent functionality at zero metered cost

OSM attribution control is always visible (links to OSM copyright notice).

---

## Tier 2 — Mapbox Native (EAS dev / production builds)

### Package

`@rnmapbox/maps@10.3.1` — installed in `apps/mobile/package.json`, plugin in `app.json`.

### Guard (triple condition — all must be true)

```ts
// apps/mobile/services/mapboxService.ts
export const canUseMapbox = ENABLED && !!TOKEN && !IS_EXPO_GO;
```

| Condition | How to satisfy |
|---|---|
| `EXPO_PUBLIC_MAPBOX_ENABLED === 'true'` | Set in `.env` |
| `EXPO_PUBLIC_MAPBOX_TOKEN` present | Set in `.env` |
| Not Expo Go | Run an EAS dev or production build |

In Expo Go, `IS_EXPO_GO` is always true → `canUseMapbox` is always false → Mapbox is never imported.

### Lazy-load with safety

`getMapboxGL()` in `mapboxService.ts` only executes the `require('@rnmapbox/maps')` if
`canUseMapbox` is true, and wraps it in `try/catch`. If the native module fails to link,
`getMapboxGL()` returns `null` and the components fall back to WebLeafletMap.

### Components

| Component | Used in | Purpose |
|---|---|---|
| `DiscoverMapNative` | `DiscoverMapView` | Native map with attraction + live pins, bottom card |
| `TripMapNative` | `TripMapView` | Native map with day-numbered circle pins, name toast |

---

## Enabling Mapbox for an EAS Build

### Step 1 — Get tokens from Mapbox

1. Go to https://account.mapbox.com/
2. **Public token** (`pk.eyJ1...`) — runtime token, used by the app
3. **Secret downloads token** (`sk.eyJ1...`) — build-time token, Android only

### Step 2 — Set local env vars

In `apps/mobile/.env`:

```
EXPO_PUBLIC_MAPBOX_ENABLED=true
EXPO_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...your-public-token...
```

### Step 3 — Add EAS secrets

```bash
cd apps/mobile

# Public token (used at runtime; safe to expose but store as secret for cleanliness)
eas secret:create --scope project --name EXPO_PUBLIC_MAPBOX_TOKEN --value "pk.eyJ1..."

# Downloads token (Android build-time only; MUST be secret)
eas secret:create --scope project --name MAPBOX_DOWNLOADS_TOKEN --value "sk.eyJ1..."
```

### Step 4 — Build

```bash
# iOS development build (install on device via TestFlight or direct install)
eas build --profile development --platform ios

# Android development build (install .apk directly)
eas build --profile development --platform android
```

Do NOT open in Expo Go after building — install the dev build directly on device.

---

## Cost Notes

| Service | Cost model | Risk |
|---|---|---|
| OpenStreetMap tiles | Free (tile.openstreetmap.org) | None for low traffic; consider a tile CDN at scale |
| Mapbox mobile SDK | Free up to 50,000 monthly active users, then $0.50/MAU | Low — disabled by default; enable when ready to pay |
| Foursquare Places API | Free tier: 1,000 calls/day | None — disabled by default |

---

## Mapbox Android Downloads Token — Why It's Needed

Mapbox distributes the Android SDK via a private Maven repository. Android builds must
authenticate with a secret token (`sk.eyJ1...`) to download the `.aar` artifacts.

- This token is consumed only during `eas build --platform android`
- It is NOT needed for iOS builds or Expo Go development
- It is stored as an EAS project secret (`MAPBOX_DOWNLOADS_TOKEN`)
- The `app.json` plugin config references it as `"$MAPBOX_DOWNLOADS_TOKEN"` — EAS
  substitutes the real value at build time; this literal string is harmless in Expo Go
