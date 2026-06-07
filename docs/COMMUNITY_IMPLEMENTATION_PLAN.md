# SoloTravelSoul — Community Implementation Plan

**Status:** Design / Pre-implementation  
**Date:** May 2026  
**Version:** 1.0

---

## Phase Overview

| Phase | Name | Required for V1.0 | Effort | Risk |
|---|---|---|---|---|
| 1 | Traveler Profile Upgrade | ✅ Yes | Medium | Low |
| 2 | Public Trips + Visibility | ✅ Yes | Medium | Low |
| 3 | Trip Join Requests | ✅ Yes | Medium | Medium |
| 4 | Travel Groups Discovery | No — V1.1 | High | Medium |
| 5 | Nearby Travelers | No — V1.2 | Medium | Medium |
| 6 | Activity Feed | No — V1.2 | Medium | Medium |
| 7 | Safety / Trust Hardening | ✅ Partial in V1.0 | Low | Low |
| 8 | Final QA + Store Review | ✅ Yes | Medium | High |

---

## Phase 1 — Traveler Profile Upgrade

**Goal:** Enrich the user profile with travel identity fields. Give users a meaningful public presence before social features launch. Required before App Store submission because a social platform needs complete profiles.

**Backend schema changes:**
- Add fields to `users/{uid}`: `bio`, `currentCity`, `homeCountry`, `languages`, `travelStyles`, `countriesVisited`, `dreamDestinations`, `interests`, `profileVisibility`, `showInNearbyTravelers`
- Create `publicProfiles/{uid}` collection
- All fields additive — no migration needed

**Firestore rules changes:**
- `publicProfiles/{uid}`: read = authenticated, write = uid == auth.uid
- `users/{uid}`: no change (already owner-only write)

**UI screens:**
1. Edit Profile (extended) — new sections
2. Privacy Settings screen (new)
3. Public Profile screen (new)
4. Safety Guidelines screen (new)

**Files likely changed:**
```
packages/shared/src/types/Community.ts          (new)
packages/firebase/src/firestore.ts              (new getUserProfile, updatePublicProfile, deletePublicProfile)
packages/firebase/src/index.ts                  (export new functions)
apps/mobile/app/(app)/profile/index.tsx         (add block/report actions)
apps/mobile/app/(app)/profile/edit.tsx          (extend with new sections)
apps/mobile/app/(app)/profile/privacy.tsx       (new screen)
apps/mobile/app/(app)/profile/safety.tsx        (new screen)
apps/mobile/app/(app)/community/profile/[uid].tsx (new screen)
apps/mobile/stores/authStore.ts                 (extend UserProfile type)
apps/mobile/components/ui/CountryPicker.tsx     (new reusable component)
apps/mobile/components/ui/MultiSelectChips.tsx  (new reusable component)
firestore.rules                                 (add publicProfiles rules)
```

**Tests:**
- Profile fields save and reload correctly
- Private profile not readable by other users
- Public profile readable by other users
- Switching to private deletes publicProfiles/{uid}
- TypeScript passes

**Risk level:** Low — purely additive, no breaking changes  
**Estimated effort:** 3–5 days

---

## Phase 2 — Public Trips + Visibility

**Goal:** Allow trip owners to make trips discoverable. Build the Public Trips discovery screen so travelers can browse destinations.

**Backend schema changes:**
- Add to `trips/{tripId}`: `visibility`, `description`, `tags`, `maxMembers`, `memberCount`, `isAcceptingMembers`, `coverPhotoURL`
- Create `publicTrips/{tripId}` collection
- Create `trips/{tripId}/members/{uid}` subcollection (owner created on trip creation)
- Update `firestore.indexes.json` with publicTrips indexes

**Firestore rules changes:**
- `publicTrips/{tripId}`: read = authenticated, write = ownerUid == auth.uid
- `trips/{tripId}/members/{uid}`: read = member of trip, write = trip owner

**UI screens:**
1. Trip Detail → Visibility Settings section (extends existing `trips/:id/edit`)
2. Public Trips Discovery screen (new section in Discover tab)
3. Public Trip Detail screen (new)

**Files likely changed:**
```
packages/shared/src/types/Community.ts          (PublicTrip, TripVisibility types)
packages/firebase/src/firestore.ts              (createPublicTrip, updatePublicTrip, deletePublicTrip, subscribePublicTrips, getPublicTrip)
apps/mobile/app/(app)/trips/[tripId]/edit.tsx   (new Visibility section)
apps/mobile/app/(app)/discover/index.tsx        (add Explore tab or section)
apps/mobile/app/(app)/discover/trips/index.tsx  (new — public trips list)
apps/mobile/app/(app)/discover/trips/[tripId].tsx (new — public trip detail)
apps/mobile/components/trips/TripVisibilitySettings.tsx (new)
apps/mobile/components/discover/PublicTripCard.tsx (new)
firestore.rules                                 (publicTrips + members rules)
firestore.indexes.json                          (new indexes)
```

**Tests:**
- Setting trip to public creates publicTrips document
- Setting trip to private deletes publicTrips document
- Deleting trip deletes publicTrips document
- Public trips list paginates correctly
- Non-owner cannot edit public trip document
- TypeScript passes

**Risk level:** Low  
**Estimated effort:** 3–4 days

---

## Phase 3 — Trip Join Requests

**Goal:** Allow travelers to request to join public trips. Build owner approval flow. Approved members gain trip access. This is the core social primitive of the platform.

**Backend schema changes:**
- Create `tripJoinRequests/{requestId}` collection
- Firestore rules for request create/read/update
- New composite indexes for join requests

**Firestore rules changes:**
- `tripJoinRequests`:
  - create: authenticated, not own trip, no existing pending request
  - read: ownerUid or requestorUid
  - update: owner (approve/reject) or requestor (cancel)

**UI screens:**
1. Join Request Modal (new — overlaid on Public Trip Detail)
2. My Join Requests screen (new — under Profile tab)
3. Request Management screen (new — under Trip settings, owner only)
4. Notifications for request received / approved / rejected (local)

**Files likely changed:**
```
packages/shared/src/types/Community.ts          (TripJoinRequest, RequestStatus types)
packages/firebase/src/firestore.ts              (submitTripJoinRequest, cancelTripJoinRequest, subscribeTripJoinRequests, updateTripJoinRequest, approveTripJoinRequest, rejectTripJoinRequest)
apps/mobile/app/(app)/discover/trips/[tripId].tsx (add join button, request state)
apps/mobile/app/(app)/profile/join-requests.tsx (new screen)
apps/mobile/app/(app)/trips/[tripId]/requests.tsx (new — owner request management)
apps/mobile/components/community/JoinRequestModal.tsx (new)
apps/mobile/components/community/JoinRequestCard.tsx (new)
apps/mobile/hooks/useTripJoinRequest.ts         (new custom hook)
apps/mobile/services/notificationService.ts     (extend with community events)
firestore.rules                                 (tripJoinRequests rules)
firestore.indexes.json                          (new indexes)
```

**Join request approval side effects:**
1. `tripJoinRequests/{id}` status → 'approved'
2. `trips/{tripId}/members/{uid}` document created
3. `trips/{tripId}.memberCount` incremented (batch write)
4. `publicTrips/{tripId}.memberCount` incremented (batch write)
5. Local notification sent to requestor
6. Existing chat group opened to new member (or created if doesn't exist)

**Tests:**
- Cannot request own trip
- Cannot submit duplicate request when pending exists
- Owner sees request, can approve
- Approved user sees trip in their trips list
- Approved user has chat access
- Rejected user sees rejected status
- memberCount increments correctly
- Rate limit: 3 requests per day enforced client-side
- TypeScript passes

**Risk level:** Medium — batch writes and side effects require careful ordering  
**Estimated effort:** 4–6 days

---

## Phase 4 — Travel Groups Discovery

**Goal:** Launch dedicated travel groups separate from trips. Enable community-building around destinations.

**Backend schema changes:**
- Create `travelGroups/{groupId}` collection
- Create `travelGroups/{groupId}/members/{uid}` subcollection
- Create `groupJoinRequests/{requestId}` collection
- New composite indexes

**Firestore rules changes:**
- `travelGroups`: read = public if visibility='public', write = owner
- `travelGroups/members`: read = authenticated, write = owner via batch
- `groupJoinRequests`: same pattern as tripJoinRequests

**UI screens:**
1. Community tab (new tab added to navigation)
2. Travel Groups discovery list (new)
3. Travel Group Detail (new)
4. Create Group screen (new)
5. Group Join Request Modal (new, reuse JoinRequestModal with different props)
6. Group Request Management (new, reuse pattern from Phase 3)

**Files likely changed:**
```
packages/shared/src/types/Community.ts          (TravelGroup, GroupJoinRequest types)
packages/firebase/src/firestore.ts              (group CRUD functions)
apps/mobile/app/(app)/(tabs)/_layout.tsx        (add Community tab)
apps/mobile/app/(app)/community/index.tsx       (community hub screen)
apps/mobile/app/(app)/community/groups/index.tsx (group list)
apps/mobile/app/(app)/community/groups/[groupId].tsx (group detail)
apps/mobile/app/(app)/community/groups/create.tsx (create group)
apps/mobile/app/(app)/community/groups/[groupId]/requests.tsx
apps/mobile/components/community/TravelGroupCard.tsx (new)
apps/mobile/components/community/CreateGroupForm.tsx (new)
apps/mobile/hooks/useTravelGroup.ts (new)
firestore.rules
firestore.indexes.json
```

**Group + Chat integration:**
When first member approved: create `groups/{chatGroupId}` (existing chat collection) and link `travelGroups/{groupId}.chatGroupId`. Subsequent approved members added to chat group.

**Tests:**
- Create group appears in public list
- Join request flow works
- Approved member sees group chat
- Owner can remove member
- Member can leave group
- Capacity enforcement (cannot join full group)
- TypeScript passes

**Risk level:** Medium — navigation change, chat integration  
**Estimated effort:** 5–7 days

---

## Phase 5 — Nearby Travelers

**Goal:** City-based traveler discovery for users who opt in. No GPS sharing.

**Backend schema changes:**
- Create `nearbyTravelers/{uid}` collection
- New composite indexes (currentCity, destination)
- Update `users/{uid}` with `showInNearbyTravelers`, `currentDestination`, `destinationStartDate`, `destinationEndDate`

**Firestore rules changes:**
- `nearbyTravelers`: read = authenticated, write = uid == auth.uid

**UI screens:**
1. Discover Travelers screen (new, under Community tab)
2. Opt-in prompt (modal, first visit)
3. Traveler filters panel

**Files likely changed:**
```
packages/firebase/src/firestore.ts              (upsertNearbyTraveler, deleteNearbyTraveler, subscribeNearbyTravelers)
apps/mobile/app/(app)/community/travelers/index.tsx (new)
apps/mobile/components/community/TravelerCard.tsx (new)
apps/mobile/components/community/TravelerFilters.tsx (new)
apps/mobile/app/(app)/profile/privacy.tsx       (add discovery toggle)
```

**Tests:**
- Opt-in creates nearbyTravelers document
- Opt-out deletes nearbyTravelers document
- Account deletion deletes nearbyTravelers document
- City filter returns correct travelers
- Blocked users do not appear
- TypeScript passes

**Risk level:** Medium — privacy-sensitive feature requires careful App Store description  
**Estimated effort:** 3–4 days

---

## Phase 6 — Activity Feed

**Goal:** Global public activity feed showing trip creation, group creation, memory posts, and join events.

**Backend schema changes:**
- Create `activityFeed/{feedItemId}` collection
- Feed items written by client on relevant actions
- New composite index (visibility + createdAt)

**Firestore rules changes:**
- `activityFeed`: read = authenticated, create = actorUid == auth.uid, update/delete = actorUid == auth.uid

**UI screens:**
1. Activity Feed screen (new, under Community tab)
2. Feed item detail (navigate to trip/group/memory)

**Feed writes triggered by:**
- Trip set to public → `trip_created` feed item
- User creates travel group → `group_created` feed item
- User joins group → `joined_group` feed item
- User adds memory → `memory_added` feed item (if profile public)

**Files likely changed:**
```
packages/shared/src/types/Community.ts          (FeedItem, FeedItemType types)
packages/firebase/src/firestore.ts              (addFeedItem, subscribeActivityFeed)
apps/mobile/app/(app)/community/feed/index.tsx  (new)
apps/mobile/components/community/FeedItem.tsx   (new)
apps/mobile/app/(app)/trips/[tripId]/edit.tsx   (write feed item on visibility change)
apps/mobile/app/(app)/community/groups/create.tsx (write feed item on group create)
apps/mobile/app/(app)/memories/add.tsx          (write feed item on memory add)
```

**Tests:**
- Creating public trip writes feed item
- Feed item appears in feed screen
- Private profile user's feed items not shown
- 30-item limit enforced
- TypeScript passes

**Risk level:** Low — additive writes, simple queries  
**Estimated effort:** 3–4 days

---

## Phase 7 — Safety / Trust Hardening

**Goal:** Complete block, report, and moderation flows across all V1 features.

**Note:** Basic block/report must exist in V1.0. Full hardening is this phase.

**Backend schema changes:**
- Create `blocks/{uid}/blocked/{blockedUid}` collection
- Create `reports/{reportId}` collection
- Update Firestore rules for block awareness

**UI screens:**
1. Block confirmation flow (integrated into profile 3-dot menu)
2. Block list management (profile/privacy → Blocked Users)
3. Report flow (universal — profile, trip, group, message)
4. Safety & Guidelines screen (already in Phase 1, finalize here)
5. Report success confirmation

**Files likely changed:**
```
packages/firebase/src/firestore.ts              (blockUser, unblockUser, subscribeBlockList, reportContent)
apps/mobile/app/(app)/profile/privacy.tsx       (block list section)
apps/mobile/components/community/ReportModal.tsx (new — universal)
apps/mobile/components/community/BlockConfirmation.tsx (new)
apps/mobile/hooks/useBlock.ts                   (new)
apps/mobile/hooks/useReport.ts                  (new)
firestore.rules                                 (blocks + reports rules)
```

**Rate limiting (client-side):**
- Max 3 join requests per day per user (enforced before API call)
- Max 5 reports per day per user (AsyncStorage counter, like Foursquare daily limit)

**Tests:**
- Blocking user removes them from all lists (client-side filter)
- Blocked user's public profile shows restricted state
- Report submits to Firestore without exposing reporter
- Cannot report more than 5 times per day
- TypeScript passes

**Risk level:** Low  
**Estimated effort:** 2–3 days

---

## Phase 8 — Final QA + Store Review Prep

**Goal:** Ensure all V1.0 community features are stable, the app passes App Store review, and Firestore rules are audited.

**Checklist:**
- [ ] TypeScript passes with 0 errors
- [ ] Firestore rules deployed and tested
- [ ] Firestore indexes deployed
- [ ] Privacy policy updated to cover community features
- [ ] App Store description updated (no "GPS sharing", no "find strangers")
- [ ] Age rating confirmed: 17+ (chat + user-generated content)
- [ ] Safety Guidelines screen accessible without login
- [ ] Block and Report flows accessible on all social content
- [ ] Join request approval model documented in store description
- [ ] End-to-end test: user A creates public trip → user B requests → A approves → B is a member → B has chat access
- [ ] End-to-end test: user A blocks user B → B cannot see A's profile
- [ ] End-to-end test: user reports content → report in Firestore → no feedback to reporter beyond confirmation

**App Store review risk items:**
| Risk | Mitigation |
|---|---|
| "Find nearby people" wording | Use "Find travelers going to the same destination" |
| User-generated content (UGC) | Report/block on all UGC — required by App Store |
| Chat between strangers | Only after explicit approval — document in App Review notes |
| Age appropriateness | 17+ rating, no adult content in discovery |
| Location data | Explicitly document city-only, no GPS sharing |

**Files changed:**
- Privacy policy text (`app/(auth)/privacy.tsx`)
- Store metadata (`store-assets/metadata/en-US/description.txt`)
- `store-assets/metadata/en-US/release_notes.txt`
- App Review notes prepared

**Estimated effort:** 2–3 days  
**Risk level:** High (App Store can reject for unexpected reasons)
