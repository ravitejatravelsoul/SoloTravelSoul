# SoloTravelSoul — Execution Plan
> Monorepo rebuild: Expo React Native + Firebase | Windows | iOS + Android
> Generated: 2026-05-07 | Status: PLAN ONLY — no code yet

---

## COST-CONTROL CHECKLIST
> Do all of these BEFORE writing a single line of app code.

### Before Coding Starts
- [ ] **Rotate the Google Places API key** (it was hardcoded and may still be active)
  - Go to console.cloud.google.com → APIs & Services → Credentials
  - Delete key: `AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU`
  - Check billing history for unauthorized charges
- [ ] **Set Firebase budget alert at $5** (email notification)
- [ ] **Set Firebase budget alert at $15** (email notification)
- [ ] **Set Firebase budget hard cap at $25** (disables billing above this)
  - Firebase Console → Spark plan does not charge, but if you upgrade: set cap
- [ ] **Enable Firebase App Check** in Firebase Console (blocks unauthorized API calls)
- [ ] **Add to .gitignore before first commit:**
  - `.env`
  - `.env.local`
  - `google-services.json`
  - `GoogleService-Info.plist`
  - `*.keystore`
  - `*.jks`

### Rules During Development (Non-Negotiable)
- [ ] **Zero Google Maps** in any file — use Mapbox or nothing
- [ ] **Zero Google Places** in MVP — use static data or manual entry
- [ ] **All API keys from `process.env`** — never a string literal in code
- [ ] **Cache before calling** — check Firestore/AsyncStorage before any external API
- [ ] **Debounce all search inputs** — minimum 600ms delay
- [ ] **Firestore deny-by-default rules** — never `allow read, write: if true`

### Before Production Release
- [ ] Restrict Mapbox token to your app bundle IDs
- [ ] Restrict Foursquare key to your server IP (Phase 2)
- [ ] Run `expo doctor` and fix all warnings
- [ ] Review Firestore usage in Firebase Console → no runaway reads
- [ ] Test on real Android device AND iOS TestFlight before submitting to stores

---

## 1. FINAL MVP FEATURE LIST
> Zero paid API calls. All data is Firebase or local. Works offline for reads.

| # | Feature | Description | API Cost |
|---|---------|-------------|----------|
| 1 | **Onboarding** | 3-screen intro, then redirect to signup | Free |
| 2 | **Email/Password Auth** | Sign up, sign in, forgot password | Free (Firebase Auth) |
| 3 | **Biometric Login** | Face ID on iOS, fingerprint on Android | Free (device) |
| 4 | **User Profile** | View and edit name, bio, country, city, preferences, languages, favorite destinations | Free (Firestore) |
| 5 | **Profile Photo** | Upload profile picture | Free (Firebase Storage, 5GB) |
| 6 | **My Trips** | List all planned trips, past/upcoming filter | Free (Firestore) |
| 7 | **Create Trip** | Destination name, dates, notes, cover photo | Free (Firestore) |
| 8 | **Edit Trip** | Update any trip field | Free (Firestore) |
| 9 | **Delete Trip** | Soft-confirm then delete | Free (Firestore) |
| 10 | **Day-by-Day Itinerary** | View/edit days auto-generated from trip dates | Free (Firestore) |
| 11 | **Add Place Manually** | Type place name + category — no API search | Free |
| 12 | **Journal per Day** | Add text + optional photo per itinerary day | Free (Firestore + Storage) |
| 13 | **Edit/Delete Journal Entry** | Full CRUD on journal | Free |
| 14 | **In-app Notifications** | View notification history (Firestore reads) | Free |
| 15 | **Bundled Attractions** | Browse curated attractions from local JSON | Free (no API) |

**Total MVP API cost: $0/month** at any user count below Firebase free limits.

### Explicit MVP Exclusions
| Excluded | Reason | Phase |
|---------|--------|-------|
| Foursquare place search | Per-request paid | Phase 2 |
| Mapbox map view | Not needed for trip planning | Phase 2 |
| Group trips | Complex, not solo-first | Phase 2 |
| Group chat | Depends on groups | Phase 2 |
| FCM push notifications | Needs Apple paid account + complex setup | Phase 2 |
| Companion matching | Depends on user base | Phase 2 |
| Social feed | Depends on user base | Phase 3 |

---

## 2. PHASE 2 FEATURE LIST
> Add only after MVP is live and tested. Each feature gated behind a Firestore flag.

| # | Feature | API Used | Monthly Cost Estimate |
|---|---------|---------|----------------------|
| 1 | **Place Search** | Foursquare (1000 free/day) | $0 with cache, <$5 at scale |
| 2 | **Place Detail View** | Foursquare (cached) | $0 with 7-day cache |
| 3 | **Map View for Itinerary** | Mapbox (50K views/month free) | $0–5 |
| 4 | **Group Trip Creation** | Firestore only | Free |
| 5 | **Group Membership (join/approve)** | Firestore only | Free |
| 6 | **Group Chat** | Firestore real-time | Free under limits |
| 7 | **FCM Push Notifications** | FCM (free) | Free |
| 8 | **Companion Suggestions** | Firestore query | Free |
| 9 | **Offline Mode** | AsyncStorage | Free |

---

## 3. FINAL FOLDER STRUCTURE

```
SoloTravelSoul/                          ← Existing git repo root (keep as-is)
│
├── apps/
│   └── mobile/                          ← Expo React Native (iOS + Android)
│       ├── app/                         ← Expo Router (file-based routing)
│       │   ├── _layout.tsx              ← Root: auth gate + font loading
│       │   ├── index.tsx                ← Redirect: /home if auth, /login if not
│       │   ├── (auth)/
│       │   │   ├── _layout.tsx          ← Auth stack layout
│       │   │   ├── onboarding.tsx       ← 3-step intro (first launch only)
│       │   │   ├── login.tsx
│       │   │   └── signup.tsx
│       │   └── (app)/
│       │       ├── _layout.tsx          ← Tab bar layout (5 tabs)
│       │       ├── home/
│       │       │   └── index.tsx        ← Home: greeting, next trip, quick actions
│       │       ├── trips/
│       │       │   ├── index.tsx        ← Trip list (upcoming + past)
│       │       │   ├── create.tsx       ← Create trip form
│       │       │   └── [id]/
│       │       │       ├── index.tsx    ← Trip detail card
│       │       │       ├── edit.tsx     ← Edit trip form
│       │       │       ├── itinerary/
│       │       │       │   ├── index.tsx      ← Day list
│       │       │       │   └── [dayId].tsx    ← Day detail: places + journal
│       │       │       └── journal/
│       │       │           └── index.tsx      ← Full journal view
│       │       ├── discover/
│       │       │   └── index.tsx        ← MVP: bundled attractions only
│       │       ├── groups/
│       │       │   └── index.tsx        ← MVP: "Coming soon" placeholder
│       │       └── profile/
│       │           ├── index.tsx        ← Profile view
│       │           └── edit.tsx         ← Edit profile form
│       │
│       ├── components/
│       │   ├── ui/                      ← Base design system (build first)
│       │   │   ├── Button.tsx           ← ThemedButton equivalent
│       │   │   ├── Card.tsx             ← ThemedCard equivalent
│       │   │   ├── Input.tsx            ← ThemedTextField equivalent
│       │   │   ├── Screen.tsx           ← Safe-area scroll wrapper
│       │   │   ├── Text.tsx             ← Typography variants
│       │   │   ├── Badge.tsx            ← Notification badge
│       │   │   └── Chip.tsx             ← Tag/preference chip
│       │   ├── auth/
│       │   │   ├── LoginForm.tsx
│       │   │   └── SignupForm.tsx
│       │   ├── trip/
│       │   │   ├── TripCard.tsx         ← Trip summary card
│       │   │   ├── TripForm.tsx         ← Shared create/edit form
│       │   │   └── TripCoverPicker.tsx  ← Image picker for trip cover
│       │   ├── itinerary/
│       │   │   ├── DayCard.tsx
│       │   │   ├── PlaceItem.tsx        ← Manual place row
│       │   │   └── AddPlaceSheet.tsx    ← Bottom sheet to add place manually
│       │   ├── journal/
│       │   │   ├── JournalEntryCard.tsx
│       │   │   └── JournalEntryForm.tsx
│       │   └── profile/
│       │       ├── ProfileHeader.tsx
│       │       ├── TagEditor.tsx        ← Preferences/destinations/languages chips
│       │       └── AvatarPicker.tsx
│       │
│       ├── hooks/
│       │   ├── useAuth.ts               ← Auth state + actions
│       │   ├── useTrips.ts              ← CRUD + real-time trip sync
│       │   ├── useItinerary.ts          ← Day/place management
│       │   ├── useJournal.ts            ← Journal CRUD
│       │   ├── useProfile.ts            ← Profile read/update
│       │   ├── useNotifications.ts      ← Notification list
│       │   └── useBiometric.ts          ← Face ID / fingerprint
│       │
│       ├── stores/                      ← Zustand (global client state)
│       │   ├── authStore.ts             ← user, loading, error
│       │   ├── tripStore.ts             ← trips[], activeTrip
│       │   └── uiStore.ts               ← toasts, modals, theme
│       │
│       ├── constants/
│       │   └── theme.ts                 ← Colors, spacing, fonts (from AppTheme.swift)
│       │
│       ├── utils/
│       │   ├── dateUtils.ts             ← Format dates, generate day range
│       │   ├── validations.ts           ← Form validators
│       │   └── imageUtils.ts            ← Resize before upload
│       │
│       ├── assets/
│       │   ├── attractions.json         ← Direct copy from old project
│       │   └── images/                  ← Splash, icon, travel photos
│       │
│       ├── app.json                     ← Expo config (bundle IDs, version)
│       ├── eas.json                     ← EAS Build profiles
│       ├── tsconfig.json
│       ├── babel.config.js
│       └── package.json
│
├── packages/
│   ├── shared/                          ← Types + utils used across apps
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── UserProfile.ts       ← Port from UserProfile.swift
│   │   │   │   ├── Trip.ts             ← Port from TripCoreModels.swift
│   │   │   │   ├── Place.ts            ← Port from Models.Place.swift
│   │   │   │   ├── Group.ts            ← Port from GroupTrip.swift (Phase 2)
│   │   │   │   └── Notification.ts     ← Port from NotificationItem.swift
│   │   │   └── utils/
│   │   │       └── dateUtils.ts
│   │   ├── index.ts                     ← Re-exports all types
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── firebase/                        ← Firebase service layer
│       ├── src/
│       │   ├── config.ts               ← Firebase init (env vars ONLY)
│       │   ├── auth.ts                 ← signIn, signUp, signOut, resetPassword
│       │   ├── firestore.ts            ← Collection helpers + read cache
│       │   ├── storage.ts              ← Profile photo + journal photo upload
│       │   └── messaging.ts            ← FCM setup (Phase 2 only)
│       ├── index.ts
│       ├── tsconfig.json
│       └── package.json
│
├── docs/
│   ├── REBUILD_PLAN.md                  ← Architecture decisions
│   ├── EXECUTION_PLAN.md               ← This file
│   ├── FIRESTORE_RULES.md              ← Security rules reference
│   └── COST_CONTROLS.md               ← Billing decisions log
│
├── .env.example                         ← Template file (safe to commit)
├── .gitignore                           ← Must block .env, secrets, keystore
├── package.json                         ← Workspace root (npm workspaces)
└── turbo.json                           ← Turborepo pipeline config
```

---

## 4. FIREBASE COLLECTIONS SCHEMA

### MVP Collections

```
users/
  {uid}/
    name:                 string
    email:                string
    phone:                string        (empty string if not provided)
    birthday:             string        (ISO date string "YYYY-MM-DD")
    gender:               string
    country:              string
    city:                 string
    bio:                  string
    photoURL:             string | null
    preferences:          string[]      (e.g. ["adventure", "food", "culture"])
    favoriteDestinations: string[]      (e.g. ["Japan", "Italy"])
    languages:            string[]      (e.g. ["English", "Spanish"])
    privacyEnabled:       boolean
    fcmToken:             string | null (Phase 2)
    createdAt:            Timestamp
    updatedAt:            Timestamp

users/{uid}/trips/
  {tripId}/
    destination:          string        (city/country name, typed by user)
    startDate:            Timestamp
    endDate:              Timestamp
    notes:                string
    coverPhotoURL:        string | null
    isArchived:           boolean       (soft delete flag)
    createdAt:            Timestamp
    updatedAt:            Timestamp

users/{uid}/trips/{tripId}/itinerary/
  {dayId}/                              (one document per day)
    date:                 Timestamp
    places:               PlaceEntry[]  (embedded array — no subcollection)
    journalEntries:       JournalEntry[] (embedded array — no subcollection)

    PlaceEntry {
      id:       string   (uuid)
      name:     string
      category: string   ("food" | "attraction" | "accommodation" | "transport" | "other")
      notes:    string
    }

    JournalEntry {
      id:        string   (uuid)
      text:      string
      photoURL:  string | null
      createdAt: Timestamp
    }

notifications/
  {notificationId}/
    userId:    string    (target user's UID)
    type:      string    ("join_request" | "join_approved" | "join_denied" | "group_chat")
    groupId:   string | null
    title:     string
    message:   string
    isRead:    boolean
    createdAt: Timestamp
```

### Phase 2 Collections (Do NOT create until Phase 2)

```
groups/
  {groupId}/
    name:            string
    destination:     string
    startDate:       Timestamp
    endDate:         Timestamp
    description:     string
    activities:      string[]
    languages:       string[]
    creatorId:       string     (UID)
    members:         string[]   (UIDs)
    admins:          string[]   (UIDs)
    joinRequests:    string[]   (UIDs)
    isPublic:        boolean
    createdAt:       Timestamp

groupChats/{groupId}/messages/
  {messageId}/
    senderId:    string
    senderName:  string
    text:        string
    timestamp:   Timestamp
    isReadBy:    string[]   (UIDs of readers)

places_cache/
  {fsq_id}/                           (Foursquare place ID as document ID)
    name:        string
    address:     string
    city:        string
    country:     string
    latitude:    number
    longitude:   number
    category:    string
    rating:      number | null
    photoUrl:    string | null
    cachedAt:    Timestamp            (used to check staleness)
    source:      "foursquare"
```

### Firestore Design Decisions
- **Itinerary days are subcollection** — not embedded in trip — because trips can be 30+ days
- **Places and journal entries are embedded arrays inside each day** — they are small and always loaded together
- **Photos stored in Firebase Storage** — only URL string in Firestore
- **Soft delete on trips** (`isArchived: true`) — never lose user data
- **No denormalization in MVP** — keep it simple, optimize in Phase 2 if needed

---

## 5. FIRESTORE SECURITY RULES PLAN
> These are the rules design. Actual `.rules` file will be created in Step 1.

### Rule Principles
1. **Deny everything by default** — `match /{document=**} { allow read, write: if false; }`
2. **Require authentication for all reads** — `request.auth != null`
3. **Users own their own data** — `request.auth.uid == userId`
4. **Validate writes** — check required fields exist on create
5. **No user can write another user's data**

### Rules by Collection

| Collection | Read | Write | Notes |
|-----------|------|-------|-------|
| `users/{uid}` | Owner only | Owner only | UID must match |
| `users/{uid}/trips/{tripId}` | Owner only | Owner only | — |
| `users/{uid}/trips/{tripId}/itinerary/{dayId}` | Owner only | Owner only | — |
| `notifications/{id}` | Owner only (check userId field) | System only (Cloud Function) | User can update `isRead` only |
| `groups/{id}` (Phase 2) | Authenticated users | Creator/admins only | Members array check |
| `groupChats/{id}/messages` (Phase 2) | Group members | Group members | Members array check |
| `places_cache/{id}` (Phase 2) | Authenticated users | Backend/admin only | Cache is read-only for clients |

### What is NEVER Allowed
- `allow read, write: if true` — public access
- Client writing to `notifications` (only mark `isRead`)
- Client writing to `places_cache` directly
- User reading/writing another user's trips

---

## 6. WINDOWS SETUP COMMANDS
> Run in this exact order. PowerShell or Windows Terminal.

### Step A — Install Prerequisites (one-time)

```powershell
# 1. Node.js 20 LTS (if not installed)
# Download from: https://nodejs.org/en/download
# Verify:
node --version   # should be v20.x.x
npm --version    # should be 10.x.x

# 2. Git (already installed — verify)
git --version

# 3. Java 17 (required for Android builds)
# Download from: https://adoptium.net/temurin/releases/?version=17
# After install, set JAVA_HOME:
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-17.x.x.x-hotspot", "User")

# 4. Android Studio (for Android emulator)
# Download from: https://developer.android.com/studio
# During install: check "Android SDK", "Android SDK Platform", "Android Virtual Device"
# After install, create an AVD (emulator) via AVD Manager

# 5. Android environment variables
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[System.Environment]::SetEnvironmentVariable("Path", "$env:Path;$env:LOCALAPPDATA\Android\Sdk\platform-tools", "User")

# 6. EAS CLI (Expo Application Services — for cloud iOS builds)
npm install -g eas-cli

# 7. Expo CLI
npm install -g expo-cli

# 8. Create Expo account at https://expo.dev (free)
eas login
# Enter your expo.dev credentials
```

### Step B — Initialize Monorepo (do once)

```powershell
# Navigate to project
cd C:\Users\ravit\Desktop\SoloTravelSoul

# Verify you are on the right branch
git status
git branch

# Install Turborepo at workspace root
npm init -y
npm install turbo --save-dev

# Create workspace structure
New-Item -ItemType Directory -Force -Path apps\mobile
New-Item -ItemType Directory -Force -Path packages\shared\src\types
New-Item -ItemType Directory -Force -Path packages\shared\src\utils
New-Item -ItemType Directory -Force -Path packages\firebase\src
New-Item -ItemType Directory -Force -Path docs
```

### Step C — Create Expo App

```powershell
# From monorepo root
cd C:\Users\ravit\Desktop\SoloTravelSoul

# Create Expo app inside apps/mobile
npx create-expo-app@latest apps/mobile --template blank-typescript

# Verify it works
cd apps/mobile
npx expo start
# Press 'a' for Android emulator
# Press 'i' for iOS simulator (requires Mac — skip on Windows)

# Go back to root
cd C:\Users\ravit\Desktop\SoloTravelSoul
```

### Step D — Configure EAS for iOS Builds from Windows

```powershell
cd apps\mobile

# Initialize EAS
eas build:configure
# This creates eas.json

# To build iOS without a Mac (cloud build):
eas build --platform ios --profile preview
# This uploads your code to Expo's servers and builds remotely
# Result: .ipa file or TestFlight link

# To build Android locally:
eas build --platform android --profile preview
# Or run on Android emulator directly:
npx expo run:android
```

### Step E — Set Up Firebase

```powershell
# Install Firebase packages in the firebase package
cd C:\Users\ravit\Desktop\SoloTravelSoul\packages\firebase
npm init -y
npm install firebase @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore @react-native-firebase/storage

# Create .env.local at monorepo root (NEVER commit this)
# Add your Firebase config values from Firebase Console
```

---

## 7. EXACT FIRST CODING STEP

The very first thing to create is the **monorepo foundation** — before any screen, any component, any hook.

**Order is critical. Each step depends on the previous.**

```
Step 1: Root config files
  → package.json (workspaces)
  → turbo.json
  → .gitignore
  → .env.example

Step 2: packages/shared
  → package.json
  → tsconfig.json
  → types: UserProfile.ts, Trip.ts, Place.ts, Notification.ts
  → index.ts (re-exports)

Step 3: packages/firebase
  → package.json
  → tsconfig.json
  → config.ts (reads from process.env)
  → auth.ts (signIn, signUp, signOut, resetPassword, getCurrentUser)
  → firestore.ts (users, trips, itinerary, notifications helpers)
  → storage.ts (uploadProfilePhoto, uploadJournalPhoto)
  → index.ts (re-exports)

Step 4: apps/mobile foundation
  → app.json (bundle IDs: com.solotravelsoul.app)
  → eas.json (development, preview, production profiles)
  → tsconfig.json
  → babel.config.js
  → package.json (with workspace references to packages/)

Step 5: Theme
  → apps/mobile/constants/theme.ts (ported from AppTheme.swift — exact colors)

Step 6: Base UI components
  → Button.tsx, Card.tsx, Input.tsx, Screen.tsx, Text.tsx, Chip.tsx

Step 7: Auth store + hook
  → stores/authStore.ts (Zustand)
  → hooks/useAuth.ts

Step 8: Routing + auth gate
  → app/_layout.tsx (root layout with auth check)
  → app/index.tsx (redirect logic)
  → app/(auth)/_layout.tsx
  → app/(auth)/login.tsx
  → app/(auth)/signup.tsx
  → app/(app)/_layout.tsx (tab bar)

Step 9: Home screen + Profile
  → app/(app)/home/index.tsx
  → app/(app)/profile/index.tsx
  → app/(app)/profile/edit.tsx

Step 10: Trips
  → hooks/useTrips.ts
  → stores/tripStore.ts
  → app/(app)/trips/index.tsx
  → app/(app)/trips/create.tsx
  → app/(app)/trips/[id]/index.tsx
  → app/(app)/trips/[id]/edit.tsx

Step 11: Itinerary + Journal
  → hooks/useItinerary.ts
  → hooks/useJournal.ts
  → app/(app)/trips/[id]/itinerary/index.tsx
  → app/(app)/trips/[id]/itinerary/[dayId].tsx

Step 12: Discover (bundled only)
  → app/(app)/discover/index.tsx (reads from assets/attractions.json)

Step 13: Firestore security rules file
  → firestore.rules (deploy to Firebase)
```

---

## 8. FILES TO CREATE FIRST (Ordered List)

```
Priority 1 — Root (before any app code)
  1.  /package.json                              ← npm workspaces root
  2.  /turbo.json                                ← Turborepo pipeline
  3.  /.gitignore                                ← Blocks secrets
  4.  /.env.example                              ← Safe template

Priority 2 — Shared types (before firebase package)
  5.  /packages/shared/package.json
  6.  /packages/shared/tsconfig.json
  7.  /packages/shared/src/types/UserProfile.ts
  8.  /packages/shared/src/types/Trip.ts
  9.  /packages/shared/src/types/Place.ts
  10. /packages/shared/src/types/Notification.ts
  11. /packages/shared/index.ts

Priority 3 — Firebase package (before mobile app)
  12. /packages/firebase/package.json
  13. /packages/firebase/tsconfig.json
  14. /packages/firebase/src/config.ts           ← Reads from .env ONLY
  15. /packages/firebase/src/auth.ts
  16. /packages/firebase/src/firestore.ts
  17. /packages/firebase/src/storage.ts
  18. /packages/firebase/index.ts

Priority 4 — Mobile app config
  19. /apps/mobile/app.json                      ← Bundle IDs here
  20. /apps/mobile/eas.json
  21. /apps/mobile/package.json
  22. /apps/mobile/tsconfig.json
  23. /apps/mobile/babel.config.js

Priority 5 — Theme and UI foundation
  24. /apps/mobile/constants/theme.ts
  25. /apps/mobile/components/ui/Text.tsx
  26. /apps/mobile/components/ui/Button.tsx
  27. /apps/mobile/components/ui/Card.tsx
  28. /apps/mobile/components/ui/Input.tsx
  29. /apps/mobile/components/ui/Screen.tsx
  30. /apps/mobile/components/ui/Chip.tsx

Priority 6 — Auth layer
  31. /apps/mobile/stores/authStore.ts
  32. /apps/mobile/hooks/useAuth.ts
  33. /apps/mobile/app/_layout.tsx
  34. /apps/mobile/app/index.tsx
  35. /apps/mobile/app/(auth)/_layout.tsx
  36. /apps/mobile/app/(auth)/login.tsx
  37. /apps/mobile/app/(auth)/signup.tsx

Priority 7 — Main app shell
  38. /apps/mobile/app/(app)/_layout.tsx         ← Tab navigator
  39. /apps/mobile/app/(app)/home/index.tsx
  40. /apps/mobile/app/(app)/profile/index.tsx

Priority 8 — Trips
  41. /apps/mobile/stores/tripStore.ts
  42. /apps/mobile/hooks/useTrips.ts
  43. /apps/mobile/app/(app)/trips/index.tsx
  44. /apps/mobile/app/(app)/trips/create.tsx
  45. /apps/mobile/app/(app)/trips/[id]/index.tsx
  46. /apps/mobile/app/(app)/trips/[id]/edit.tsx

Priority 9 — Itinerary + Journal
  47. /apps/mobile/hooks/useItinerary.ts
  48. /apps/mobile/hooks/useJournal.ts
  49. /apps/mobile/app/(app)/trips/[id]/itinerary/index.tsx
  50. /apps/mobile/app/(app)/trips/[id]/itinerary/[dayId].tsx

Priority 10 — Security
  51. /firestore.rules                           ← Deploy to Firebase Console
```

---

## 9. OLD iOS FILES TO REFERENCE (Not Copy)

Use these as design reference and logic blueprint only. Read them, then port manually.

| Old iOS File | What to Extract | New File |
|-------------|----------------|----------|
| `AppTheme/AppTheme.swift` | **Exact colors:** primary `rgb(0.07, 0.44, 0.76)` → `#1270C2`, accent `rgb(0.20, 0.60, 0.86)` → `#3399DB`. Corner radius: 12. Shadow: 4. | `constants/theme.ts` |
| `Models/UserProfile.swift` | All 17 fields with types. The `initials` computed property logic. | `packages/shared/types/UserProfile.ts` |
| `Models/TripCoreModels.swift` | `PlannedTrip`, `ItineraryDay`, `JournalEntry` shapes and Firestore serialization pattern (toDict/fromDict) | `packages/shared/types/Trip.ts` |
| `Models/NotificationItem.swift` | Notification type enum, fields | `packages/shared/types/Notification.ts` |
| `Models/Models.Place.swift` | Place fields: id, name, address, lat, lng, types, rating, etc. | `packages/shared/types/Place.ts` |
| `Models/GroupTrip.swift` | Group fields — for Phase 2 reference | `packages/shared/types/Group.ts` |
| `Models/GroupMessage.swift` | Message fields — for Phase 2 reference | `packages/shared/types/Group.ts` |
| `ViewModels/AuthViewModel.swift` | Auth flow logic: sign in, sign up, profile creation on signup, password reset, user listener | `hooks/useAuth.ts` |
| `ViewModels/GroupViewModel.swift` | Group CRUD patterns (Phase 2) | `hooks/useGroups.ts` |
| `Services/FirestoreService.swift` | Firestore collection path conventions, listener cleanup pattern | `packages/firebase/firestore.ts` |
| `Views/Shared/ThemedComponents.swift` | Component API design (props shape for Button, Card, TextField) | `components/ui/*.tsx` |
| `Views/Home/ContentView.swift` | Auth gate routing logic: logged in → tabs, not logged in → auth stack | `app/_layout.tsx` |
| `Data/Attractions.json` | **Copy this file directly** — no changes needed | `assets/attractions.json` |
| `Views/Profile/SignupForm.swift` | All signup fields, validation patterns | `app/(auth)/signup.tsx` |
| `Views/Trips/CreateTripView.swift` | Trip form fields and validation | `app/(app)/trips/create.tsx` |

---

## 10. WHAT NOT TO REUSE FROM OLD PROJECT

| Old File/Code | Why Not Reuse | What to Do Instead |
|--------------|--------------|-------------------|
| `AppDelegate.swift` | iOS-specific app lifecycle | Expo handles this automatically |
| `SoloTravelSoul/SoloTravelSoulApp.swift` | iOS @main entry point | `app/_layout.tsx` (Expo Router) |
| `Services/GooglePlacesService.swift` | Google Places API — billing risk | Foursquare in Phase 2, manual in MVP |
| `Services/PlacesService.swift` | Also Google Places | Same as above |
| `GooglePlacesAutocompleteView.swift` | Google autocomplete UI | Manual text input in MVP |
| `GooglePlacesViewModel.swift` | Google API ViewModel | Delete entirely |
| `PlaceSearchViewModel.swift` | Google Places search state | Delete entirely |
| `Config.swift` (line with API key) | Contains Google Places key | `.env` file only |
| Any `GMSPlacesClient` usage | Google Maps SDK import | Remove entirely |
| `SoloTravelSoul.xcodeproj/` | Xcode project files | Not applicable to React Native |
| `SoloTravelSoul.entitlements` | iOS capabilities file | Handled in `app.json` for Expo |
| `SoloTravelSoul/Info.plist` | iOS app config | `app.json` in Expo |
| `.xcworkspace` / `.xcuserdata` | Xcode workspace state | Delete from new project |
| `GoogleService-Info.plist` | Firebase iOS config | Use `google-services.json` for Android + env vars |
| `Models/Trip.swift` | Legacy/superseded by TripCoreModels | Reference TripCoreModels only |
| `Models/TripGroup.swift` | Redundant with GroupTrip | Reference GroupTrip.swift only |
| `Models/Message.swift` | Generic, superseded by GroupMessage | Reference GroupMessage.swift only |
| `Models/ItineraryPlace.swift` | Legacy itinerary model | Redesign as embedded PlaceEntry |
| `CompanionSuggestionViewModel.swift` | Incomplete (1.1KB stub) | Rebuild from scratch in Phase 2 |
| `Models/TestFieldMask.swift` | Test/debug file | Delete |
| Any hardcoded API key string | Security risk | `.env` only |

---

## SUMMARY: Phase Roadmap

```
NOW (Before coding)
  ├── Rotate Google Places API key
  ├── Set Firebase budget alerts
  ├── Update .gitignore
  └── Enable Firebase App Check

WEEK 1 — Foundation
  ├── Monorepo root config
  ├── packages/shared (types)
  ├── packages/firebase (service layer)
  └── apps/mobile (Expo app skeleton)

WEEK 2 — Auth + Profile
  ├── Login, Signup, Forgot Password
  ├── Biometric login
  └── Profile view + edit

WEEK 3 — Trip Planning
  ├── Trip list, create, edit, delete
  └── Trip detail view

WEEK 4 — Itinerary + Journal
  ├── Day-by-day itinerary
  ├── Manual place add
  └── Journal with photos

WEEK 5 — Polish + Testing
  ├── Bundled Discover screen
  ├── Notifications screen
  ├── Onboarding flow
  └── EAS build (iOS TestFlight + Android APK)

WEEK 6 — Store Submission
  ├── Apple App Store submission
  └── Google Play internal testing

MONTH 2+ — Phase 2
  ├── Foursquare place search (cached)
  ├── Mapbox map view
  ├── Group trips + chat
  └── FCM push notifications
```

---

*Next step: Confirm this plan, then give the prompt to start creating Week 1 files.*
