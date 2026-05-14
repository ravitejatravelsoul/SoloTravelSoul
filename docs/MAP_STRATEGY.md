# Map Strategy

## Overview

SoloTravelSoul uses a two-tier map architecture that provides a real interactive map in all environments — Expo Go during development and native Mapbox in EAS production builds.

## Current: WebLeaflet (Expo Go)

When `canUseMapbox` is false (Expo Go, or Mapbox flag/token absent), the app renders a WebView-based map powered by **Leaflet.js** over **OpenStreetMap** tiles.

### How it works

- `WebLeafletMap` renders a `react-native-webview` containing self-contained HTML
- Leaflet.js is loaded from unpkg CDN (`leaflet@1.9.4`)
- Map tiles are fetched from `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (free, no API key)
- Markers are styled `L.divIcon` circles; numbered markers include a day label
- Pin taps post `{ type: 'pinTap', id }` over the WebView bridge to React Native
- React Native looks up the full pin data by ID and shows native UI (bottom sheet card or name toast)
- Map errors fall back to an empty-state placeholder

### Components

| Component | Used in | Purpose |
|---|---|---|
| `WebLeafletMap` | `DiscoverMapView`, `TripMapView` | Shared WebView map renderer |
| `DiscoverWebMap` | `DiscoverMapView` | Bundled + Foursquare pins on Discover screen |
| `TripWebMap` | `TripMapView` | Day-numbered pins on trip itinerary map |

### No Google APIs

Google Maps and Google Places are never used. Reasons:
- Google Maps Platform has no free tier and meters every tile/API call
- A prior billing incident occurred with Google APIs in the original SwiftUI app
- Foursquare + OpenStreetMap provide equivalent functionality with predictable costs

### OpenStreetMap attribution

OpenStreetMap tiles are free for reasonable use. The Leaflet attribution control is kept visible (it links to the OSM copyright notice). If traffic grows significantly, consider self-hosting tiles via a provider like Stadia Maps or Mapbox's OSM-compatible style.

---

## Future: Mapbox Native (EAS dev / production)

When `canUseMapbox` is true, the app uses `@rnmapbox/maps` for native GPU-rendered vector maps with offline support and full Mapbox style customisation.

### Guard

```ts
// services/mapboxService.ts
export const canUseMapbox = ENABLED && !!TOKEN && !IS_EXPO_GO;
```

All three conditions must be true:
- `EXPO_PUBLIC_MAPBOX_ENABLED=true` in `.env`
- `EXPO_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...` in `.env`
- Running in a real native build (not Expo Go)

### Enabling Mapbox

1. `cd apps/mobile && npm install @rnmapbox/maps@^10.1.0`
2. Add `"@rnmapbox/maps"` to `plugins` in `app.json`
3. Uncomment the `require` lines in `mapboxService.ts`
4. Set env vars (see `.env.example`)
5. `eas build --profile development --platform ios` (or android)
6. Install the dev build on device — **do not open in Expo Go**

### Components

| Component | Used in | Purpose |
|---|---|---|
| `DiscoverMapNative` | `DiscoverMapView` | Mapbox map for Discover screen |
| `TripMapNative` | `TripMapView` | Mapbox map for trip itinerary |

---

## Routing Logic

```
canUseMapbox?
  yes → Mapbox native components
  no  →
    mappable places/pins exist?
      yes → WebLeaflet components
      no  → empty state placeholder
```
