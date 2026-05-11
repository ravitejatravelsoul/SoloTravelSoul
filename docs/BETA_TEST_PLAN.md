# SoloTravelSoul — Beta Test Plan v1.0.0

## Overview

This document is for internal beta testers. It covers setup, test flows, known limitations, and how to report issues.

**App:** SoloTravelSoul — solo travel planning, journaling, and place discovery  
**Version:** 1.0.0 (beta)  
**Platform:** iOS + Android  
**Backend:** Firebase (Firestore + Auth)

---

## Test Environment Setup

### Android — Expo Go (Recommended for quick testing)
1. Install **Expo Go** from the Play Store
2. Open Expo Go → Scan QR code from `npx expo start`
3. All features work including local notifications

### iOS — Expo Go (Limited)
1. Install **Expo Go** from the App Store
2. Open Expo Go → Scan QR code
3. All features work **except** local notifications (requires dev build — see Known Limitations)

### Full Dev Build (iOS + Android) — Requires EAS
```bash
# One-time setup
cd apps/mobile && eas init

# Build and install
eas build --platform android --profile development
eas build --platform ios --profile development
```

---

## Test Accounts

Create fresh Firebase accounts for testing. Use email/password auth.

**Suggested test accounts:**
- `beta1@test.com` — New user, no trips (tests empty states)
- `beta2@test.com` — Existing user with 2+ trips (tests populated states)

Do **not** use real email addresses in beta.

---

## Feature Test Flows

### 1. Onboarding & Authentication

| Step | Expected result | Pass/Fail |
|---|---|---|
| Open app fresh | 4-slide onboarding carousel appears | |
| Swipe through slides | Content changes, dots update | |
| Tap "Get started" on last slide | Auth screen appears | |
| Sign up with email/password | Account created, lands on Home | |
| Sign out (Profile → Sign out) | Returns to auth screen | |
| Sign in again | Previous data loads, lands on Home | |
| Close app and reopen | Auto-signed in (session persists) | |
| Enable Face ID / fingerprint | Biometric prompt appears on next launch | |

---

### 2. Trip Creation & Management

| Step | Expected result | Pass/Fail |
|---|---|---|
| Tap + on Trips tab | Create trip form opens | |
| Enter destination, dates, optional notes | Fields accept input | |
| Save trip | Trip appears in Upcoming list | |
| Tap trip → opens Trip Detail | Hero shows destination and dates | |
| Tap edit (pencil icon) | Edit form pre-filled | |
| Change dates | Trip updates, reminders reschedule automatically | |
| Delete trip | Confirmation alert → trip removed | |
| Pull-to-refresh on Trips list | Spinner shows, data refreshes | |

**Edge cases:**
- Create trip with start date = today → status shows "Currently Active"
- Create trip with past end date → shows in Past tab with "Completed" badge
- Long destination name (30+ chars) → text wraps or truncates without overflow

---

### 3. Itinerary

| Step | Expected result | Pass/Fail |
|---|---|---|
| Trip Detail → Itinerary | Day timeline shows for each trip day | |
| Expand a day | Day row expands to show empty state or places | |
| Tap "Add place" | Input appears | |
| Add a place with name | Place appears in that day's list | |
| Add a note to a place | Note saves and shows | |
| Remove a place | Confirmation → place removed | |
| Trip with 7+ days | All days generated correctly | |

---

### 4. Journal / Memories

| Step | Expected result | Pass/Fail |
|---|---|---|
| Trip Detail → Journal | Journal timeline screen opens | |
| Tap day header → "Add memory" | Journal entry form appears | |
| Write text, set mood, set place chip | All fields accept input | |
| Save entry | Entry appears in timeline with mood emoji | |
| Tap entry → expand | Full text and details show | |
| Tap edit on entry | Edit form pre-filled | |
| Delete entry | Confirmation → entry removed | |
| Add photo to entry | Image picker opens, photo attaches | |

---

### 5. Packing Checklist & Smart Suggestions

| Step | Expected result | Pass/Fail |
|---|---|---|
| Trip Detail → scroll to checklist | Checklist section shows | |
| "Suggested for this trip" chips appear | Smart suggestions based on destination | |
| Tap a suggestion chip | Item added to checklist | |
| Tap "Add all" | Up to 8 suggestions added at once | |
| Type custom item → Add | Item added to bottom of list | |
| Check an item | Moves to bottom (checked section) with strikethrough | |
| Uncheck an item | Moves back to unchecked section | |
| Delete item | Swipe or long-press → confirmation → removed | |
| Progress bar at top | Updates percentage as items checked | |

**Suggestion signals to verify:**
- Beach destination → suggests sunscreen, swimwear, flip flops
- Hiking itinerary places → suggests hiking boots, water bottle
- 7+ day trip → suggests laundry bag, multiple outfit sets
- International trip (destination not in US) → suggests passport, adapter

---

### 6. Place Discovery

| Step | Expected result | Pass/Fail |
|---|---|---|
| Tap Discover tab | 8 category tiles + search bar | |
| Tap a category (e.g. Beach) | Filters cards to that category | |
| Tap "Near me" | Location permission prompt → sorts by distance | |
| Search "Grand Canyon" | Filters local results in real time | |
| Type 3+ chars in search | "Live destinations" section appears below | |
| "Live search coming soon" card | Confirms Foursquare integration not yet live | |
| Clear search | Live section disappears | |
| Tap heart on a card | Place saved, heart fills | |
| Tap heart again | Place removed, heart empties | |
| Tap "Add to trip" | Sheet appears with trip list | |
| Select a trip | Place added to that trip's itinerary | |
| Toggle to Map view | Placeholder map shows with dev badge | |

---

### 7. Saved Places

| Step | Expected result | Pass/Fail |
|---|---|---|
| Profile → Saved Places (count shown) | Library screen opens | |
| Saved places list | Cards show saved place names | |
| Tap a saved place | Detail modal opens | |
| "Add to trip" from detail modal | Trip selection sheet opens | |
| Remove a place | Swipe to delete or detail modal button | |
| Empty library | Empty state with emoji and text | |

---

### 8. Trip Sharing & Export

| Step | Expected result | Pass/Fail |
|---|---|---|
| Trip Detail → share icon (top right) | Export preview modal opens | |
| Preview shows trip summary | Destination, dates, packing %, itinerary | |
| Journal toggle (off by default) | Turning on adds journal highlights | |
| Privacy banner visible | Green shield "Journal exported safely" | |
| Tap Share | Native share sheet opens with text | |
| Tap Copy | Text copied to clipboard, toast confirms | |

---

### 9. Trip Reminders

| Step | Expected result | Pass/Fail |
|---|---|---|
| Trip Detail → scroll to Reminders | Reminders card shows 4 toggles | |
| Toggle any reminder ON (first time) | Permission dialog appears | |
| Allow notifications | Toggle stays ON, green "Active" badge appears | |
| Toggle a second reminder | No second permission dialog | |
| Check that past-date reminders are disabled | "Date already passed" shown in subtitle | |
| Edit trip to future date | Reminders reschedule automatically | |
| Delete trip | Notifications cancelled (check device notification list) | |

**Android Expo Go — Notification delivery test:**
1. Set trip start date to 7 days from now
2. Toggle "7 days before" ON
3. Temporarily change trigger to 10 seconds (dev only) and verify notification fires
4. Revert

**iOS Expo Go:**
- Yellow warning banner should appear: "Local notifications require a dev build on iOS"
- Toggles still work and save — no crash

---

### 10. Offline Mode

| Step | Expected result | Pass/Fail |
|---|---|---|
| Load app with internet | All data loads normally | |
| Enable airplane mode | Orange offline banner appears at top | |
| Navigate between tabs | Cached data still shows | |
| Check a checklist item offline | Item checks immediately (optimistic) | |
| Add a journal entry offline | Entry saves to cache | |
| Re-enable internet | Sync status bar shows "Syncing…" → "Synced" | |
| Verify synced data in Firestore | Data persisted correctly | |
| Kill app while offline, reopen | Cached data still shows | |

---

### 11. Profile

| Step | Expected result | Pass/Fail |
|---|---|---|
| Tap Profile tab | Hero with name, email, avatar initials | |
| Tap "Edit profile" | Edit form opens | |
| Add bio, travel preferences, home city | Fields save correctly | |
| Return to profile | Bio and preferences show | |
| Privacy Policy row | Opens privacy screen | |
| Terms of Service row | Opens terms screen | |
| Version row | Shows "Version 1.0.0" (non-tappable) | |

---

## Known Limitations

These are confirmed limitations in v1.0.0 beta — not bugs.

| Limitation | Details | Workaround |
|---|---|---|
| **iOS notifications in Expo Go** | Local notifications don't fire in Expo Go on iOS — requires a dev build | Use Android Expo Go for notification testing |
| **Map view** | Map tab in Discover is a placeholder — real Mapbox map comes in Phase 2 | N/A |
| **Live place search** | Foursquare integration is built but disabled — shows "coming soon" | Use bundled local destinations |
| **Photo upload to cloud** | Journal photos attach locally but Firebase Storage upload is disabled until Blaze plan upgrade | Photos show in-session but won't persist to a new device |
| **Group trips** | Group trip planning is scaffolded but not accessible in this build | N/A |
| **Single-device reminders** | Notification IDs are device-local — enabling reminders on one phone doesn't propagate to another | Enable reminders separately on each device |

---

## Safety Audit — Confirmed

- ✅ No Google Maps or Google Places API calls
- ✅ No hardcoded API keys in source (all keys in `.env`, covered by `.gitignore`)
- ✅ `.env` and `.env.local` excluded from git
- ✅ Foursquare API flag is `false` by default — zero API calls without explicit opt-in
- ✅ Firestore rules restrict all reads/writes to the authenticated user's own data
- ✅ Firestore rules include `reminders` subcollection
- ✅ `places_cache` write requires matching `id` field and valid `source` value
- ✅ No paid APIs enabled

---

## Screenshot Checklist

Take screenshots at these moments for store listing use:

- [ ] **Onboarding** — Last slide with "Where your solo story begins" text
- [ ] **Home dashboard** — With an active trip showing the hero card + stats
- [ ] **Discover** — Category grid visible + 2-3 attraction cards below
- [ ] **Trip Detail** — Gradient hero + checklist section with some items checked
- [ ] **Itinerary** — Timeline with 3+ days expanded, places visible
- [ ] **Journal** — Memory card with mood emoji, place chip, and photo
- [ ] **Saved Places** — Library with 3+ saved places shown
- [ ] **Offline mode** — Orange offline banner visible at top of Home

**Spec:**
- iOS screenshots: 6.7" (iPhone 15 Pro Max): 1290×2796px
- Android screenshots: 1080×1920px minimum
- No device frame required for Play Store; recommended for App Store

---

## Reporting Bugs

Report issues at: https://github.com/ravitejatravelsoul/solotravelsoul/issues

**Include in your report:**
1. Device model and OS version
2. Expo Go or dev build
3. Steps to reproduce
4. Expected vs actual behavior
5. Screenshot or screen recording (preferred)

**Priority labels:**
- `critical` — Crash, data loss, auth failure
- `bug` — Something doesn't work as documented above
- `polish` — Visual glitch, wrong text, minor annoyance
- `question` — Not sure if it's a bug
