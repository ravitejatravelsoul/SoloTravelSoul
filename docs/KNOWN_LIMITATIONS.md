# Known Limitations — SoloTravelSoul 1.0.0

This document lists the known gaps and intentional deferrals in the 1.0.0 release. None of these are blocking for store submission — all are acceptable tradeoffs for a v1.

---

## Notifications

**Push notifications are not implemented.**

Chat messages and trip activity do not trigger push alerts. Users must open the app to see new messages. Firebase Cloud Messaging (FCM) is set up in the Firebase project but the client-side notification registration and display logic is not yet wired.

*Impact:* Chat is less real-time from the user's perspective. Group chat works, but is pull-only.

*App Store risk:* None — notifications are not promised in the store listing.

---

## Foursquare Live Venue Search

**Live place search (Foursquare) is disabled by default.**

The `EXPO_PUBLIC_FOURSQUARE_ENABLED` feature flag is `false`. The search bar in Discover shows only the curated local dataset. Live search requires the flag to be enabled and a valid `EXPO_PUBLIC_FOURSQUARE_API_KEY`.

*Impact:* Discover shows ~100 curated US destinations, not live search results.

*App Store risk:* None — reviewers will see the curated list, which is fully functional.

---

## Mapbox Native Map (Expo Go)

**Mapbox requires an EAS build; it will never load in Expo Go.**

The guard `canUseMapbox = ENABLED && !!TOKEN && !IS_EXPO_GO` is always false during Expo Go development. The app falls back to an OpenStreetMap web map (via react-native-webview + Leaflet.js). The web map is fully functional for trip maps and discover maps.

*Impact:* Dev/preview testing uses OSM tiles. Production EAS builds can use Mapbox once enabled (see `docs/MAP_STRATEGY.md`).

*App Store risk:* None — the store build will use the same OSM web map unless Mapbox is explicitly enabled.

---

## Authentication Methods

**Only email/password authentication is supported.**

Apple Sign-In and Google Sign-In are not implemented. These are recommended (Apple Sign-In is required by App Store guidelines if any other third-party login is offered — but since we only offer email/password, it is not required).

*Impact:* Users must register with email and password.

*App Store risk:* None as long as no third-party OAuth is offered. If Google Sign-In is added later, Apple Sign-In must be added at the same time.

---

## Trip Privacy

**All trips are private.**

There is no public trip sharing, social feed, or "follow user" feature. The share button exports a text summary via the system share sheet — it does not create a public link.

*Impact:* No social discovery. Users cannot share interactive trip views.

*App Store risk:* None — the store listing does not claim social features.

---

## Offline Support

**Read-only offline support via Firestore cache.**

Firestore's built-in offline persistence means previously loaded trips and itineraries are readable when offline. However, creating new trips, writing journal entries, or sending chat messages requires a network connection.

*Impact:* Users on a plane can view their existing itinerary but not edit it.

*App Store listing:* The listing says "Your trips and itineraries are available even without an internet connection" — this is accurate for the read case. The reviewer notes clarify this.

---

## Chat — No Moderation or Profanity Filter

**Group chat has no automated content moderation.**

User-generated chat messages are stored directly in Firestore. There is no profanity filter or AI moderation. The Terms of Service (accessible from Profile) prohibit abusive content.

*Impact:* This is a known v1 gap. Acceptable for a friends/family coordination feature with a small user base at launch.

*App Store risk:* Low — reviewers are told this is a friend/family coordination feature in the reviewer notes. ToS covers acceptable use.

---

## Itinerary — No Drag-to-Reorder Between Days

**Within a day, items can be reordered. Moving items between days requires delete + re-add.**

The itinerary drag-and-drop is implemented per-day only. Cross-day reordering is not supported.

*Impact:* Minor UX gap; works around by removing and re-adding a place on a different day.

---

## Photo Storage

**Journal photos are uploaded to Firebase Storage.**

There is no image compression or size limit enforced client-side. Large photos (from modern phone cameras) may upload slowly on slow connections.

*Impact:* Users on slow connections may notice delays when adding journal photos.

---

## Account Deletion — Firestore Data

**Deleting an account immediately deletes the Firebase Auth user but Firestore documents are cleaned up asynchronously.**

The `deleteCurrentUser` function deletes the Firebase Auth account. Orphaned Firestore documents (trips, journals, chat messages) are removed by a Cloud Functions background job (or left for a 30-day cleanup cycle, per the Privacy Policy).

*Impact:* If the Cloud Function is not deployed, Firestore data persists after account deletion but is inaccessible (no auth token). The Privacy Policy states data is deleted within 30 days.

*Action required:* Deploy the `onUserDeleted` Cloud Function before launch (see `packages/functions/`).

---

## Android — Firebase google-services.json

**`apps/mobile/google-services.json` must be present for Android builds.**

This file is in `.gitignore` and is not committed to the repository. It must be added as an EAS secret or placed locally before running `eas build --platform android`.

*Action required:* Add `google-services.json` as an EAS secret or download it from the Firebase Console before the Android build.

---

## iOS — GoogleService-Info.plist

**`apps/mobile/GoogleService-Info.plist` must be present for iOS builds.**

This file is in `.gitignore` and is not committed. The old `GoogleService-Info.plist` at the monorepo root (from the original SwiftUI project) was already removed from git tracking.

*Action required:* Download the correct `GoogleService-Info.plist` for the `com.solotravelsoul.app` bundle ID from Firebase Console, place at `apps/mobile/GoogleService-Info.plist`, and add as an EAS secret.

---

## Summary Table

| Limitation | Severity | Store Risk | Action Required Before Launch |
|---|---|---|---|
| No push notifications | Medium | None | No |
| Foursquare search disabled | Low | None | No |
| Mapbox requires EAS build | Info | None | No |
| Email-only auth | Low | None | No |
| Trips are private | Info | None | No |
| Offline = read-only | Low | None | No |
| No chat moderation | Medium | Low | No (ToS covers it) |
| No cross-day drag | Low | None | No |
| No photo compression | Low | None | No |
| Firestore cleanup is async | Medium | None | Deploy Cloud Function |
| `google-services.json` not in repo | High | Blocks Android build | Add EAS secret |
| `GoogleService-Info.plist` not in repo | High | Blocks iOS build | Add EAS secret |
