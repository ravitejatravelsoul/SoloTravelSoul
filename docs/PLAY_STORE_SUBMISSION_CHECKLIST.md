# Play Store Submission Checklist (Android)

## Step 1 — EAS / Expo Config (do first)

- [ ] Run `eas init` inside `apps/mobile` to get a real EAS project ID, then paste it into `app.json` → `extra.eas.projectId`
- [ ] Confirm package name: `com.solotravelsoul.app` (must match Play Console exactly)
- [ ] Confirm version: `1.0.0` in `app.json`
- [ ] Confirm `eas.json` `appVersionSource: "remote"` — EAS manages versionCode remotely, no local `versionCode` needed
- [ ] Fill `eas.json` → `submit.production.android`:
  - `serviceAccountKeyPath`: path to your Google Play service account JSON key file
  - `track`: `"internal"` for first upload, promote to `"production"` later via Play Console

---

## Step 2 — Google Play Console Setup

- [ ] Create app at play.google.com/console
  - **Default language:** English (United States)
  - **App or game:** App
  - **Free or paid:** Free
- [ ] Complete the **Dashboard checklist** (Play Console guides you through this):
  - App access (set to "All functionality available without restrictions")
  - Ads (No ads)
  - Content rating questionnaire
  - Target audience and content
  - News apps (Not a news app)
  - COVID-19 contact tracing (Not applicable)
  - Data safety form (see Step 7)
  - Government apps (Not applicable)
  - Financial features (Not applicable)

---

## Step 3 — Store Listing (copy/paste into Play Console)

**App name (50 chars max):**
```
SoloTravelSoul
```

**Short description (80 chars max):**
```
Plan trips, journal memories, and discover destinations — built for solo travelers.
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

## Step 4 — Category & Contact

- **Application type:** Apps
- **Category:** Travel & Local
- **Tags:** travel, planner, journal
- **Email:** your developer email (required)
- **Phone:** optional
- **Website:** optional (your landing page or support page)
- **Privacy Policy URL:** publicly hosted, e.g., `https://solotravelsoul.app/privacy`

---

## Step 5 — Screenshots Required

Google Play requires screenshots at these sizes:

| Slot | Size | Notes |
|---|---|---|
| Phone | Min 320dp, max 3840px on either side | **Required** — upload 2–8 |
| 7-inch tablet | Same rules | Optional |
| 10-inch tablet | Same rules | Optional |

**Recommended screenshot size:** 1080×1920 px (portrait) for phones.

**Screenshot suggestions (6 screens):**
1. Home screen with a trip hero card
2. Itinerary day view with places
3. Discover map with pins
4. Packing checklist with suggestions
5. Journal entry with mood
6. Profile screen

**Feature graphic (required):** 1024×500 px JPG or PNG (shown as banner in some Play Store placements)

---

## Step 6 — Content Rating

Complete the IARC questionnaire in Play Console:
- Violence: None
- Sexual content: None
- Language: None
- Controlled substances: None
- Social features: **Yes** (users can interact — chat feature)

Expected rating: **Everyone** (E) or **Everyone 10+** depending on IARC algorithm.

---

## Step 7 — Data Safety Form

In Play Console → Data Safety, declare:

| Data type | Collected | Shared | Required | Optional | Purpose |
|---|---|---|---|---|---|
| Name | Yes | No | Yes | No | App functionality |
| Email address | Yes | No | Yes | No | Account management |
| Photos and videos | Yes | No | No | Yes | App functionality (journal) |
| App activity (trips, journal text) | Yes | No | Yes | No | App functionality |
| Approximate location | Yes | No | No | Yes | App functionality (Near Me) |
| Crash logs | Yes | No | Yes | No | Analytics (Firebase Crashlytics) |

- **Is data encrypted in transit?** Yes
- **Do you provide a way for users to request deletion?** Yes (Profile → Delete account)

---

## Step 8 — Pre-submission Checklist

- [ ] `eas build --platform android --profile production` completed successfully
- [ ] AAB appears in Play Console → Internal testing track
- [ ] Internal testing passed on at least 1 physical Android device
- [ ] Privacy Policy publicly hosted and URL entered in Play Console
- [ ] Data safety form completed and submitted (takes ~3 days for review)
- [ ] Feature graphic uploaded
- [ ] At least 2 phone screenshots uploaded
- [ ] Age rating questionnaire completed
- [ ] No placeholder text visible in the app
- [ ] No debug UI (no dev menus, no internal-only banners)
- [ ] Delete account flow works (Profile → Delete account)
- [ ] Privacy and Terms screens accessible from Profile
- [ ] App has been tested on Android API 29+ (Android 10+)

---

## Step 9 — Submit

```bash
cd apps/mobile
eas submit --platform android --latest
```

Or manually upload the `.aab` from EAS dashboard to Play Console → Internal testing → Create new release.

Promote to Production after internal testing passes:
Play Console → Production → Releases → Promote from Internal testing

---

## Build Commands (this weekend)

```bash
# From apps/mobile directory:

# 1. Preview build (internal testing)
eas build --platform android --profile preview

# 2. Production build (Play Store)
eas build --platform android --profile production

# 3. Submit to Play Store (after production build)
eas submit --platform android --latest
```

---

## Android-Specific Notes

| Item | Detail |
|---|---|
| Minimum SDK | API 24 (Android 7.0) — set via `app.json` → `android.minSdkVersion` |
| Target SDK | API 35 (Android 15) — EAS default; required by Play Store as of Aug 2024 |
| Firebase config | `google-services.json` must be present at `apps/mobile/google-services.json` and NOT committed to git |
| Location permission | `ACCESS_COARSE_LOCATION` only (Near Me feature) — fine location not required |
| Camera/Photos | Accessed only for journal photo uploads — declared in Data Safety |

---

## Known Play Store Review Risks

| Risk | Mitigation |
|---|---|
| Chat feature — user-generated content | Terms of Service covers acceptable use. Note in listing description that chat is a friends/family coordination feature. |
| Location permission | Coarse location only, only prompted when user taps "Near Me" — not background location. |
| Account deletion requirement | Implemented (Profile → Delete account with re-authentication). |
