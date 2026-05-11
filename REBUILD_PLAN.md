# SoloTravelSoul — Full Rebuild Plan
> Senior architect review | Generated 2026-05-07

---

## PART 1 — What the App Is and Does

### App Purpose
SoloTravelSoul is a **solo and group travel planning app** targeted at independent travelers. It combines:
- Personal trip planning and itinerary management
- A social layer (group trips, group chat)
- Place discovery powered by Google Places
- Travel journaling
- Push notifications for group activity

### Main Features Found in Code

| Feature | Status | Files |
|---------|--------|-------|
| Email/password auth + biometric | Complete | AuthViewModel, BiometricAuthManager |
| Trip create/edit/delete | Complete | CreateTripView, EditTripView, TripCoreModels |
| Day-by-day itinerary | Complete | ItineraryView, ItineraryDay, ItineraryPlanner |
| Travel journal per day | Complete | JournalView, JournalEntry |
| Place discovery (Google) | Complete | DiscoverView, GooglePlacesService |
| Group trip planning | Complete | GroupViewModel, GroupListView, GroupDetailView |
| Real-time group chat | Complete | GroupChatView, GroupChatsManager |
| Push notifications (FCM) | Complete | NotificationsView, FCM setup |
| User profile + preferences | Complete | ProfileView, UserProfile |
| Companion suggestions | Partial | CompanionSuggestionViewModel (1.1KB stub) |
| Onboarding | Complete | OnboardingView |

### Screens Count
60+ SwiftUI views organized in 8 feature folders.

---

## PART 2 — Current Architecture

### iOS Technology Used
- **Language:** Swift 5.5+
- **UI:** SwiftUI (declarative, modern)
- **Architecture:** MVVM (ViewModels + Services + Models)
- **State management:** `@StateObject`, `@EnvironmentObject`, `@Published`
- **Package manager:** Swift Package Manager (SPM)

### Folder Structure
```
SoloTravelSoul/
├── AppDelegate.swift           ← Firebase + Google Places init
├── AppTheme/                   ← Design system (colors, typography, components)
├── Models/ (22 files)          ← Data models + business logic
├── Services/ (3 files)         ← API + Firestore services
├── ViewModels/ (4 files)       ← Business logic + state
├── Views/ (60+ files)          ← All screens, organized by feature
└── SoloTravelSoul/             ← App bundle (Info.plist, Assets)
```

### Backend / Database
- **Firebase Auth** — email/password + biometric
- **Firestore** — all data (users, trips, groups, chats, notifications)
- **Firebase Storage** — profile images
- **Firebase Cloud Messaging** — push notifications

### Firestore Collections
```
users/{uid}/trips/{tripId}
groups/{groupId}
groupChats/{groupId}/messages/{msgId}
groupChats/{groupId}/requests/{userId}
preferences/ destinations/ languages/
```

### Google APIs Used
1. **Google Places API v1** — `/v1/places:searchText` (text search)
2. **Google Places API (legacy)** — `/maps/api/place/details/json`
3. **Google Places Photos** — `/maps/api/place/photo` + new photo API
4. **Google Maps SDK for iOS** — map rendering + directions launcher

---

## PART 3 — What Caused High Billing

### The Root Causes

**1. Google Places Text Search — $17 per 1,000 calls**
Every time a user typed in the search bar to find a place, it called the Places API.
No debounce, no cache, no result storage → repeated calls for the same query.

**2. Google Places Details — $17 per 1,000 calls**
Opening a place detail screen called the API each time.
No local caching of already-fetched place data.

**3. Google Places Photos — $7 per 1,000 calls**
Each place card showed a photo fetched live from Google.
Multiple photos per place × multiple place cards = rapid billing.

**4. API key was hardcoded and exposed in source code**
```swift
// AppDelegate.swift line 13 — EXPOSED IN GIT HISTORY
GMSPlacesClient.provideAPIKey("AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU")

// DiscoverView.swift line 11 — DUPLICATE EXPOSURE
private let GOOGLE_PLACES_API_KEY = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU"
```

If this key was ever in a public GitHub repo or visible to others, **anyone could have used it** to make API calls billed to your account. This is the most likely cause of unexpected charges.

**5. No quota limits or billing alerts were set**
No daily cap, no budget alert, no API key restrictions by app bundle ID.

---

## PART 4 — Reusable vs. Rebuild

### Keep and Reuse (Logic / Design Reference)
| What | Why |
|------|-----|
| Firestore data model design | Clean structure, translate directly |
| UserProfile model fields | Complete, well-thought-out |
| PlannedTrip + ItineraryDay + JournalEntry | Core domain, directly portable |
| GroupTrip + GroupMessage | Well designed, reuse in new stack |
| AppTheme color/typography values | Extract as design tokens |
| ThemedComponents patterns | Reimplement in React Native |
| BiometricAuth pattern | react-native-biometrics has same API |
| NotificationItem model | Direct port |
| GroupViewModel logic | Port to React Native hooks |

### Rebuild Fresh
| What | Why |
|------|-----|
| Google Places integration | Replace with budget-safe alternative |
| Google Maps SDK | Replace with OpenStreetMap / Mapbox free tier |
| Hardcoded API keys | Must never happen again |
| iOS-only SwiftUI views | Need cross-platform |
| SPM dependencies | Replace with npm/yarn |

---

## PART 5 — Recommended Tech Stack

### Platform: Expo React Native (Recommended)

**Why not Flutter:**
- Dart learning curve (you have no Dart background)
- Worse Windows → iOS build story
- Smaller package ecosystem for travel apps

**Why Expo React Native:**
- Single codebase → iOS + Android + Web (optional)
- Build iOS from Windows using **EAS Build** (Expo's cloud CI)
- No Mac required for development or builds
- You likely already know JS/TS from ConfessReels
- Largest mobile package ecosystem
- Great Firebase support (`@react-native-firebase`)
- TypeScript first — safe and maintainable

### Backend: Firebase (Keep, but control costs)

Firebase is already set up. You have real data models designed for it.
Don't migrate — just add strict cost controls (detailed in Part 6).

**Estimated Firebase free-tier limits (Spark plan):**
- Firestore: 50K reads, 20K writes, 20K deletes/day
- Auth: unlimited
- Storage: 5GB total
- Hosting: 10GB/month
- Functions: 2M/month

This is sufficient until you reach ~500–1000 active users.

### Maps / Location: Mapbox Free Tier

| Option | Cost | Quality |
|--------|------|---------|
| Google Maps | $7–$28/1000 req | Best |
| **Mapbox** | Free: 50K loads/month | Excellent |
| OpenStreetMap (Nominatim) | Free, rate limited | Good |
| Apple Maps (iOS only) | Free | Good |

**Recommendation:** Use **Mapbox** for map display + **Nominatim** (OpenStreetMap) for geocoding/search.
- Mapbox free tier: 50,000 map views/month, 100,000 geocoding calls/month
- Nominatim: free but rate-limited (1 req/sec) — cache all results

### Place Discovery: Foursquare Places API (Free Tier)

| Option | Free Tier | Cost After |
|--------|-----------|-----------|
| Google Places | 200 USD credit (~11K searches) | $17/1000 |
| **Foursquare** | 1000 API calls/day | $0.005/call |
| OpenTripMap | 5000 calls/day | Free for non-commercial |
| Overpass (OSM) | Unlimited | Free |

**Recommendation:** Use **Foursquare Places API** for text search (1000 free/day = 30K/month).
Cache every result in Firestore. Never hit API for cached place.

---

## PART 6 — New Monorepo Structure

```
SoloTravelSoul/                     ← Root (existing git repo)
├── apps/
│   ├── mobile/                     ← Expo React Native app
│   │   ├── app/                    ← Expo Router screens
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx
│   │   │   │   └── signup.tsx
│   │   │   ├── (tabs)/
│   │   │   │   ├── index.tsx       ← Home
│   │   │   │   ├── trips.tsx
│   │   │   │   ├── discover.tsx
│   │   │   │   ├── groups.tsx
│   │   │   │   └── profile.tsx
│   │   │   ├── trip/[id].tsx
│   │   │   ├── itinerary/[id].tsx
│   │   │   ├── journal/[id].tsx
│   │   │   ├── group/[id].tsx
│   │   │   └── _layout.tsx
│   │   ├── components/
│   │   │   ├── ui/                 ← Themed buttons, cards, inputs
│   │   │   ├── trip/
│   │   │   ├── discover/
│   │   │   └── group/
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useTrips.ts
│   │   │   ├── useGroups.ts
│   │   │   └── useNotifications.ts
│   │   ├── stores/                 ← Zustand global state
│   │   ├── constants/
│   │   │   └── theme.ts            ← Colors, typography (from AppTheme)
│   │   ├── assets/
│   │   │   └── attractions.json    ← Reuse bundled data
│   │   ├── app.json
│   │   ├── eas.json
│   │   └── package.json
│   └── admin/                      ← Optional: Next.js web dashboard
│       └── (future)
├── packages/
│   ├── shared/                     ← Types, utilities shared across apps
│   │   ├── types/
│   │   │   ├── UserProfile.ts      ← Port from Swift models
│   │   │   ├── Trip.ts
│   │   │   ├── Group.ts
│   │   │   ├── Notification.ts
│   │   │   └── Place.ts
│   │   ├── utils/
│   │   │   ├── dateUtils.ts
│   │   │   └── validations.ts
│   │   └── package.json
│   └── firebase/                   ← Firebase config + service layer
│       ├── config.ts               ← Firebase init (uses env vars ONLY)
│       ├── auth.ts                 ← Auth helpers
│       ├── firestore.ts            ← Collection helpers + caching
│       ├── storage.ts              ← Upload helpers
│       ├── messaging.ts            ← FCM helpers
│       └── package.json
├── docs/
│   ├── REBUILD_PLAN.md             ← This file
│   ├── API_COST_CONTROLS.md
│   ├── FIRESTORE_RULES.md
│   └── ARCHITECTURE.md
├── .env.example                    ← Template (never commit .env)
├── .gitignore                      ← Must include .env, google-services.json
├── package.json                    ← Workspace root (npm workspaces)
└── turbo.json                      ← Turborepo build config
```

### Windows Setup Steps

```bash
# 1. Install prerequisites
# Node.js 20 LTS: https://nodejs.org
# Git: already have it
# VS Code: already have it

# 2. Install global tools
npm install -g eas-cli expo-cli

# 3. Login to Expo (create account at expo.dev)
eas login

# 4. Initialize the monorepo at existing location
cd C:\Users\ravit\Desktop\SoloTravelSoul
npm init -y
# Add workspaces config (see package.json below)

# 5. Create Expo app
npx create-expo-app apps/mobile --template tabs

# 6. Install Turborepo
npm install turbo --save-dev --workspace-root

# 7. Configure EAS for iOS builds from Windows
cd apps/mobile
eas build:configure

# 8. Run on Android (no Mac needed)
cd apps/mobile
npx expo start
# Press 'a' for Android emulator or scan QR for device

# 9. Build iOS (cloud build - no Mac needed)
eas build --platform ios --profile preview
```

---

## PART 7 — Budget-Safe Architecture

### Google APIs to Avoid or Replace

| API | Risk | Replacement |
|-----|------|-------------|
| Google Places Text Search | HIGH ($17/1K) | Foursquare + cache |
| Google Places Details | HIGH ($17/1K) | Foursquare + cache |
| Google Places Photos | MEDIUM ($7/1K) | Foursquare photos (included) |
| Google Maps SDK | MEDIUM | Mapbox free tier |
| Google Maps Geocoding | MEDIUM ($5/1K) | Nominatim (free) |
| Google Pay | HIGH (was your issue) | Do NOT add yet |

### API Cost Control Rules (Non-Negotiable)

**Rule 1 — Cache Everything**
```typescript
// Before calling Foursquare or any place API:
const cached = await firestore.collection('places_cache').doc(placeId).get();
if (cached.exists && isFresh(cached.data().cachedAt, 7)) { // 7-day cache
  return cached.data();
}
// Only call API if no cache
```

**Rule 2 — Debounce Search**
```typescript
// Never call API on every keystroke
const debouncedSearch = useMemo(
  () => debounce(searchPlaces, 600), // wait 600ms after typing stops
  []
);
```

**Rule 3 — Rate Limit Per User**
```typescript
// Firestore security rule: limit API-triggering actions
// Or use a simple Firestore counter per user per day
const todaySearches = await getUserSearchCount(userId);
if (todaySearches > 50) throw new Error('Daily search limit reached');
```

**Rule 4 — API Keys in Environment Variables Only**
```bash
# .env.local (NEVER commit this file)
EXPO_PUBLIC_FOURSQUARE_API_KEY=your_key_here
EXPO_PUBLIC_MAPBOX_TOKEN=your_token_here

# In code:
const key = process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY;
```

**Rule 5 — Restrict API Keys in Console**
- Foursquare: restrict to your app's bundle ID
- Mapbox: restrict to iOS bundle ID + Android package name
- Firebase: set up App Check (already in dependencies)
- Google (if any remaining): restrict by bundle ID + IP

### Firebase Cost Control Setup

```javascript
// 1. Set Firestore security rules (never allow public read/write)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    match /groups/{groupId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        (request.auth.uid == resource.data.creatorId ||
         request.auth.uid in resource.data.admins);
    }
    // Never allow: allow read, write: if true; (public access)
  }
}
```

```
// 2. Firebase Console → Budget alerts
- Set $5/month alert → email notification
- Set $10/month alert → email notification  
- Set $20/month budget HARD CAP (disables billing)
- Go to: console.firebase.google.com → Project Settings → Billing
```

```
// 3. Firestore indexes — create only what you need
// Each extra index = more storage = more cost
// Only index fields you actually query on
```

### What to Cache Locally vs. What to Fetch

| Data | Cache Where | TTL |
|------|-------------|-----|
| Place details | Firestore `places_cache` | 7 days |
| Place search results | React Query / Zustand | Session only |
| User profile | Zustand + AsyncStorage | Until sign out |
| Trips + itinerary | Zustand + AsyncStorage | Until sync |
| Journal entries | Firestore (real-time) | Always fresh |
| Group messages | Firestore (real-time listener) | Always fresh |
| Attractions (bundled) | Local JSON (already exists) | Never expires |
| Push notification token | AsyncStorage | Per install |

**Never hit API repeatedly for:**
- A place the user already viewed (cache in Firestore)
- User's own profile (cache in state)
- Static content like app configuration
- Already-planned trip destinations

---

## PART 8 — Migration Strategy

### Option A — Reuse Old Swift Code
**Pros:** Faster if targeting iOS only
**Cons:** Still iOS-only, still has billing risk, Windows dev is painful, hardcoded keys
**Verdict: Not recommended**

### Option B — Rebuild with Logic/Design Reuse (RECOMMENDED)
Port the data models, business logic, and design intent to React Native.
Reuse: Firestore schema, feature list, UI design patterns, AppTheme colors.
Replace: Everything Google-Maps-related, iOS-specific code, hardcoded keys.

**Pros:**
- Cross-platform from day one
- Clean security posture
- Budget-safe from the start
- You work from Windows without any limitations
- Fast (70% of design decisions already made)

**Cons:**
- Takes 4–6 weeks for MVP
- Some learning if new to React Native

**Verdict: This is the right choice.**

### Option C — Full Restart
**Pros:** Truly clean slate
**Cons:** You'd throw away 6+ months of design thinking, feature specs, Firestore schema — all of which are solid

**Verdict: Wasteful. Option B is better.**

---

## PART 9 — MVP vs Phase 2 Feature List

### MVP (Build First — 4-6 weeks)

These work completely offline or with minimal API calls:

1. **Auth** — Email/password sign in/up, profile creation
2. **My Trips** — Create, edit, view, delete planned trips
3. **Itinerary** — Day-by-day planning with manual place entry (no API yet)
4. **Journal** — Add text + photo entries per day
5. **User Profile** — Edit preferences, destinations, languages
6. **Notifications** — In-app notification center (Firestore-based)
7. **Biometric Login** — Face ID / fingerprint

**What to NOT build in MVP:**
- Google Places search (billing risk)
- Group chat (complex, Phase 2)
- Real-time listeners beyond notifications
- Push notifications (needs Apple dev account)

### Phase 2 (After first users — 2-3 months after MVP)

1. **Place Discovery** — Foursquare API with aggressive caching
2. **Map View** — Mapbox free tier map
3. **Group Trips** — Create, join, manage groups
4. **Group Chat** — Real-time messaging
5. **FCM Push Notifications** — Join requests, chat messages
6. **Companion Suggestions** — Match travelers going to same destinations
7. **Offline Mode** — Cache trips/itinerary locally with AsyncStorage

### Phase 3 (Monetization — when you have users)

1. **Premium subscription** — RevenueCat (handles iOS + Android billing)
2. **AI Itinerary suggestions** — Claude API or OpenAI (pay per call, not per user)
3. **Booking integration** — Deep links to Booking.com / Airbnb (affiliate, no API cost)
4. **Community features** — Public trip sharing, inspiration feed

---

## PART 10 — Step-by-Step Implementation Plan

### Week 1 — Foundation
- [ ] Initialize monorepo with npm workspaces + Turborepo
- [ ] Create Expo app with Expo Router (file-based routing)
- [ ] Set up TypeScript strict mode
- [ ] Port AppTheme colors/typography to `constants/theme.ts`
- [ ] Configure Firebase (env vars, NOT hardcoded)
- [ ] Set up Firestore security rules
- [ ] Set up budget alerts in Firebase Console
- [ ] Create `.gitignore` that excludes all secrets

### Week 2 — Auth + Profile
- [ ] Implement Firebase Auth (email/password)
- [ ] Sign up form (port from SignupForm.swift)
- [ ] Login form (port from LoginForm.swift)
- [ ] Biometric auth (react-native-biometrics)
- [ ] User profile creation on signup
- [ ] Profile view + edit screen
- [ ] `useAuth` hook

### Week 3 — Trip Planning
- [ ] Port PlannedTrip type from Swift model
- [ ] Trips list screen
- [ ] Create/edit trip form
- [ ] Trip detail screen
- [ ] Firestore sync for trips
- [ ] `useTrips` hook with local caching

### Week 4 — Itinerary + Journal
- [ ] Port ItineraryDay + JournalEntry types
- [ ] Itinerary screen (day-by-day view)
- [ ] Add/edit places manually (no API yet)
- [ ] Journal entry add/edit/delete
- [ ] Photo upload to Firebase Storage

### Week 5 — Polish + Submit
- [ ] Notifications screen (Firestore-based)
- [ ] Onboarding screens
- [ ] App icons + splash screen
- [ ] EAS Build for iOS (TestFlight)
- [ ] Google Play internal testing
- [ ] Bug fixes from testing

### Week 6 — Phase 1 Launch
- [ ] Apple App Store submission
- [ ] Google Play production release
- [ ] Set up Foursquare API (for Phase 2)
- [ ] Configure Mapbox (for Phase 2)

---

## PART 11 — Immediate Security Actions (Do These NOW)

Before writing any new code:

1. **Rotate the exposed Google Places API key**
   - Go to console.cloud.google.com → APIs & Services → Credentials
   - Delete the exposed key: `AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU`
   - Create a new key with iOS bundle ID restriction
   - This stops any ongoing unauthorized usage

2. **Check your Google Cloud billing**
   - Go to console.cloud.google.com → Billing
   - Check if there are unexpected charges from the exposed key

3. **Revoke and regenerate Firebase API key if needed**
   - The Firebase API key in GoogleService-Info.plist is less critical but rotate it if the project was ever public

4. **Add `.env` and `GoogleService-Info.plist` to `.gitignore`**
   - These should never be committed to a public repo

---

## PART 12 — Exact Next Prompt to Give Claude

Copy and paste this to start building:

```
We are starting the Expo React Native monorepo rebuild of SoloTravelSoul.

Context:
- Windows machine, no Mac available
- Existing iOS Swift project analyzed and understood
- Monorepo plan agreed: apps/mobile (Expo) + packages/shared + packages/firebase
- Backend: Firebase (existing project: solotravelsoul-57a9e)
- Maps: Mapbox free tier (NOT Google Maps)
- Places search: Foursquare API (NOT Google Places)
- All API keys go in .env files, never hardcoded
- Budget alerts already set in Firebase Console

Please do the following:
1. Initialize the monorepo at C:\Users\ravit\Desktop\SoloTravelSoul
   - Root package.json with npm workspaces
   - turbo.json for Turborepo
   - Proper .gitignore (include .env, google-services.json, GoogleService-Info.plist)
   - .env.example template file

2. Create the Expo app at apps/mobile
   - Use expo-router (file-based routing)
   - TypeScript strict
   - Expo SDK 51+

3. Create packages/shared
   - Port these types from Swift to TypeScript:
     UserProfile, PlannedTrip, ItineraryDay, JournalEntry, Place, GroupTrip, GroupMessage, NotificationItem
   
4. Create packages/firebase
   - Firebase config reading from env vars
   - Auth helpers (signIn, signUp, signOut, resetPassword)
   - Firestore helpers with the same collection structure as the original app

5. Set up the theme
   - Port AppTheme colors to constants/theme.ts
   - Create 5 base UI components: ThemedButton, ThemedCard, ThemedInput, ThemedText, ThemedScreen

Do not add Google Maps, Google Places, or any Google API that has per-request billing.
Show me all files created with full content.
```

---

## Summary

| Item | Detail |
|------|--------|
| **App purpose** | Solo + group travel planning with social features |
| **Existing platform** | iOS native (Swift + SwiftUI) |
| **Billing cause** | Google Places API uncached + hardcoded key exposed |
| **Recommended stack** | Expo React Native + Firebase + Mapbox + Foursquare |
| **Monorepo tool** | Turborepo + npm workspaces |
| **Build iOS from Windows** | EAS Build (Expo cloud CI) |
| **Estimated MVP time** | 4–6 weeks |
| **Estimated monthly cost (early)** | $0 (all free tiers) |
| **Estimated cost at 1K users** | $5–15/month |
| **Migration strategy** | Option B — rebuild with reused logic/design |
| **Security action needed** | Rotate Google Places API key NOW |

