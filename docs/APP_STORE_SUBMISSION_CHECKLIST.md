# App Store Submission Checklist (iOS)

## Step 1 — EAS / Expo Config (do first)

- [ ] Run `eas init` inside `apps/mobile` to get a real EAS project ID, then paste it into `app.json` → `extra.eas.projectId`
- [ ] Confirm bundle ID: `com.solotravelsoul.app` (must match App Store Connect exactly)
- [ ] Confirm version: `1.0.0` in `app.json`
- [ ] Confirm `eas.json` `appVersionSource: "remote"` — EAS manages build numbers, no local `buildNumber` needed
- [ ] Fill `eas.json` → `submit.production.ios`:
  - `appleId`: your Apple ID email
  - `ascAppId`: App Store Connect app numeric ID (found in App Store Connect → App → App Information)
  - `appleTeamId`: your 10-character Apple team ID (found at developer.apple.com → Membership)

---

## Step 2 — App Store Connect Setup

- [ ] Create app in App Store Connect (Identifier: `com.solotravelsoul.app`)
- [ ] Set the following in App Store Connect:
  - **Name:** SoloTravelSoul
  - **Subtitle:** Plan trips. Journal memories.
  - **Primary category:** Travel
  - **Secondary category:** Lifestyle
  - **Support URL:** (your support page or email — e.g., `mailto:support@solotravelsoul.app`)
  - **Privacy Policy URL:** (host the privacy policy text publicly, e.g., `https://solotravelsoul.app/privacy`)
  - **Marketing URL:** (optional)
  - **Age rating:** 4+ (no objectionable content)

---

## Step 3 — App Description (copy/paste into App Store Connect)

**Short description (30 chars max for subtitle):**
```
Plan trips. Journal memories.
```

**Full description (4000 chars max):**
```
SoloTravelSoul is your personal travel companion — built for the independent explorer.

PLAN YOUR ADVENTURE
Build day-by-day itineraries with ease. Organize every destination, activity, and detail 
from first inspiration to final landing.

JOURNAL EVERY MEMORY
Capture moments with words and photos. Record your mood, experiences, and discoveries. 
Your travel story, beautifully preserved.

DISCOVER NEW PLACES
Browse curated US destinations by category — beach, hiking, city, food, adventure, and 
more. Save your favorites and add them directly to your trip plan.

SMART PACKING
Get context-aware packing suggestions based on your destination and trip type. Check 
off items as you pack.

SHARE YOUR JOURNEY
Export and share your trip summary with friends and family via any app on your phone.

PLAN WITH FRIENDS
Create group chats around your trips. Invite travel companions and coordinate together.

WORKS OFFLINE
Your trips and itineraries are available even without an internet connection.

Privacy-first: your journal entries, photos, and trip data are stored securely under 
your account only. We never sell your data or use it for advertising.
```

---

## Step 4 — Keywords (100 chars max, comma-separated)

```
travel,solo travel,trip planner,itinerary,travel journal,packing list,vacation,adventure
```

---

## Step 5 — Screenshots Required

Apple requires screenshots at these sizes (upload at least one set):

| Device | Size | Notes |
|---|---|---|
| iPhone 6.9" (16 Pro Max) | 1320×2868 or 1290×2796 | **Required** |
| iPhone 6.7" (Pro Max) | 1284×2778 or 1242×2688 | Optional (Apple auto-scales) |
| iPhone 5.5" (8 Plus) | 1242×2208 | Required for older devices |
| iPad 12.9" | 2048×2732 | Required if iPad support claimed |

**Screenshot suggestions (6 screens):**
1. Home screen with a trip hero card
2. Itinerary day view with places
3. Discover map with pins
4. Packing checklist with suggestions
5. Journal entry with mood
6. Profile screen

---

## Step 6 — App Review Information

- [ ] Demo account: create a test account (`beta-reviewer@solotravelsoul.app`) with sample trip data
- [ ] Notes to reviewer: *"Foursquare live search and Mapbox native map are disabled by default and require internal feature flags. The app's core features (trip planning, itinerary, journal, discover, chats) are all fully functional without any additional configuration."*
- [ ] Contact email: your developer email
- [ ] Phone: your developer phone (required)

---

## Step 7 — Privacy Nutrition Labels (App Privacy in App Store Connect)

Set the following data types as **collected and linked to user identity**:

| Data Type | Collected? | Purpose |
|---|---|---|
| Name | Yes | App functionality |
| Email address | Yes | Account management |
| Photos or videos | Yes | App functionality (journal photos) |
| Other user content (trips, journal text) | Yes | App functionality |
| Location (coarse, while in use) | Yes | App functionality (Near Me) |

Set as **collected but NOT linked to identity:**
- Crash data (via Firebase) — diagnostics

Set as **not collected:**
- Health/fitness, financial, browsing history, contacts, messages, identifiers (other than account), purchases

---

## Step 8 — Pre-submission Checklist

- [ ] `eas build --platform ios --profile production` completed successfully
- [ ] Build appears in App Store Connect → TestFlight
- [ ] TestFlight internal testing passed (at least 1 device)
- [ ] Privacy Policy publicly hosted and URL entered in App Store Connect
- [ ] Support URL entered
- [ ] Age rating confirmed (4+)
- [ ] No placeholder text visible in the app
- [ ] No debug UI (no dev menus, no internal-only banners)
- [ ] Delete account flow works (Profile → Delete account)
- [ ] Privacy and Terms screens accessible from Profile

---

## Step 9 — Submit

```bash
cd apps/mobile
eas submit --platform ios --latest
```

Or manually upload the `.ipa` from EAS dashboard to App Store Connect.

---

## Build Commands (this weekend)

```bash
# From apps/mobile directory:

# 1. Preview build (TestFlight / internal testing)
eas build --platform ios --profile preview

# 2. Production build (App Store)
eas build --platform ios --profile production

# 3. Submit to App Store (after production build)
eas submit --platform ios --latest
```

---

## Known App Store Review Risks

| Risk | Mitigation |
|---|---|
| Chat feature — user-generated content | Terms of Service (section 4) covers acceptable use. No profanity filter yet — note in reviewer notes that this is a friend/family social feature. |
| "Requires EAS build" for Mapbox | Not visible to users — Mapbox is disabled by default, reviewer sees Leaflet/OSM map. |
| Foursquare disabled | Not visible to reviewers — feature flag is false by default. |
