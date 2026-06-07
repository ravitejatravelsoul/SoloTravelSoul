# SoloTravelSoul — Community Platform Technical Design

**Status:** Design / Pre-implementation  
**Date:** May 2026  
**Version:** 1.0

---

## 1. Architecture Overview

### Unchanged from current
- Expo React Native (managed workflow)
- Firebase Auth (email/password)
- Firestore (primary database)
- Firebase Storage (photos)
- Local notifications (expo-notifications)
- Monorepo: `apps/mobile`, `packages/firebase`, `packages/shared`

### What changes
- New Firestore collections (no schema-breaking changes to existing)
- Extended `users/{uid}` document fields (additive only)
- New Firestore security rules
- New composite indexes
- New TypeScript types in `packages/shared`
- New screens and navigation (no new npm dependencies for V1)

### What does NOT change
- Firebase project (same project)
- Auth flow
- Existing trip, journal, itinerary, checklist structure
- Chat infrastructure (reused for group chat after approval)
- Notification architecture (local only)
- No Cloud Functions required for V1.0–V1.1

---

## 2. Firestore Schema

### 2.1 Extended: `users/{uid}`

Add these fields to the existing user document (all optional, additive):

```typescript
interface UserProfile {
  // --- existing fields ---
  displayName: string;
  email: string;
  photoURL: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // --- new community fields ---
  bio: string;                        // max 500 chars, empty string default
  currentCity: string;                // "New York, USA" — free text
  homeCountry: string;                // ISO country code e.g. "US"
  languages: string[];                // ["English", "Spanish"]
  travelStyles: TravelStyle[];        // enum list — see shared types
  countriesVisited: string[];         // ISO country codes
  dreamDestinations: string[];        // free text, max 5
  interests: Interest[];              // enum list — see shared types
  profileVisibility: 'public' | 'private';  // default: 'private'
  showInNearbyTravelers: boolean;     // default: false (opt-in)
  currentDestination: string | null;  // active trip destination (for nearby)
  tripCount: number;                  // denormalized, updated on trip create/delete
  memberSince: Timestamp;             // same as createdAt, for display
}
```

**Migration:** All new fields default to empty/false. No migration script needed — reads fail gracefully with `??` defaults in app code.

---

### 2.2 New: `publicProfiles/{uid}`

Denormalized public-facing profile. Written by the client when user saves profile changes AND `profileVisibility === 'public'`. Deleted when profile set to private or account deleted.

```typescript
interface PublicProfile {
  uid: string;
  displayName: string;
  photoURL: string | null;
  bio: string;
  currentCity: string;
  homeCountry: string;
  languages: string[];
  travelStyles: TravelStyle[];
  countriesVisited: string[];         // count only in list view, full in detail
  dreamDestinations: string[];
  interests: Interest[];
  tripCount: number;
  memberSince: Timestamp;
  updatedAt: Timestamp;
  // NOTE: email, exact location, phone — NEVER stored here
}
```

**Why denormalized:** Allows querying public profiles without reading private `users/{uid}` documents. Single-document reads for profile views.

**Write strategy (no Cloud Functions):** Client writes to both `users/{uid}` AND `publicProfiles/{uid}` in a Firestore batch write when saving profile. If profile goes private, client deletes `publicProfiles/{uid}`.

**Risk:** Client could write mismatched data. Acceptable for V1. Add Cloud Function enforcement in V2.

---

### 2.3 Extended: `trips/{tripId}`

Add these fields to existing trip document:

```typescript
interface Trip {
  // --- existing fields ---
  uid: string;         // owner
  title: string;
  destination: string;
  startDate: Timestamp;
  endDate: Timestamp;
  // ...

  // --- new community fields ---
  visibility: 'private' | 'public';  // default: 'private'
  description: string;               // public description, max 1000 chars
  tags: string[];                    // ["beach", "budget", "solo"]
  maxMembers: number | null;         // null = no limit
  memberCount: number;               // denormalized (owner counts as 1)
  isAcceptingMembers: boolean;       // owner can close requests without making trip private
  coverPhotoURL: string | null;      // optional hero image for discovery
}
```

---

### 2.4 New: `publicTrips/{tripId}`

Denormalized for Discover tab. Written by client when trip is set to public. Deleted when trip goes private or is deleted.

```typescript
interface PublicTrip {
  tripId: string;
  ownerUid: string;
  ownerName: string;
  ownerPhotoURL: string | null;
  title: string;
  destination: string;
  startDate: Timestamp;
  endDate: Timestamp;
  description: string;
  tags: string[];
  memberCount: number;
  maxMembers: number | null;
  isAcceptingMembers: boolean;
  coverPhotoURL: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexing target:** destination (string prefix search), createdAt (sort), tags (array-contains).

---

### 2.5 New: `trips/{tripId}/members/{uid}`

Subcollection for trip members. Created when owner approves a join request.

```typescript
interface TripMember {
  uid: string;
  displayName: string;
  photoURL: string | null;
  role: 'owner' | 'member';
  joinedAt: Timestamp;
}
```

**Owner document created when trip is created.** Member documents created when join request approved.

---

### 2.6 New: `tripJoinRequests/{requestId}`

Top-level collection. requestId = `${tripId}_${requestorUid}` (prevents duplicate requests).

```typescript
interface TripJoinRequest {
  requestId: string;           // composite key: tripId_uid
  tripId: string;
  tripTitle: string;           // denormalized for display
  tripDestination: string;     // denormalized for display
  ownerUid: string;
  requestorUid: string;
  requestorName: string;
  requestorPhotoURL: string | null;
  requestorBio: string;        // snapshot at request time
  message: string;             // optional, max 300 chars
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes needed:**
- `ownerUid + status + createdAt` — owner inbox
- `requestorUid + status + createdAt` — my requests screen
- `tripId + status` — per-trip request list

---

### 2.7 New: `travelGroups/{groupId}`

Standalone travel groups (separate from chat groups in `groups/{groupId}`).

```typescript
interface TravelGroup {
  groupId: string;
  ownerUid: string;
  ownerName: string;
  ownerPhotoURL: string | null;
  name: string;                  // max 60 chars
  description: string;           // max 1000 chars
  destination: string;
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  capacity: number;              // max members, including owner
  memberCount: number;           // denormalized
  visibility: 'public' | 'private';  // default: 'public'
  tags: string[];
  rules: string;                 // max 500 chars, community guidelines
  chatGroupId: string | null;    // reference to groups/{groupId} for chat, created on first approval
  isAcceptingMembers: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 2.8 New: `travelGroups/{groupId}/members/{uid}`

```typescript
interface GroupMember {
  uid: string;
  displayName: string;
  photoURL: string | null;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Timestamp;
}
```

---

### 2.9 New: `groupJoinRequests/{requestId}`

requestId = `${groupId}_${requestorUid}`

```typescript
interface GroupJoinRequest {
  requestId: string;
  groupId: string;
  groupName: string;             // denormalized
  ownerUid: string;
  requestorUid: string;
  requestorName: string;
  requestorPhotoURL: string | null;
  message: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 2.10 New: `activityFeed/{feedItemId}` (V1.2)

Global feed. feedItemId = auto-generated.

```typescript
interface FeedItem {
  feedItemId: string;
  type: FeedItemType;           // enum
  actorUid: string;
  actorName: string;
  actorPhotoURL: string | null;
  targetId: string;
  targetType: 'trip' | 'group' | 'memory';
  targetTitle: string;
  targetDestination: string | null;
  visibility: 'public';         // only public items in global feed for V1
  createdAt: Timestamp;
}

type FeedItemType =
  | 'trip_created'
  | 'group_created'
  | 'joined_group'
  | 'memory_added'
  | 'place_saved';
```

**Cost note:** Global feed queries with `orderBy('createdAt', 'desc').limit(30)` cost 30 reads per load. With 1,000 DAU this is ~30,000 reads/open. Add client-side cache with 5-minute TTL.

---

### 2.11 New: `blocks/{uid}/blocked/{blockedUid}`

```typescript
interface Block {
  blockedUid: string;
  blockedAt: Timestamp;
}
```

**Used client-side to filter all social queries.** Security rules enforce: blocked users cannot read private profiles, trips, or send requests.

**Limitation:** Rules cannot natively cross-reference blocks in all queries (complex). Client-side filtering supplements rules for feed/discovery. See rules strategy.

---

### 2.12 New: `reports/{reportId}`

reportId = auto-generated.

```typescript
interface Report {
  reporterUid: string;
  targetType: 'user' | 'trip' | 'group' | 'message';
  targetId: string;
  reason: 'spam' | 'inappropriate' | 'harassment' | 'fake' | 'safety' | 'other';
  details: string;           // max 500 chars
  status: 'pending';         // only pending from client; admin updates via console
  createdAt: Timestamp;
}
```

**Access:** Create = authenticated. Read = never (no client reads; admin uses Firebase Console).

---

### 2.13 New: `nearbyTravelers/{uid}` (V1.2)

Only populated for users who opt in to discovery.

```typescript
interface NearbyTraveler {
  uid: string;
  displayName: string;
  photoURL: string | null;
  currentCity: string;
  travelStyles: TravelStyle[];
  destination: string | null;
  destinationStartDate: Timestamp | null;
  destinationEndDate: Timestamp | null;
  updatedAt: Timestamp;
}
```

**Query pattern:** `where('currentCity', '==', userCity).limit(50)` or `where('destination', '==', searchDestination)`.

---

## 3. Firestore Indexes (New — `firestore.indexes.json`)

```json
{
  "indexes": [
    {
      "collectionGroup": "publicTrips",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "destination", "order": "ASCENDING" },
        { "fieldPath": "createdAt",   "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "publicTrips",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "isAcceptingMembers", "order": "ASCENDING" },
        { "fieldPath": "startDate",          "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "tripJoinRequests",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "ownerUid",   "order": "ASCENDING" },
        { "fieldPath": "status",     "order": "ASCENDING" },
        { "fieldPath": "createdAt",  "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "tripJoinRequests",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "requestorUid", "order": "ASCENDING" },
        { "fieldPath": "status",       "order": "ASCENDING" },
        { "fieldPath": "createdAt",    "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "travelGroups",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "visibility",  "order": "ASCENDING" },
        { "fieldPath": "destination", "order": "ASCENDING" },
        { "fieldPath": "createdAt",   "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "groupJoinRequests",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "ownerUid",  "order": "ASCENDING" },
        { "fieldPath": "status",    "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "groupJoinRequests",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "requestorUid", "order": "ASCENDING" },
        { "fieldPath": "status",       "order": "ASCENDING" },
        { "fieldPath": "createdAt",    "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "activityFeed",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "visibility", "order": "ASCENDING" },
        { "fieldPath": "createdAt",  "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "nearbyTravelers",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "currentCity", "order": "ASCENDING" },
        { "fieldPath": "updatedAt",   "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "nearbyTravelers",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "destination", "order": "ASCENDING" },
        { "fieldPath": "updatedAt",   "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## 4. Firestore Security Rules Strategy

### Principles
1. Deny by default — only explicitly permitted reads/writes are allowed
2. Profile privacy — public profiles readable only if `profileVisibility == 'public'`
3. Ownership — only document owners can write sensitive data
4. No cross-collection rule references for blocks (too complex for V1) — supplement with client-side filtering
5. Join request integrity — requestor cannot approve their own request; owner cannot create requests

### Key Rules (pseudo-code)

```
// publicProfiles/{uid}
read:  authenticated
write: uid == request.auth.uid  // owner only

// publicTrips/{tripId}
read:  authenticated
write: tripId found in request.auth.uid's trips (NOT enforceable without Function)
      → simplified: authenticated AND resource.data.ownerUid == request.auth.uid

// tripJoinRequests/{requestId}
create: authenticated
        AND requestorUid == request.auth.uid
        AND NOT (ownerUid == request.auth.uid)  // can't join own trip
        AND status == 'pending'
read:   ownerUid == auth.uid OR requestorUid == auth.uid
update: (ownerUid == auth.uid AND valid status transition)
        OR (requestorUid == auth.uid AND status == 'cancelled')
delete: never (use status: 'cancelled')

// travelGroups/{groupId}
read:  visibility == 'public' AND authenticated
       OR member of group
write: ownerUid == auth.uid

// travelGroups/{groupId}/members/{uid}
read:  authenticated (for group detail view)
write: only via groupId owner (batch write after approval)

// blocks/{uid}/blocked/{blockedUid}
read:  uid == auth.uid
write: uid == auth.uid

// reports/{reportId}
create: authenticated
read:   never  // admin console only

// activityFeed/{feedItemId}
read:   authenticated
create: actorUid == auth.uid AND valid type
delete: actorUid == auth.uid
update: never
```

### Limitation to document
Block enforcement in Firestore rules is complex — you cannot easily query `blocks/{uid}` in a rule for another collection. Client-side supplementation is required for V1. A Cloud Function trigger for cascading block enforcement is a V2 item.

---

## 5. Offline Strategy

### What works offline (unchanged)
- Trips, itinerary, checklist, journal — all fully offline via Firestore listeners

### Community features — offline behavior

| Feature | Offline behavior |
|---|---|
| View public profile | Shows last cached profile |
| Browse public trips | Shows last cached list (up to Firestore cache TTL) |
| Send join request | **Queued** — Firestore offline writes retry when reconnected |
| View join request status | Stale until reconnect |
| Browse travel groups | Cached list shown |
| Group chat | Existing message cache shown; new messages queue |
| Activity feed | Stale list shown |

### Firestore offline config
Firestore SDK offline persistence is already enabled (`enableNetwork(false)` not used — default persistence is on). No additional config needed.

### Cache TTL
- `publicTrips` list: Firestore default persistence (persistent between sessions)
- `publicProfiles`: read once per session per uid; no manual TTL

---

## 6. Notification Strategy

### V1 — Local Notifications Only

All community notifications use `expo-notifications` local scheduling, triggered by Firestore listener events.

| Event | Trigger | Notification |
|---|---|---|
| Join request received | Firestore listener on `tripJoinRequests` filtered by `ownerUid` | "Alex wants to join your Tokyo trip" |
| Join request approved | Firestore listener on `tripJoinRequests` for requestor | "You've been approved for the Tokyo trip!" |
| Join request rejected | Same listener | "Your request for the Tokyo trip was not approved." |
| Group join approved | Firestore listener on `groupJoinRequests` | "You're now a member of Beach Hopping Thailand!" |
| New group message | Existing group chat listener | Already implemented |

### Limitation
Local notifications only fire if the app is in background (not closed). Fully killed app won't receive any notification. FCM (Firebase Cloud Messaging) required for reliable delivery — scoped to V2.

### V2 — FCM Push Notifications
Requires Cloud Functions to send FCM on Firestore document writes. Currently out of scope. Design is ready — functions would be `onDocumentCreated('tripJoinRequests/{id}', ...)`.

---

## 7. Cost Controls

### Firestore Read Budget

| Query | Reads per call | Frequency |
|---|---|---|
| Public trips list | 20 docs | Per page scroll |
| Public trip detail | 1 doc | Per tap |
| Trip join requests (owner) | up to 50 | Per screen open |
| My join requests | up to 20 | Per screen open |
| Public groups list | 20 docs | Per page scroll |
| Activity feed | 30 docs | Per open |
| Public profile | 1 doc | Per tap |

**Estimate at 1,000 DAU:** ~150,000 reads/day — well within Firestore free tier (50k reads/day) threshold **IF** caching is used. Implemented as:
- `onSnapshot` listeners (cached, not re-fetched unless data changes)
- No polling loops
- Pagination with `limit()` everywhere
- No fan-out writes (no Cloud Functions)

### Write Budget

| Action | Writes |
|---|---|
| Save extended profile | 2 (users + publicProfiles) |
| Create public trip | 2 (trips + publicTrips) |
| Update trip to public | 2 |
| Submit join request | 1 |
| Approve join request | 3 (request + member + trip.memberCount) |
| Create travel group | 1 + 1 member |
| Post feed item | 1 |

**Firestore free tier:** 20k writes/day. At 1,000 DAU with modest activity, stays within free tier.

### Photo Storage
- Profile photos: up to 1MB compressed before upload (already handled)
- Trip cover photos: up to 2MB compressed
- Storage free tier: 5GB — sufficient for beta

---

## 8. Shared Types (`packages/shared`)

New TypeScript types to add:

```typescript
// types/Community.ts

export type TravelStyle =
  | 'solo'
  | 'budget'
  | 'luxury'
  | 'adventure'
  | 'cultural'
  | 'food'
  | 'digital-nomad'
  | 'eco';

export type Interest =
  | 'hiking'
  | 'photography'
  | 'food'
  | 'nightlife'
  | 'history'
  | 'beach'
  | 'languages'
  | 'volunteering'
  | 'yoga'
  | 'art'
  | 'sports'
  | 'music';

export type ProfileVisibility = 'public' | 'private';
export type TripVisibility = 'private' | 'public';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface PublicProfile { ... }
export interface PublicTrip { ... }
export interface TripJoinRequest { ... }
export interface TravelGroup { ... }
export interface GroupJoinRequest { ... }
export interface FeedItem { ... }
export interface Report { ... }
```

---

## 9. Scalability Concerns

| Concern | Impact | Mitigation |
|---|---|---|
| Public trips collection grows unbounded | Slow queries | Add `createdAt` range filters; archive old trips |
| Activity feed fan-out at scale | High write cost | V1: global feed only; V2: per-user feed via Cloud Functions |
| Block list cross-referencing in rules | Security gaps | Client-side filtering supplements V1; Cloud Functions enforce V2 |
| Profile denormalization drift | Stale names/photos | Firestore batch writes; V2: Cloud Function sync on profile update |
| Join request storm (popular trip) | Rate limit needed | Client-enforces 3 requests/user/day; V2: server-side check |
| Group chat at scale | Message volume | Existing pagination handles 100s of messages |
| `publicProfiles` query for discovery | N+1 reads | List views use denormalized data; profile detail is one read |
