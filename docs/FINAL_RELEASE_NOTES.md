# SoloTravelSoul — Release Notes

## Version 1.0.0 (Initial Release)

**Release date:** May 2026

SoloTravelSoul is a personal travel companion built for the independent explorer — plan trips, capture memories, and discover new destinations, all in one place.

---

### What's included in 1.0.0

#### Trip Planning
- Create and manage multiple trips with destination, dates, and cover photo
- Build day-by-day itineraries with drag-to-reorder support
- Add places from Discover directly to any trip day
- Share trip summaries via the system share sheet

#### Itinerary & Map View
- Itinerary view with progress tracking (completed vs. remaining days)
- Interactive map view of all itinerary places, with numbered pins by day
- Works in Expo Go (web-based OpenStreetMap) and EAS builds (Mapbox native)

#### Travel Journal
- Rich journal entries with mood tracking, weather log, and free-form notes
- Photo attachments on each journal entry
- Entries linked to trip days for a unified timeline view

#### Discover
- Curated US destinations organized by category (beach, hiking, city, food, adventure, wellness, culture, road trip)
- Interactive map view of all destinations in the Discover feed
- Save/unsave places to a personal library
- "Near Me" feature uses coarse location (prompted only when tapped)

#### Packing Lists
- Auto-suggested packing items based on trip destination and type
- Check items off as you pack; progress tracked per trip

#### Group Chats
- Create a chat for any trip and invite travel companions by username
- Real-time messaging via Firebase

#### Profile
- Customizable profile: name, photo, bio, city/country, travel style preferences, favorite destinations
- View saved places library from profile
- Privacy Policy and Terms of Service accessible from within the app

#### Account Management
- Email/password authentication
- Password reset via email
- In-app account deletion with password re-authentication (Apple/Google guideline compliant)

---

### Platform Support

| Platform | Version |
|---|---|
| iOS | 16.0+ |
| Android | 7.0+ (API 24) |

---

### Privacy

- All user data (trips, journal entries, photos, preferences) is stored under the authenticated user's account in Firebase
- No data is sold to third parties or used for advertising
- Location data (coarse only) is used exclusively for the "Near Me" feature and is not stored
- Journal entries and trip data are encrypted in transit (HTTPS/TLS)
- Account and all associated data can be deleted at any time from Profile → Delete account

---

### Known Limitations in 1.0.0

See `docs/KNOWN_LIMITATIONS.md` for the full list. Key items:
- Push notifications are not implemented (no background alerts for chat messages)
- Foursquare live venue search is disabled by default (feature-flagged)
- Mapbox native map requires an EAS build; Expo Go uses OpenStreetMap web map
- No social feed or public trip sharing (trips are private)
- No Apple Sign-In / Google Sign-In (email/password only)

---

### Dependencies

| Package | Version | Purpose |
|---|---|---|
| Expo SDK | 52 | React Native framework |
| Expo Router | 4 | File-based navigation |
| Firebase JS SDK | 11 | Auth, Firestore, Storage |
| React Native WebView | 13 | Web-based map in Expo Go |
| Zustand | 5 | Global state management |
| Leaflet.js (CDN) | 1.9 | Map rendering in WebView |
| OpenStreetMap | — | Free map tiles (no API key) |

---

### Build

Built with Expo Application Services (EAS). Managed workflow — no Xcode or Android Studio required for building.

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```
