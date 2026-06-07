# Map Strategy

## Production Architecture

```
canUseMapbox?  (MAPBOX_ENABLED=true AND pk token set AND NOT Expo Go)
│
├─ YES → Mapbox native SDK                    ← EAS dev/production builds
│         DiscoverMapNative  (interactive street map, attraction + live pins, UserLocation)
│         TripMapNative      (interactive street map, day pins, route line, UserLocation)
│
└─ NO  → NativeMapCanvas                      ← Expo Go + fallback for any build
           Pure React Native coordinate projection
           No WebView · No CDN · No paid API at render time
           Works everywhere
```

---

## Foursquare Places

```
isFoursquareEnabled()?  (FOURSQUARE_ENABLED=true AND API key set)
│
├─ YES → Live search (text + nearby) in Discover
│         Results cached in Firestore places_cache (7-day TTL)
│         50 calls/user/day hard limit in app code
│
└─ NO  → Bundled attractions only (33 places, always available)
```

---

## Feature Flag Matrix

| Scenario | Mapbox | Foursquare | Map UI | Places |
|---|---|---|---|---|
| Expo Go (any config) | off | off | NativeMapCanvas | Bundled only |
| EAS build, no tokens | off | off | NativeMapCanvas | Bundled only |
| EAS build, Mapbox only | on | off | Real street map | Bundled only |
| EAS build, both on | on | on | Real street map | Bundled + live search |

---

## Why not WebLeaflet?

`WebLeafletMap.tsx` was removed from the production path because Expo Go's debugging
bridge injects an AMD-compatible `define()` into the WebView JavaScript context.
Leaflet's UMD factory detects `define.amd` and defers module initialization asynchronously,
meaning `window.L` is never assigned synchronously when the next `<script>` block runs.
This is an Expo Go environment issue that cannot be patched from the app side without
a full native EAS build — which would remove the reason for using WebLeaflet.

`WebLeafletMap.tsx` is kept for reference only. Do not use it in production paths.

---

## Files

| File | Status | Used in |
|---|---|---|
| `components/map/NativeMapCanvas.tsx` | **Active fallback** | DiscoverMapView, TripMapView |
| `components/map/DiscoverMapView.tsx` | **Active** | Discover screen |
| `components/map/TripMapView.tsx` | **Active** | Trip detail screen |
| `services/mapboxService.ts` | **Active** | Drives `canUseMapbox` |
| `services/foursquareService.ts` | **Active** | Drives live search |
| `components/map/WebLeafletMap.tsx` | Reference only | Not imported in prod |
| `components/map/MapPlaceholder.tsx` | Reference only | Not imported in prod |
| `assets/leaflet/leaflet-bundle.ts` | Reference only | Not imported in prod |

---

## Environment Variables

| Variable | Required for | Default |
|---|---|---|
| `EXPO_PUBLIC_MAPBOX_ENABLED` | Mapbox maps | `false` |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Mapbox maps (public pk token) | `""` |
| `MAPBOX_DOWNLOADS_TOKEN` | EAS build (sk token, secret) | not set |
| `EXPO_PUBLIC_FOURSQUARE_ENABLED` | Live place search | `false` |
| `EXPO_PUBLIC_FOURSQUARE_API_KEY` | Live place search | set, unused when disabled |
| `EXPO_PUBLIC_FIREBASE_*` (6 vars) | Auth + Firestore + Storage | set in EAS |
| `GOOGLE_SERVICES_JSON` | Firebase Android native | EAS secret |
| `GOOGLE_SERVICE_INFO_PLIST` | Firebase iOS native | EAS secret |

---

## Phase 2+ Roadmap

| Feature | What it needs |
|---|---|
| WebLeaflet in prod | Custom EAS dev build; AMD fix via `injectedJavaScriptBeforeContentLoaded` |
| Foursquare server-side | Firebase Cloud Function wrapping FSQ API; key never in bundle |
| Map clusters | `@rnmapbox/maps` clustering API or client-side binning in NativeMapCanvas |
| Routing / turn-by-turn | Mapbox Navigation SDK (separate paid product) |
| Custom map style | Mapbox Studio (free); replace `streets-v12` URL |
| Offline maps | Mapbox Offline API (already in @rnmapbox/maps) |
