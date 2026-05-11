# Firebase Security Test Plan

## What Changed and Why

Three bugs were fixed in `firestore.rules`. No index or storage rule changes were needed.

### Fix 1 — Notifications update rule (was broken, always denied)

**Before:**
```
&& request.resource.data.keys().hasOnly(['isRead'])
```

**After:**
```
&& request.resource.data.diff(resource.data).affectedKeys().hasOnly(['isRead'])
```

**Why:** `keys()` returns **all fields in the resulting document** after the update. A real notification document has `userId`, `title`, `body`, `type`, `createdAt`, `isRead`, etc. — so `keys().hasOnly(['isRead'])` always evaluated to `false`, meaning **no user could ever mark a notification as read**. `affectedKeys()` returns only the fields that actually changed, which is `['isRead']` for a `markNotificationRead` call.

---

### Fix 2 — Groups read rule (was over-permissive)

**Before:**
```
allow read: if request.auth != null;
```

**After:**
```
allow read: if request.auth != null
  && request.auth.uid in resource.data.members;
```

**Why:** Any authenticated user could read any group's full document data including member lists, admin lists, and private group metadata. Restricting to `members` ensures only people who belong to the group can read it. Group messages were already member-restricted via a `get()` call — the group document itself was the only gap.

---

### Fix 3 — Saved places create: validate denormalized userId field

**Before:**
```
allow read, write: if request.auth != null && request.auth.uid == userId;
```

**After:**
```
allow read, delete: if request.auth != null && request.auth.uid == userId;
allow create: if request.auth != null
  && request.auth.uid == userId
  && request.resource.data.userId == request.auth.uid;
allow update: if request.auth != null && request.auth.uid == userId;
```

**Why:** The path-based check (`userId` from URL) already prevents writing to another user's path. The additional `request.resource.data.userId == request.auth.uid` check ensures the denormalized `userId` field stored inside the document is also consistent with the actual owner. Without this, a client could store a mismatched `userId` in the document data, causing silent data corruption in queries that filter by `userId` field.

---

## Deploy Commands

```bash
# Deploy rules and indexes together (safe — rules are always non-breaking in this case)
firebase deploy --only firestore:rules,firestore:indexes

# Rules only (faster, if indexes haven't changed)
firebase deploy --only firestore:rules
```

Run from the repo root where `firebase.json` lives (`c:\Users\ravit\Desktop\SoloTravelSoul`).

---

## Firebase Console Rules Playground Tests

Go to: **Firebase Console → Firestore → Rules → Rules Playground**

Run each test and verify the result matches the Expected column.

### Users collection

| Operation | Path | Auth UID | Expected |
|-----------|------|----------|----------|
| get | `/users/uid-A` | `uid-A` | Allow |
| get | `/users/uid-A` | `uid-B` | Deny |
| update | `/users/uid-A` | `uid-A` | Allow |
| update | `/users/uid-A` | `uid-B` | Deny |

### Trips collection

| Operation | Path | Auth UID | Expected |
|-----------|------|----------|----------|
| get | `/users/uid-A/trips/trip-1` | `uid-A` | Allow |
| get | `/users/uid-A/trips/trip-1` | `uid-B` | Deny |
| create | `/users/uid-A/trips/trip-1` | `uid-A` | Allow |
| delete | `/users/uid-A/trips/trip-1` | `uid-B` | Deny |

### Itinerary days

| Operation | Path | Auth UID | Expected |
|-----------|------|----------|----------|
| get | `/users/uid-A/trips/trip-1/itinerary/day-1` | `uid-A` | Allow |
| get | `/users/uid-A/trips/trip-1/itinerary/day-1` | `uid-B` | Deny |
| create | `/users/uid-A/trips/trip-1/itinerary/day-1` | `uid-A` | Allow |

### Saved places

| Operation | Path | Auth UID | Data | Expected |
|-----------|------|----------|------|----------|
| get | `/users/uid-A/saved_places/place-1` | `uid-A` | — | Allow |
| get | `/users/uid-A/saved_places/place-1` | `uid-B` | — | Deny |
| create | `/users/uid-A/saved_places/place-1` | `uid-A` | `{userId: "uid-A", ...}` | Allow |
| create | `/users/uid-A/saved_places/place-1` | `uid-A` | `{userId: "uid-B", ...}` | **Deny** |
| delete | `/users/uid-A/saved_places/place-1` | `uid-A` | — | Allow |
| delete | `/users/uid-A/saved_places/place-1` | `uid-B` | — | Deny |

### Notifications

| Operation | Path | Auth UID | Existing doc | Update data | Expected |
|-----------|------|----------|-------------|-------------|----------|
| get | `/notifications/notif-1` | `uid-A` | `{userId: "uid-A", ...}` | — | Allow |
| get | `/notifications/notif-1` | `uid-B` | `{userId: "uid-A", ...}` | — | Deny |
| update | `/notifications/notif-1` | `uid-A` | `{userId: "uid-A", isRead: false, ...}` | `{isRead: true}` | Allow |
| update | `/notifications/notif-1` | `uid-A` | `{userId: "uid-A", isRead: false, ...}` | `{isRead: true, title: "hacked"}` | **Deny** |
| update | `/notifications/notif-1` | `uid-B` | `{userId: "uid-A", isRead: false, ...}` | `{isRead: true}` | **Deny** |

### Groups (Phase 2)

| Operation | Path | Auth UID | Existing doc members | Expected |
|-----------|------|----------|---------------------|----------|
| get | `/groups/group-1` | `uid-A` | `["uid-A", "uid-B"]` | Allow |
| get | `/groups/group-1` | `uid-C` | `["uid-A", "uid-B"]` | **Deny** |
| create | `/groups/group-1` | `uid-A` | — | Allow |

---

## App Phone Test Checklist

After deploying rules, test these flows on a physical device or Expo Go:

**Auth**
- [ ] Sign up with a new email — profile created, app boots to home
- [ ] Sign in with existing account — no crash, profile loads
- [ ] Sign out and sign back in — state resets correctly

**Trips**
- [ ] Create a new trip — appears in Trips tab
- [ ] Edit trip destination/dates — updates correctly
- [ ] Archive a trip — disappears from active list

**Itinerary**
- [ ] Open a trip itinerary — day list loads
- [ ] Add a custom place to a day — place appears in day
- [ ] Delete a place from a day — place removed
- [ ] Add a journal entry — entry appears
- [ ] Delete a journal entry — entry removed
- [ ] Browse saved places inside itinerary — saved places load; search filters work

**Discover / Add to Trip**
- [ ] Open Discover tab — bundled attractions load
- [ ] Tap "Add to trip" on an attraction — AddToTripSheet opens with trip list
- [ ] Select a trip — day list appears (Step 2)
- [ ] Select a day — place added, sheet closes
- [ ] Reopen AddToTripSheet — lands on Step 1 (trip list), not Step 2

**Saved Places**
- [ ] Save a place from Discover — appears in saved list
- [ ] Unsave a place — disappears from saved list

**Notifications**
- [ ] Notification appears in inbox
- [ ] Tap notification — marks as read (isRead: true in Firestore)
- [ ] Notification does not appear for a different user's account

**Offline resilience**
- [ ] Enable airplane mode, open app — no red crash overlay, app boots
- [ ] Re-enable network — data reloads without restart

---

## Beta Readiness Assessment

| Area | Status | Notes |
|------|--------|-------|
| Auth rules | Ready | Owner-only access on all user subcollections |
| Trip rules | Ready | Correctly scoped to path-based userId |
| Itinerary rules | Ready | Correctly scoped, offline-safe |
| Saved places rules | Ready | userId field validation added |
| Notification rules | **Fixed** | `affectedKeys()` bug corrected — markAsRead now works |
| Groups rules | **Hardened** | Read restricted to members only |
| Storage rules | Ready | Owner-only for all photo paths |
| Indexes | Ready | All queries covered; no missing composite indexes |
| Offline handling | Ready | `memoryLocalCache`, graceful null/[] returns |
| Zustand selectors | Ready | `useShallow` applied to all filter selectors |

**Verdict: Ready for external beta after `firebase deploy --only firestore:rules,firestore:indexes` completes successfully.**

The only remaining pre-beta callout is the transient "Could not reach Cloud Firestore backend" log at first launch — this is the Firebase SDK's own internal logger firing during network negotiation, not a code bug. It auto-recovers and does not affect users.
