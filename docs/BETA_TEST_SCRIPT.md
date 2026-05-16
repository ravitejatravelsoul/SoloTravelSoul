# SoloTravelSoul Beta Test Script

**Version:** 1.0 — Expo Go build  
**Date:** May 2026  
**Test environment:** Expo Go on physical iOS or Android device

---

## Before You Start

1. Install **Expo Go** from the App Store / Play Store
2. Open the app link or scan the QR code the developer sends you
3. Create an account with a real email address you have access to
4. Make sure you have an internet connection for the first launch
5. Note down any crashes, incorrect text, or broken buttons as you go

---

## Section 1 — Auth & Onboarding

### 1.1 Onboarding Slides
1. Fresh install — open app
2. Swipe through all 4 intro slides
3. Tap "Get started"

**Expected:** Slides advance smoothly, landing on the login screen.

### 1.2 Sign Up
1. Tap "Create an account"
2. Enter a display name, email, and a password (min 8 chars)
3. Tap "Sign up"

**Expected:** Account created, redirected to home screen. No error toast.

### 1.3 Log Out and Log Back In
1. Go to Profile → scroll to bottom → tap "Sign out"
2. Log back in with your credentials

**Expected:** Login succeeds, home screen loads with your data.

### 1.4 Forgot Password
1. Log out
2. Tap "Forgot password?" on login screen
3. Enter your email and tap send

**Expected:** "Password reset email sent" confirmation. Check your inbox.

### 1.5 Biometric Login (optional — iOS Face ID / Android fingerprint)
1. After first login, try closing and reopening the app
2. If prompted, enable biometric sign-in

**Expected:** Biometric prompt appears, unlocking returns you to the home screen.

**Screenshot to send:** Login screen, home screen after login.

---

## Section 2 — Home Screen

1. After login, observe the home screen
2. Check the greeting label (Good morning / afternoon / evening)
3. If you have no trips: verify "Where to next?" hero card and "Plan your first trip" CTA
4. Tap each quick action tile: New Trip, Discover, My Trips, Profile
5. Verify the offline banner appears when airplane mode is on

**Expected:** All four tiles navigate to the correct screens. Greeting matches time of day.

---

## Section 3 — Trips

### 3.1 Create a Trip
1. Tap "New Trip" from home or the Trips tab
2. Enter: destination name, start date (next week), end date (2 weeks later), and optional notes
3. Tap "Create trip"

**Expected:** Trip appears in the Trips list. Hero card on home shows this trip.

### 3.2 Trip Detail Screen
1. Tap the trip from the Trips list
2. Verify the gradient hero shows the destination, date range, and duration pill
3. Verify the status badge ("Upcoming")
4. Verify the stats strip shows correct days count
5. Tap the share icon (top right) — verify the Share Trip modal opens

**Expected:** Hero renders correctly. Share modal shows a text preview of the trip.

### 3.3 Trip Share / Export
1. In the Share Trip modal, toggle "Include journal entries"
2. Tap "Copy" — paste in Notes to verify the text is correct
3. Tap "Share" — native share sheet should appear

**Expected:** Text preview updates when toggle changes. Native share sheet opens with trip summary.

### 3.4 Edit Trip
1. From trip detail, tap the edit icon (pencil)
2. Change the destination name and tap Save

**Expected:** Trip name updates everywhere (list, detail, home hero card).

### 3.5 Delete Trip
1. From trip detail, scroll to bottom → tap "Delete trip"
2. Confirm in the alert

**Expected:** Trip is removed from all lists. Home screen reverts to "Where to next?" if no trips remain.

---

## Section 4 — Itinerary

### 4.1 View Itinerary
1. Open a trip → tap the "Itinerary" action tile
2. Verify a day card exists for each day of the trip

**Expected:** Day cards show the correct dates. Empty days show "Tap to plan this day".

### 4.2 Day Detail — Add a Place
1. Tap any day card
2. In the day detail screen, observe the places and journal sections
3. Navigate back to the itinerary list

**Expected:** Day detail shows places and journal entries sections (empty if none added yet).

### 4.3 Map Toggle
1. On the itinerary list screen, tap the map icon (top right)
2. A real map should appear with OpenStreetMap tiles
3. If any places have been added to the itinerary with coordinates, numbered pins should appear

**Expected:** Map renders. Numbered pins show. Tapping a pin shows a name toast with a close button.

### 4.4 Add Place from Discover to Itinerary
1. Go to Discover → find a place → tap "Add to trip"
2. Select a trip → select a day

**Expected:** "Added to itinerary!" toast appears. Place now shows in the itinerary day.

---

## Section 5 — Packing Checklist

### 5.1 Smart Suggestions
1. Open a trip detail screen
2. Scroll to the "Packing Checklist" section
3. Observe any suggested items shown above the checklist

**Expected:** Trip-context suggestions shown (e.g., sunscreen for beach destinations). "Add all" button adds them all.

### 5.2 Add, Check, Delete
1. Type an item in the "Add an item…" field and press Done or tap Add
2. Tap the checkbox to mark it done
3. Long-press (tap the ×) to delete an item

**Expected:** Item appears, checks off, and deletes correctly. Progress percentage updates.

---

## Section 6 — Journal

### 6.1 Add a Journal Entry
1. Open a trip → tap "Journal"
2. Tap a day to open day detail
3. Add a journal entry: title, text, mood (tap one of the mood options), optional photo

**Expected:** Entry saved. Journal gallery shows the entry with mood and timestamp.

### 6.2 Edit and Delete
1. Tap an existing entry
2. Edit the text
3. Delete the entry

**Expected:** Changes persist. Deleted entries disappear from the list.

---

## Section 7 — Discover Places

### 7.1 Browse Local Attractions
1. Go to the Discover tab
2. Scroll through the attraction cards
3. Tap category chips (Beach, Hiking, City, etc.) to filter

**Expected:** Cards update to match selected category. "Show all places" clears filter.

### 7.2 Search
1. Type a city or state name in the search bar (e.g., "Miami" or "California")
2. Results should filter as you type

**Expected:** Matching local attractions appear. Non-matching ones are hidden.

### 7.3 Near Me
1. Tap "Near me" button
2. Grant location permission when prompted
3. Results should sort by distance from your current location

**Expected:** Distance badge appears on each card. Results re-sorted by proximity.

### 7.4 Save a Place
1. Tap the heart icon on any attraction card
2. Tap again to unsave

**Expected:** Heart fills red when saved. Saved place appears in the horizontal "Saved places" scroll row.

### 7.5 Add Place to Trip
1. Tap "Add to trip" on any attraction
2. Select a trip, then select a day

**Expected:** "Added to itinerary!" success toast. Place appears in that day's itinerary.

### 7.6 Map View
1. Tap the "Map" toggle in the Discover header
2. A real OSM map should load with blue dots for bundled attractions

**Expected:** Map renders with pins. Tapping a pin shows a bottom card with the place name, save button, and "Add to trip" button.

---

## Section 8 — Saved Places

1. Go to Profile or use the Saved section
2. View all saved places
3. Use the category filter chips to narrow down
4. Tap "Add to trip" from the saved places screen

**Expected:** Saved places list correct. Filter works. Adding to trip works.

---

## Section 9 — Profile

### 9.1 View Profile
1. Go to the Profile tab
2. Verify your name, email, and trip stats are correct

**Expected:** Profile info matches what you entered at signup.

### 9.2 Edit Profile
1. Tap "Edit profile"
2. Change your display name, add a bio, set a home city
3. Add a travel preference (Beach, City, etc.)
4. Save

**Expected:** Changes reflect immediately on the profile screen.

### 9.3 Profile Photo
1. Tap the avatar to change it
2. Select a photo from the library or take one

**Expected:** Photo uploads and appears as your avatar on the home screen header.

---

## Section 10 — Notifications

1. Open the notifications bell icon (or navigate to Notifications)
2. If you have any in-app notifications (group invites, etc.), mark them as read

**Expected:** Unread notifications show a dot. Tapping marks them read.

### Trip Reminders
1. Open a trip detail → scroll to "Reminders" card
2. Toggle a reminder on (e.g., "1 day before")
3. Check that no error appears

**Expected:** Reminder toggles without error. (Actual notification fires at the scheduled time.)

---

## Section 11 — Chats & Groups

### 11.1 Start a Direct Chat
1. Go to the Chats tab
2. Tap the compose icon → enter another test user's email
3. Send a message

**Expected:** Chat thread opens. Message appears in real time.

### 11.2 Create a Group
1. Tap the + Groups button
2. Enter a group name and add member emails (other test accounts)
3. Tap Create

**Expected:** Group appears in the Chats → Groups section.

### 11.3 Group Chat
1. Open the group
2. Send a message
3. Have another tester in the same group verify they see it in real time

**Expected:** Messages appear instantly for all members.

---

## Section 12 — Offline Mode

1. Enable airplane mode
2. Open the app
3. Navigate through Home → Trips → Itinerary

**Expected:**
- Offline banner ("You're offline") appears on the home screen
- Previously loaded trips and itinerary are still visible
- Any write actions (add checklist item) show in a pending queue, then sync when back online

4. Re-enable internet
5. Verify syncing completes (SyncStatusBar on trip detail shows "Synced")

---

## Section 13 — Biometric / Security

1. Log out completely
2. Log back in with password
3. Enable biometric if prompted
4. Close and reopen the app
5. Use biometric to unlock

**Expected:** App unlocks via biometric without requiring full password re-entry.

---

## Section 14 — Edge Cases

| Scenario | Steps | Expected |
|---|---|---|
| Trip with 1 day | Create a trip where start = end date | Itinerary shows exactly 1 day |
| Very long destination name | 60+ character destination | Name truncates with "..." in cards |
| No internet on first open | Start in airplane mode | Shows offline banner; no crash |
| Empty search | Type then clear the search | All results restore |
| Add same place twice | Add same place to same day | Two entries appear (duplicates allowed) |
| Delete trip with itinerary data | Delete trip that has places in it | Trip and all its data removed |

---

## What to Send Back

After testing, please send:

1. **Screenshots of any broken UI** — include which screen and what action triggered it
2. **Any crash logs** — shake the device → "Send diagnostics" if Expo Dev Menu appears; otherwise note the exact steps that caused it
3. **Any toast/error messages** — screenshot the message text
4. **Confirmation for each section** — which sections passed, which failed
5. **Device info** — iOS/Android version, device model

---

## Known Limitations (Not Bugs)

| Limitation | Notes |
|---|---|
| Foursquare live search | Disabled by default. Shows "Coming soon" when you search 3+ chars. Live data requires separate enable. |
| Trending destinations | "Phase 2" placeholder shown in Discover — real data not yet connected |
| Map requires internet | The Expo Go map uses OpenStreetMap tiles — no offline map support |
| Group join requests | The UI shows a requests section but the full invite/accept flow is Phase 2 |
| Trip export as PDF | Export sends plain text via the native share sheet — no PDF generation yet |
| Push notifications (FCM) | Local reminders work. Remote push (e.g., group chat alerts) requires an EAS build |
| Mapbox native map | Not active in Expo Go — requires an EAS production build to enable |

---

## Firebase / Data Safety Notes

- Your data is stored in Firebase Firestore under your account only
- No other user can read your trips, itinerary, or journal
- Group members can only see messages in groups they belong to
- No Google Maps or Google Places APIs are used
- Foursquare is disabled by default; when enabled, results are cached per device and limited to 50 searches/day

---

## Final Go / No-Go Checklist

Before declaring beta-ready, all of the following must pass:

- [ ] Sign up and login work
- [ ] Trip creation and listing work  
- [ ] Itinerary loads correct day count  
- [ ] Checklist add/check/delete works  
- [ ] Journal entry add/edit/delete works  
- [ ] Discover search and filter work  
- [ ] Save place and add to trip work  
- [ ] Map shows in both Discover and Itinerary  
- [ ] Profile edit and photo upload work  
- [ ] Offline mode shows cached data  
- [ ] Share/export trip produces correct text  
- [ ] No crashes on any tested flow
