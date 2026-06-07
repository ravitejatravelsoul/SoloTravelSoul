# SoloTravelSoul — Community Implementation Tasks

**Status:** Pre-implementation task backlog  
**Date:** May 2026  
**Format:** Kiro/spec-driven development task cards

Do not begin implementation without reading:
- `docs/COMMUNITY_PRODUCT_REQUIREMENTS.md`
- `docs/COMMUNITY_TECHNICAL_DESIGN.md`
- `docs/COMMUNITY_UX_FLOW.md`

---

## PHASE 1 — Traveler Profile Upgrade

---

### TASK-001: Add Community Types to Shared Package

**Title:** Add community TypeScript types to packages/shared

**Description:**
Create `packages/shared/src/types/Community.ts` with all shared types for the community platform. This is the foundation all other tasks depend on.

**Affected files:**
- `packages/shared/src/types/Community.ts` (create)
- `packages/shared/src/index.ts` (export new types)

**Types to define:**
```typescript
TravelStyle = 'solo' | 'budget' | 'luxury' | 'adventure' | 'cultural' | 'food' | 'digital-nomad' | 'eco'
Interest = 'hiking' | 'photography' | 'food' | 'nightlife' | 'history' | 'beach' | 'languages' | 'volunteering' | 'yoga' | 'art' | 'sports' | 'music'
ProfileVisibility = 'public' | 'private'
TripVisibility = 'private' | 'public'
RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
PublicProfile (interface)
PublicTrip (interface)
TripJoinRequest (interface)
TripMember (interface)
TravelGroup (interface)
GroupMember (interface)
GroupJoinRequest (interface)
FeedItem (interface)
FeedItemType (union)
Report (interface)
Block (interface)
```

**Acceptance criteria:**
- All types exported from package root
- No `any` types
- All fields match Firestore schema in COMMUNITY_TECHNICAL_DESIGN.md
- `npx tsc --noEmit` passes

**Dependencies:** None

**Test checklist:**
- [ ] TypeScript compiles with zero errors
- [ ] All interfaces have full field coverage matching design doc

---

### TASK-002: Add Community Firestore Functions

**Title:** Add community read/write functions to packages/firebase

**Description:**
Extend `packages/firebase/src/firestore.ts` with functions for public profiles, public trips discovery, join requests, travel groups, blocks, and reports. Do NOT implement all at once — implement only what Phase 1 needs (public profiles). Phases 2–7 will add functions in their tasks.

**Phase 1 scope (this task):**
- `getPublicProfile(uid): Promise<PublicProfile | null>`
- `upsertPublicProfile(uid, data): Promise<void>` — batch writes users/{uid} + publicProfiles/{uid}
- `deletePublicProfile(uid): Promise<void>`

**Affected files:**
- `packages/firebase/src/firestore.ts` (extend)
- `packages/firebase/src/index.ts` (export new functions)

**Acceptance criteria:**
- `upsertPublicProfile` does a Firestore batch write (atomic: users + publicProfiles)
- `deletePublicProfile` deletes only publicProfiles/{uid} (not users/{uid})
- Functions gracefully handle missing documents (return null, not throw)
- TypeScript passes

**Dependencies:** TASK-001

**Test checklist:**
- [ ] upsertPublicProfile writes to both documents
- [ ] deletePublicProfile only removes publicProfiles document
- [ ] getPublicProfile returns null when document doesn't exist
- [ ] getPublicProfile returns null when profileVisibility is private (rule-level)
- [ ] TypeScript passes

---

### TASK-003: Update Firestore Rules for Community Phase 1

**Title:** Add Firestore rules for publicProfiles collection

**Description:**
Update `firestore.rules` to add rules for the new `publicProfiles/{uid}` collection.

**Rules to add:**
```
match /publicProfiles/{uid} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == uid;
}
```

**Also verify existing rules still pass:**
- users/{uid}: owner-only write, owner-only read (unchanged)

**Affected files:**
- `firestore.rules`

**Acceptance criteria:**
- Authenticated users can read any publicProfiles document
- Only the owner can write to their publicProfiles document
- Unauthenticated users cannot read publicProfiles
- Existing user rules unchanged

**Dependencies:** None

**Test checklist:**
- [ ] Authenticated user can read publicProfiles/{uid}
- [ ] User A cannot write to publicProfiles/{userB}
- [ ] Unauthenticated read is rejected
- [ ] Deploy to Firebase test environment

---

### TASK-004: Extend Edit Profile Screen

**Title:** Add community profile fields to Edit Profile screen

**Description:**
Extend the existing `apps/mobile/app/(app)/profile/edit.tsx` (or wherever profile editing lives) with new sections for bio, travel identity, and discovery settings.

**New sections to add (in order):**
1. **About** — Bio textarea (500 char, with character counter)
2. **Where I'm From** — Home country (picker), current city (text input)
3. **My Travel Style** — Multi-select chip grid (8 options from TravelStyle enum)
4. **Languages** — Multi-select chip list (common languages)
5. **Countries Visited** — Searchable multi-select with count badge
6. **Interests** — Multi-select chip grid (12 options from Interest enum)
7. **Dream Destinations** — Tag input (max 5, free text)

**Affected files:**
- `apps/mobile/app/(app)/profile/edit.tsx` (extend)
- `apps/mobile/components/ui/MultiSelectChips.tsx` (create — reusable)
- `apps/mobile/components/ui/TagInput.tsx` (create — max N tags)
- `apps/mobile/components/ui/CountryPicker.tsx` (create — searchable list)

**UX requirements:**
- All new fields optional (no blocking validation)
- Save button in header
- Character counter on bio
- Unsaved changes warning on back press
- Loading state on save

**Acceptance criteria:**
- All new fields save to `users/{uid}` via upsertPublicProfile
- If profileVisibility is public, also saves to publicProfiles/{uid}
- Unsaved changes prompt on navigate away
- Character limits enforced with visual counter
- TypeScript passes

**Dependencies:** TASK-001, TASK-002

**Test checklist:**
- [ ] Bio saves (max 500 chars enforced)
- [ ] Travel styles multi-select saves correctly
- [ ] Countries visited saves as array of codes
- [ ] Dream destinations max 5 enforced
- [ ] Data reloads correctly when screen reopened
- [ ] Back press with unsaved changes shows prompt

---

### TASK-005: Create Privacy Settings Screen

**Title:** Add Privacy Settings screen to profile

**Description:**
Create `apps/mobile/app/(app)/profile/privacy.tsx` — a screen for profile visibility toggle and block list management.

**Contents:**
- Profile visibility toggle: Public / Private (with explanation)
- "Who can see your profile" explanation card
- Link to blocked users list (placeholder for Phase 7)
- Future placeholders (greyed out): Discovery, Nearby (V1.2)

**Affected files:**
- `apps/mobile/app/(app)/profile/privacy.tsx` (create)
- `apps/mobile/app/(app)/profile/index.tsx` (add Privacy Settings menu item)

**Acceptance criteria:**
- Toggle saves `profileVisibility` to users/{uid}
- Switching to public calls `upsertPublicProfile`
- Switching to private calls `deletePublicProfile`
- Toggle reflects current saved state on load
- TypeScript passes

**Dependencies:** TASK-001, TASK-002

**Test checklist:**
- [ ] Toggle to public creates publicProfiles document
- [ ] Toggle to private removes publicProfiles document
- [ ] State persists after screen close/reopen
- [ ] Toggle is disabled while saving (prevent double-write)

---

### TASK-006: Create Public Profile Screen

**Title:** Create the Public Profile viewer screen

**Description:**
Create `apps/mobile/app/(app)/community/profile/[uid].tsx` — the screen shown when viewing another user's profile.

**Layout:**
- Avatar (large), display name, verified email indicator (if applicable)
- Current city + home country flag emoji
- Bio text
- Travel styles pills (read-only)
- Countries visited (count + expandable list)
- Languages
- Interests pills
- "Trip count" stat
- Member since date
- 3-dot menu: Report button

**Private profile state:**
- Show avatar + name only
- "This profile is private" message

**Blocked state:**
- If viewer has blocked: "You have blocked this user. [Unblock]"
- If blocked by this user: Show private state (cannot reveal block)

**Affected files:**
- `apps/mobile/app/(app)/community/profile/[uid].tsx` (create)
- `apps/mobile/components/community/PublicProfileHeader.tsx` (create)
- `apps/mobile/components/community/ProfileStatRow.tsx` (create)

**Acceptance criteria:**
- Navigable from any tap on a user's name/avatar in community screens
- Public profile shows all allowed fields
- Private profile shows restricted state
- Report button opens ReportModal (placeholder in Phase 7)
- TypeScript passes

**Dependencies:** TASK-001, TASK-002

**Test checklist:**
- [ ] Public profile renders all fields
- [ ] Private profile shows restricted UI
- [ ] Back navigation works
- [ ] Report option in menu renders (can be no-op stub for now)
- [ ] TypeScript passes

---

### TASK-007: Create Safety Guidelines Screen

**Title:** Add Safety & Community Guidelines screen

**Description:**
Create `apps/mobile/app/(app)/profile/safety.tsx` — a static screen with community guidelines, how to report, and safety information.

**This is required for App Store submission.** Social/chat apps must have visible safety guidelines.

**Contents:**
- Header: "Community Guidelines"
- Guidelines list (respectful travel, no harassment, real profiles only, protect privacy)
- "How to report" section with step-by-step
- "How to block" section
- Privacy policy link
- Support email: `safety@solotravelsoul.app`

**Affected files:**
- `apps/mobile/app/(app)/profile/safety.tsx` (create)
- `apps/mobile/app/(app)/profile/index.tsx` (add Safety & Guidelines menu item)

**Acceptance criteria:**
- Screen accessible from Profile → Safety & Guidelines
- External privacy policy link works
- No network required (static content)
- TypeScript passes

**Dependencies:** None

**Test checklist:**
- [ ] Screen renders without any Firestore reads
- [ ] Accessible from profile menu
- [ ] Privacy policy link navigates correctly

---

## PHASE 2 — Public Trips + Visibility

---

### TASK-008: Extend Trip Schema for Visibility

**Title:** Add visibility, description, tags, and member fields to trip schema

**Description:**
Update trip creation and edit flows to include visibility settings. Add new fields to the trips Firestore document. Create the publicTrips collection writes.

**New fields in trips/{tripId}:**
- `visibility: 'private' | 'public'` (default: 'private')
- `description: string`
- `tags: string[]`
- `maxMembers: number | null`
- `memberCount: number` (default: 1 — owner)
- `isAcceptingMembers: boolean` (default: true)

**Firestore functions to add:**
- `setTripVisibility(tripId, uid, visibility, data): Promise<void>` — updates trip + creates/deletes publicTrips
- `subscribePublicTrips(filters, limit): Unsubscribe`
- `getPublicTrip(tripId): Promise<PublicTrip | null>`

**Affected files:**
- `packages/shared/src/types/Community.ts` (extend Trip/PublicTrip)
- `packages/firebase/src/firestore.ts` (add functions above)
- `apps/mobile/app/(app)/trips/create.tsx` (add default private visibility)
- `apps/mobile/app/(app)/trips/[tripId]/edit.tsx` (add visibility section)
- `apps/mobile/components/trips/TripVisibilitySettings.tsx` (create)
- `firestore.rules` (publicTrips rules)
- `firestore.indexes.json` (publicTrips indexes)

**Acceptance criteria:**
- New trip defaults to `visibility: 'private'`
- Switching to public creates publicTrips document (batch write)
- Switching to private deletes publicTrips document
- Deleting trip deletes publicTrips document
- Cannot set public without a destination (validation)
- TypeScript passes

**Dependencies:** TASK-001, TASK-002, TASK-003

**Test checklist:**
- [ ] New trip has `visibility: 'private'` default
- [ ] Public trip creates publicTrips document with correct data
- [ ] Private trip removes publicTrips document
- [ ] Deleted trip removes publicTrips document
- [ ] TypeScript passes

---

### TASK-009: Build Public Trips Discovery Screen

**Title:** Create Public Trips list and detail screens

**Description:**
Create the Discover Trips experience. This is the primary discovery surface.

**Screens to build:**
1. `apps/mobile/app/(app)/discover/trips/index.tsx` — list screen
2. `apps/mobile/app/(app)/discover/trips/[tripId].tsx` — detail screen
3. `apps/mobile/components/discover/PublicTripCard.tsx` — list item

**List screen:**
- Destination search bar
- "Open to join" filter toggle
- Paginated list (20 per page)
- Loading skeletons
- Empty / error states
- Navigate to detail on tap

**Detail screen:**
- Cover photo or gradient fallback
- Owner card (tappable → public profile)
- Trip description, dates, member count, tags
- Member avatars
- Join button (state-aware — see UX doc)
- Save and Share buttons
- Report button

**Affected files:**
- `apps/mobile/app/(app)/discover/trips/index.tsx` (create)
- `apps/mobile/app/(app)/discover/trips/[tripId].tsx` (create)
- `apps/mobile/app/(app)/discover/index.tsx` (add Trips section or tab)
- `apps/mobile/components/discover/PublicTripCard.tsx` (create)
- `apps/mobile/components/discover/TripDetailHeader.tsx` (create)
- `apps/mobile/hooks/usePublicTrips.ts` (create)

**Acceptance criteria:**
- List shows public trips, paginated, with filters
- Detail shows all public trip data
- Owner card navigates to public profile
- Save trip stores reference in user's saved list
- Share generates a sharable text summary
- TypeScript passes

**Dependencies:** TASK-008

**Test checklist:**
- [ ] List loads and paginates correctly
- [ ] Destination filter narrows results
- [ ] Detail shows correct owner profile card
- [ ] Empty state shown when no trips match filter
- [ ] Error state shown on network failure
- [ ] TypeScript passes

---

## PHASE 3 — Trip Join Requests

---

### TASK-010: Add Join Request Firestore Functions

**Title:** Add trip join request Firestore read/write functions

**Description:**
Add all Firestore functions for trip join requests to `packages/firebase/src/firestore.ts`.

**Functions to add:**
- `submitTripJoinRequest(tripId, requestorUid, message): Promise<void>`
- `cancelTripJoinRequest(requestId, requestorUid): Promise<void>`
- `approveTripJoinRequest(requestId, ownerUid): Promise<void>` — batch: update request + create member doc + increment memberCount
- `rejectTripJoinRequest(requestId, ownerUid): Promise<void>`
- `subscribeMyJoinRequests(requestorUid): Unsubscribe`
- `subscribeTripJoinRequestsForOwner(ownerUid): Unsubscribe`
- `subscribeRequestsForTrip(tripId): Unsubscribe`
- `getTripJoinRequestStatus(tripId, requestorUid): Promise<RequestStatus | null>`

**Affected files:**
- `packages/firebase/src/firestore.ts` (extend)
- `packages/firebase/src/index.ts` (export)
- `firestore.rules` (tripJoinRequests rules)
- `firestore.indexes.json` (tripJoinRequests indexes)

**Acceptance criteria:**
- requestId is `${tripId}_${requestorUid}` (prevents duplicates)
- Approval is a Firestore batch: request updated + member created + memberCount incremented
- Cannot approve/reject if not owner (rules enforced)
- Cannot submit if already pending (check before write)
- TypeScript passes

**Dependencies:** TASK-001, TASK-008

**Test checklist:**
- [ ] Submit creates document with status 'pending'
- [ ] Cannot submit duplicate request (same tripId + requestorUid)
- [ ] Approval batch completes atomically
- [ ] After approval, member document exists
- [ ] After approval, trip memberCount is incremented
- [ ] Cancel sets status to 'cancelled' (not deleted)

---

### TASK-011: Build Join Request Modal

**Title:** Create join request submission modal

**Description:**
Create the `JoinRequestModal` component shown when user taps "Request to Join" on a public trip detail screen.

**Affected files:**
- `apps/mobile/components/community/JoinRequestModal.tsx` (create)
- `apps/mobile/app/(app)/discover/trips/[tripId].tsx` (integrate modal)
- `apps/mobile/hooks/useTripJoinRequest.ts` (create)

**Acceptance criteria:**
- Modal shows trip title, message input (optional, 300 char max)
- Submit button disabled when loading
- Success: modal closes, trip detail button state changes to "Pending"
- Error: shows error message, retry possible
- "Request to Join" not shown if user is the owner
- "Request to Join" replaced with "Pending" if already pending
- Rate limiting: if 3+ requests submitted today, show message
- TypeScript passes

**Dependencies:** TASK-009, TASK-010

**Test checklist:**
- [ ] Modal renders correctly
- [ ] Message max 300 chars enforced
- [ ] Submit button shows loading state
- [ ] Success closes modal and updates parent button state
- [ ] Own trip shows no join button
- [ ] Existing pending request shows "Pending" state

---

### TASK-012: Build My Join Requests Screen

**Title:** Create "My Join Requests" screen for requestors

**Description:**
Create `apps/mobile/app/(app)/profile/join-requests.tsx` with two tabs: Sent (my requests) and Received (requests to my trips).

**Affected files:**
- `apps/mobile/app/(app)/profile/join-requests.tsx` (create)
- `apps/mobile/app/(app)/profile/index.tsx` (add menu item if pending requests exist)
- `apps/mobile/components/community/JoinRequestCard.tsx` (create)

**Acceptance criteria:**
- Sent tab shows all my submitted requests with status badge
- Received tab shows all requests to my public trips
- Status badges: Pending (yellow), Approved (green), Rejected (red), Cancelled (grey)
- Approved request has "View Trip" action
- Pending request has "Cancel" action
- Received request has "Approve" and "Reject" actions inline
- Real-time updates via Firestore listener
- TypeScript passes

**Dependencies:** TASK-010, TASK-011

**Test checklist:**
- [ ] Sent tab lists my requests with correct statuses
- [ ] Received tab lists requests to my trips
- [ ] Cancel updates status to 'cancelled'
- [ ] Approve updates status + creates member doc
- [ ] Approved request shows "View Trip" navigation
- [ ] Empty states shown correctly
- [ ] TypeScript passes

---

### TASK-013: Build Request Management Screen (Owner)

**Title:** Create trip join request management screen for trip owners

**Description:**
Create `apps/mobile/app/(app)/trips/[tripId]/requests.tsx` — the owner's view for managing all join requests for a specific trip.

**Affected files:**
- `apps/mobile/app/(app)/trips/[tripId]/requests.tsx` (create)
- `apps/mobile/app/(app)/trips/[tripId]/index.tsx` (add "Manage Requests (N)" button if owner)

**Acceptance criteria:**
- Filter tabs: Pending | Approved | All
- Each pending request shows: avatar, name, city, message preview, "Approve" / "Reject" buttons
- Approve confirmation dialog (matches UX doc)
- Reject is quick (no confirmation modal)
- Approved tab shows current members
- Badge shows count of pending requests
- TypeScript passes

**Dependencies:** TASK-010, TASK-012

**Test checklist:**
- [ ] Pending tab shows pending requests
- [ ] Approve shows confirmation, then updates state
- [ ] Reject updates status immediately
- [ ] Approved member visible in trip members list
- [ ] Count badge on button reflects pending count
- [ ] TypeScript passes

---

### TASK-014: Join Request Notifications

**Title:** Add local notifications for join request events

**Description:**
Extend the local notification service to fire notifications for join request events.

**Events:**
- Owner receives notification when a request arrives (Firestore listener → local notification)
- Requestor receives notification when request is approved
- Requestor receives notification when request is rejected

**Affected files:**
- `apps/mobile/services/notificationService.ts` (extend or create)
- `apps/mobile/hooks/useTripJoinRequest.ts` (wire notifications)
- `apps/mobile/app/(app)/profile/join-requests.tsx` (listener triggers notification)

**Implementation note:**
Use `expo-notifications` `scheduleNotificationAsync` with `trigger: null` for immediate delivery. The listener fires when a Firestore document changes — on change, check if notification should fire (e.g., status changed to 'approved') and trigger local notification.

**Limitation:** Only fires if app is in foreground or background. Not fired if app is killed. FCM needed for reliable delivery (future).

**Acceptance criteria:**
- Owner gets notification when new pending request arrives
- Requestor gets notification when status changes to approved/rejected
- Notifications do not fire if user is currently on the relevant screen
- TypeScript passes

**Dependencies:** TASK-012, TASK-013

**Test checklist:**
- [ ] Notification fires on new pending request
- [ ] Notification fires on status change to approved
- [ ] Notification fires on status change to rejected
- [ ] Tapping notification navigates to relevant screen
- [ ] TypeScript passes

---

## PHASE 4 — Travel Groups Discovery

---

### TASK-015: Add Travel Group Firestore Schema and Functions

**Title:** Add travel groups collection schema and CRUD functions

**Description:**
Extend `packages/firebase/src/firestore.ts` with all travel group functions.

**Functions:**
- `createTravelGroup(uid, data): Promise<string>` — returns groupId
- `updateTravelGroup(groupId, uid, data): Promise<void>`
- `deleteTravelGroup(groupId, uid): Promise<void>`
- `getTravelGroup(groupId): Promise<TravelGroup | null>`
- `subscribePublicTravelGroups(filters): Unsubscribe`
- `subscribeGroupMembers(groupId): Unsubscribe`
- `submitGroupJoinRequest(groupId, requestorUid, message): Promise<void>`
- `approveGroupJoinRequest(requestId, ownerUid): Promise<void>`
- `rejectGroupJoinRequest(requestId, ownerUid): Promise<void>`
- `removeGroupMember(groupId, uid, ownerUid): Promise<void>`
- `leaveGroup(groupId, uid): Promise<void>`

**Affected files:**
- `packages/firebase/src/firestore.ts` (extend)
- `packages/firebase/src/index.ts` (export)
- `firestore.rules` (travelGroups + groupJoinRequests rules)
- `firestore.indexes.json` (travel groups indexes)

**Acceptance criteria:**
- Group creation creates owner member document
- Approval creates member document + increments memberCount
- memberCount cannot exceed capacity (client-side guard)
- Leaving removes member document + decrements memberCount
- TypeScript passes

**Dependencies:** TASK-001

**Test checklist:**
- [ ] Create group creates owner member
- [ ] Approve creates member, increments count
- [ ] Full group prevents new requests (client guard)
- [ ] Leave removes member document
- [ ] TypeScript passes

---

### TASK-016: Add Community Tab to Navigation

**Title:** Add Community tab to bottom navigation

**Description:**
Add a 5th tab to the app's tab bar for community features. This tab houses travel groups, nearby travelers (V1.2), and activity feed (V1.2).

**Affected files:**
- `apps/mobile/app/(app)/(tabs)/_layout.tsx` (add tab)
- `apps/mobile/app/(app)/community/index.tsx` (create — community hub)
- Tab icon: use `people-outline` / `people` (Ionicons)

**Community hub screen sections:**
- Travel Groups (primary for V1.1)
- Browse Travelers (greyed out placeholder for V1.2)
- Activity Feed (greyed out placeholder for V1.2)

**Acceptance criteria:**
- Community tab renders without errors
- Icon is people/community themed
- Hub shows Groups section as primary content
- Placeholder sections shown but not tappable (V1.2 features)
- TypeScript passes

**Dependencies:** None (navigation change only)

**Test checklist:**
- [ ] Tab renders
- [ ] Navigates to correct screens
- [ ] Icon changes to filled on active
- [ ] TypeScript passes

---

### TASK-017: Build Travel Groups Discovery and Detail Screens

**Title:** Create group list, detail, and create screens

**Description:**
Build all UI for travel group discovery.

**Screens:**
1. `apps/mobile/app/(app)/community/groups/index.tsx` — list
2. `apps/mobile/app/(app)/community/groups/[groupId].tsx` — detail
3. `apps/mobile/app/(app)/community/groups/create.tsx` — create form
4. `apps/mobile/app/(app)/community/groups/[groupId]/requests.tsx` — owner request management (reuse pattern from TASK-013)

**Components:**
- `apps/mobile/components/community/TravelGroupCard.tsx` — list item
- `apps/mobile/components/community/CreateGroupForm.tsx` — form

**Acceptance criteria:**
- Groups list paginates, filters by destination and "open to join"
- Group detail shows full group info, member list, join button
- Create form validates all required fields
- Join button shows correct state (same pattern as trip join)
- After join approval, "Open Chat" button navigates to group chat
- TypeScript passes

**Dependencies:** TASK-015, TASK-016

**Test checklist:**
- [ ] Groups list loads and paginates
- [ ] Create group saves to Firestore
- [ ] Join request flow works (same as trip join)
- [ ] After approval, member appears in member list
- [ ] Group chat accessible after approval
- [ ] Owner can remove members
- [ ] Member can leave group
- [ ] TypeScript passes

---

## PHASE 5 — Nearby Travelers

---

### TASK-018: Traveler Discovery Opt-in and Schema

**Title:** Add opt-in traveler discovery toggle and nearbyTravelers collection

**Description:**
Add the opt-in toggle to Privacy Settings. Write/delete nearbyTravelers document based on toggle.

**New Firestore functions:**
- `upsertNearbyTraveler(uid, data): Promise<void>`
- `deleteNearbyTraveler(uid): Promise<void>`
- `subscribeNearbyTravelers(city): Unsubscribe`
- `subscribeDestinationTravelers(destination): Unsubscribe`

**Affected files:**
- `packages/firebase/src/firestore.ts` (extend)
- `apps/mobile/app/(app)/profile/privacy.tsx` (add discovery toggle — was placeholder in TASK-005)
- `apps/mobile/app/(app)/profile/edit.tsx` (add current city + current destination fields)
- `firestore.rules` (nearbyTravelers rules)
- `firestore.indexes.json` (nearbyTravelers indexes)

**Acceptance criteria:**
- Opt-in creates nearbyTravelers/{uid} document
- Opt-out deletes nearbyTravelers/{uid} document
- Account deletion deletes nearbyTravelers/{uid} (hook into existing deleteAllUserData)
- No exact coordinates stored — city text only
- TypeScript passes

**Dependencies:** TASK-005

**Test checklist:**
- [ ] Opt-in creates document
- [ ] Opt-out deletes document
- [ ] Account deletion removes document
- [ ] City text stored, no coordinates

---

### TASK-019: Build Discover Travelers Screen

**Title:** Create Nearby Travelers screen with city-based filtering

**Description:**
Build the traveler discovery UI under the Community tab.

**Screens:**
- `apps/mobile/app/(app)/community/travelers/index.tsx`

**Components:**
- `apps/mobile/components/community/TravelerCard.tsx`
- `apps/mobile/components/community/TravelerFilters.tsx`
- `apps/mobile/components/community/DiscoveryOptInPrompt.tsx`

**Acceptance criteria:**
- Shows opt-in prompt on first visit
- After opt-in, shows travelers in user's current city
- Destination input to search other cities
- Tapping traveler card navigates to their public profile
- Blocked users not shown (client-side filter)
- TypeScript passes

**Dependencies:** TASK-018, TASK-006

**Test checklist:**
- [ ] Opt-in prompt shows on first visit
- [ ] Travelers load by city
- [ ] Blocked users filtered from list
- [ ] Traveler card navigates to public profile
- [ ] Empty state shown when no travelers in city

---

## PHASE 6 — Activity Feed

---

### TASK-020: Activity Feed Collection and Write Functions

**Title:** Add activityFeed Firestore functions and integrate feed writes

**Description:**
Add feed write functions and integrate them into existing actions (trip publish, group create, join group, add memory).

**New functions:**
- `addFeedItem(actorUid, type, targetId, targetType, targetTitle, targetDestination): Promise<void>`
- `subscribeActivityFeed(limit): Unsubscribe`
- `deleteFeedItem(feedItemId, actorUid): Promise<void>` — called when trip/group deleted

**Integrate writes into:**
- `setTripVisibility` — call `addFeedItem` when trip set to public
- `createTravelGroup` — call `addFeedItem` on group creation
- `approveGroupJoinRequest` — call `addFeedItem(requestorUid, 'joined_group', ...)`

**Affected files:**
- `packages/firebase/src/firestore.ts` (extend)
- `firestore.rules` (activityFeed rules)
- `firestore.indexes.json` (activityFeed indexes)

**Acceptance criteria:**
- Feed items created atomically with source actions where possible
- Only public actors create feed items (check profileVisibility before write)
- Feed items limited to 30 per query
- Old feed items (>30 days) not shown (client-side filter on createdAt)
- TypeScript passes

**Dependencies:** TASK-001

**Test checklist:**
- [ ] Setting trip to public creates feed item
- [ ] Creating group creates feed item
- [ ] Joining group creates feed item for joiner
- [ ] Private profile users do not create feed items
- [ ] Feed query returns max 30 items

---

### TASK-021: Build Activity Feed Screen

**Title:** Create Activity Feed screen under Community tab

**Description:**
Build the feed UI that shows public travel activity.

**Screens:**
- `apps/mobile/app/(app)/community/feed/index.tsx`

**Components:**
- `apps/mobile/components/community/FeedItem.tsx` — renders each feed item type

**Acceptance criteria:**
- Feed loads and shows real-time updates
- Tapping feed item navigates to trip/group/memory
- Tapping actor avatar navigates to public profile
- Empty state shown when no activity
- Blocked user activity not shown (client-side filter)
- 5-minute client cache to reduce reads
- TypeScript passes

**Dependencies:** TASK-020

**Test checklist:**
- [ ] Feed renders correctly for each item type
- [ ] Navigation from feed item works
- [ ] Blocked users filtered
- [ ] Empty state shown
- [ ] TypeScript passes

---

## PHASE 7 — Safety / Trust Hardening

---

### TASK-022: Implement Block User Flow

**Title:** Add block/unblock user functionality

**Description:**
Add block functionality with Firestore storage and client-side filtering across all social screens.

**New functions:**
- `blockUser(blockerUid, blockedUid): Promise<void>`
- `unblockUser(blockerUid, blockedUid): Promise<void>`
- `subscribeBlockList(uid): Unsubscribe`
- `isBlocked(blockerUid, blockedUid): Promise<boolean>`

**Block list integration:**
- Public profile screen: show block in 3-dot menu
- Block list: filter from public trips, groups, travelers, feed (all social queries)
- Existing chats: muted after block

**Affected files:**
- `packages/firebase/src/firestore.ts` (extend)
- `apps/mobile/app/(app)/community/profile/[uid].tsx` (add block option)
- `apps/mobile/app/(app)/profile/privacy.tsx` (show blocked users list)
- `apps/mobile/hooks/useBlock.ts` (create — provides block list context)
- `apps/mobile/stores/blockStore.ts` (create — cached block list)
- `firestore.rules` (blocks rules)

**Acceptance criteria:**
- Block creates `blocks/{uid}/blocked/{blockedUid}` document
- Unblock deletes document
- Block list loaded once per session, cached in Zustand store
- All social lists filter blocked users client-side using cached list
- Public profile shows "You have blocked this user" state
- Blocked user's trips/groups not shown in discovery (client filter)
- TypeScript passes

**Dependencies:** TASK-006

**Test checklist:**
- [ ] Block creates Firestore document
- [ ] Blocked user removed from social lists
- [ ] Public profile shows blocked state
- [ ] Unblock restores visibility
- [ ] Block list persists across app restarts (Firestore listener)
- [ ] TypeScript passes

---

### TASK-023: Implement Report Flow

**Title:** Add universal report flow for users, trips, groups, and messages

**Description:**
Create `ReportModal` component usable from any public content.

**New function:**
- `reportContent(reporterUid, targetType, targetId, reason, details): Promise<void>`

**Affected files:**
- `packages/firebase/src/firestore.ts` (extend)
- `apps/mobile/components/community/ReportModal.tsx` (create)
- `apps/mobile/hooks/useReport.ts` (create)
- `apps/mobile/app/(app)/community/profile/[uid].tsx` (add report)
- `apps/mobile/app/(app)/discover/trips/[tripId].tsx` (add report)
- `apps/mobile/app/(app)/community/groups/[groupId].tsx` (add report)
- `firestore.rules` (reports: create = authenticated, read = never)

**Rate limiting:**
- Max 5 reports per user per day (AsyncStorage counter, like Foursquare)
- If exceeded: "You've submitted several reports today. We'll review them shortly."

**Acceptance criteria:**
- Report modal has step 1 (what) + step 2 (reason) + step 3 (details)
- Report creates Firestore document
- Reporter cannot read reports collection
- Success confirmation shown
- Rate limited at 5/day client-side
- TypeScript passes

**Dependencies:** TASK-001

**Test checklist:**
- [ ] Report creates Firestore document
- [ ] Report document contains reporterUid, targetType, targetId, reason
- [ ] Reporter cannot read their own reports
- [ ] Rate limit prevents > 5 reports/day
- [ ] Success state shown after submission
- [ ] TypeScript passes

---

### TASK-024: Finalize Account Deletion with Community Data

**Title:** Ensure account deletion removes all community data

**Description:**
Update the existing `deleteAllUserData` function in `packages/firebase/src/firestore.ts` to also remove:
- `publicProfiles/{uid}`
- `nearbyTravelers/{uid}` (if exists)
- All pending `tripJoinRequests` where requestorUid == uid (cancel, not delete)
- All pending `groupJoinRequests` where requestorUid == uid
- `activityFeed` items where actorUid == uid

Note: Cannot delete other users' trip/group documents (they may have other members). Only delete/cancel the requesting user's footprint.

**Affected files:**
- `packages/firebase/src/firestore.ts` (extend deleteAllUserData)

**Acceptance criteria:**
- publicProfiles deleted
- nearbyTravelers deleted
- Own pending join requests cancelled (status: 'cancelled', not deleted)
- Own feed items deleted
- Existing group/chat memberships cleaned up (member documents removed)
- TypeScript passes

**Dependencies:** TASK-002, TASK-010, TASK-015, TASK-018, TASK-020

**Test checklist:**
- [ ] After deletion: publicProfiles/{uid} does not exist
- [ ] After deletion: nearbyTravelers/{uid} does not exist
- [ ] After deletion: pending join requests show 'cancelled'
- [ ] After deletion: feed items removed
- [ ] TypeScript passes

---

## PHASE 8 — Final QA + Store Review

---

### TASK-025: Update Privacy Policy for Community Features

**Title:** Update in-app privacy policy to cover community features

**Description:**
Update `apps/mobile/app/(app)/profile/privacy.tsx` and the privacy policy screen content to cover:
- Public profiles and what data is shared
- Join requests and how they work
- Travel groups and chat access
- Nearby travelers and city-only location
- Block and report functionality
- Data deletion covering community data

**Affected files:**
- `apps/mobile/app/privacy.tsx` (or wherever privacy screen is)

**Acceptance criteria:**
- Privacy policy mentions all community features
- Data deletion process described (Settings → Delete Account)
- City-only location explicitly stated (no GPS)
- Last updated date is current
- No broken links
- TypeScript passes

**Dependencies:** All Phase 1–7 tasks complete

---

### TASK-026: Deploy Firestore Rules and Indexes for Community

**Title:** Deploy all community Firestore rules and indexes to Firebase

**Description:**
Final deployment of all Firestore rules and indexes added across Phases 1–7.

**Commands:**
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

**Verify:**
- All new collections have correct read/write permissions
- Indexes deployed without errors
- Test authenticated read of publicProfiles
- Test unauthenticated read rejected
- Test owner-only write enforced
- Test join request rules (cannot approve own request)

**Affected files:**
- `firestore.rules`
- `firestore.indexes.json`

**Acceptance criteria:**
- All rules deploy without Firebase console errors
- All indexes build successfully (may take a few minutes)
- Manual tests pass for key rules (see Test checklist)

**Dependencies:** All tasks complete

**Test checklist:**
- [ ] publicProfiles readable by authenticated user
- [ ] publicProfiles not writable by non-owner
- [ ] tripJoinRequests not creatable for own trip
- [ ] reports not readable by any client
- [ ] blocks readable only by owner
- [ ] Indexes show as "Enabled" in Firebase Console

---

### TASK-027: Update App Store Metadata for Community Features

**Title:** Update App Store description and metadata for community features

**Description:**
Update store metadata to accurately describe social features without triggering App Store review issues.

**Key description changes:**
- Add: "Join public trips and travel groups after owner approval"
- Add: "Connect with travelers visiting the same destinations"
- Add: "All connections require host approval — your safety first"
- Do NOT say: "Find nearby strangers", "Meet people near you", "GPS-based discovery"
- Update keywords to include: travel groups, trip planning, solo travel community

**Affected files:**
- `apps/mobile/store-assets/metadata/en-US/description.txt`
- `apps/mobile/store-assets/metadata/en-US/release_notes.txt`
- `apps/mobile/store-assets/metadata/en-US/keywords.txt`

**App Review notes to prepare:**
- Explain join-request-approval model for safety
- Explain block and report mechanisms
- Confirm 17+ age rating
- Confirm no GPS data stored
- Confirm user-generated content has reporting mechanism

**Acceptance criteria:**
- Description accurately reflects V1.0 community features
- No GPS/location wording that could flag review
- Release notes mention community features
- Age rating confirmed: 17+
- TypeScript passes (no code changes)

**Dependencies:** TASK-025

---

### TASK-028: End-to-End Community Feature Testing

**Title:** Full end-to-end test of all V1.0 community flows

**Description:**
Manual testing checklist covering all V1.0 community features with two test accounts.

**Test accounts needed:** Account A (trip owner) + Account B (traveler)

**Flow 1 — Profile:**
- [ ] A sets profile to public: B can see A's profile
- [ ] A sets profile to private: B sees restricted state
- [ ] A blocks B: B cannot see A's profile, trips, or send requests

**Flow 2 — Public Trips:**
- [ ] A creates trip, sets to public: visible in discover
- [ ] B sees A's trip in discover, views detail
- [ ] B saves A's trip
- [ ] A sets trip to private: disappears from discover

**Flow 3 — Join Requests:**
- [ ] B requests to join A's trip with message
- [ ] A receives notification
- [ ] A approves B's request
- [ ] B receives notification
- [ ] B can see A's trip in their trips
- [ ] B has access to trip group chat

**Flow 4 — Rejection:**
- [ ] B requests trip C, C rejects
- [ ] B sees rejected status
- [ ] B cannot resubmit for 24h (client guard)

**Flow 5 — Safety:**
- [ ] B reports A's profile: creates Firestore report document
- [ ] A reports B's trip: creates Firestore report document
- [ ] 6th report blocked by rate limit

**Acceptance criteria:**
- All flows complete without errors
- Firestore documents correctly created/updated
- Notifications fire for relevant events
- TypeScript passes
- No console errors in Metro

---

## Appendix: Task Dependency Graph

```
TASK-001 (types)
    ↓
TASK-002 (firestore functions) → TASK-003 (rules)
    ↓
TASK-004 (edit profile) → TASK-005 (privacy) → TASK-006 (public profile)
                         → TASK-007 (safety guidelines)

TASK-008 (trip visibility) → TASK-009 (public trips discovery)
    ↓
TASK-010 (join request functions) → TASK-011 (join modal)
                                   → TASK-012 (my requests screen)
                                   → TASK-013 (owner requests screen)
                                   → TASK-014 (notifications)

TASK-015 (group functions) → TASK-016 (community tab) → TASK-017 (group screens)

TASK-018 (nearby opt-in) → TASK-019 (nearby screen)

TASK-020 (feed functions) → TASK-021 (feed screen)

TASK-022 (block) → TASK-023 (report) → TASK-024 (account deletion update)

TASK-025 → TASK-026 → TASK-027 → TASK-028 (final QA)
```

---

## V1.0 Required Tasks (Before Store Submission)

**Must complete before first App Store submission:**

| Task | Phase | Description |
|---|---|---|
| TASK-001 | 1 | Community types |
| TASK-002 | 1 | Firestore functions (profile) |
| TASK-003 | 1 | Firestore rules (Phase 1) |
| TASK-004 | 1 | Extended edit profile |
| TASK-005 | 1 | Privacy settings screen |
| TASK-006 | 1 | Public profile screen |
| TASK-007 | 1 | Safety guidelines screen |
| TASK-008 | 2 | Trip visibility schema |
| TASK-009 | 2 | Public trips discovery |
| TASK-010 | 3 | Join request functions |
| TASK-011 | 3 | Join request modal |
| TASK-012 | 3 | My requests screen |
| TASK-013 | 3 | Owner request management |
| TASK-014 | 3 | Notifications |
| TASK-022 | 7 | Block user |
| TASK-023 | 7 | Report flow |
| TASK-024 | 7 | Account deletion (community) |
| TASK-025 | 8 | Privacy policy update |
| TASK-026 | 8 | Deploy rules and indexes |
| TASK-027 | 8 | Store metadata update |
| TASK-028 | 8 | End-to-end testing |

**Defer to V1.1+ (post-launch):**
TASK-015 through TASK-021 (Groups, Nearby, Feed)
