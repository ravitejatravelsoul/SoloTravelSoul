# SoloTravelSoul — Route Audit Report

**Date:** May 2026  
**Status:** All routes verified and fixed  
**TypeScript:** ✅ Zero errors

---

## Root Cause

`community/` and `discover/` folders had no `_layout.tsx`. Without a nested layout, Expo Router flattens every file inside those folders into the parent `Tabs` navigator as individual children. The `Tabs.Screen href:null` entries in `_layout.tsx` used incorrect route names (folder aliases like `community/groups` instead of the actual route names `community/groups/index`), causing repeated warnings.

---

## Broken Routes Found

| `href: null` name used | Actual route in filesystem | Status |
|---|---|---|
| `community/profile` | `community/profile/[uid]` | ❌ Wrong name |
| `community/groups` | `community/groups/index` | ❌ Wrong name |
| `community/travelers` | `community/travelers/index` | ❌ Wrong name |
| `community/feed` | `community/feed/index` | ❌ Wrong name |
| `discover/trips` | `discover/trips/index` | ❌ Wrong name |
| `community/report` | `community/report` | ⚠️ Name was correct but now handled by nested Stack |

**Tab name mismatches (would have broken when layouts were added):**

| Old name in Tabs.Screen | Correct name after adding layout |
|---|---|
| `community/index` | `community` |
| `discover/index` | `discover` |

---

## Files Changed

### New files created

| File | Purpose |
|---|---|
| `apps/mobile/app/(app)/community/_layout.tsx` | Stack navigator for all community sub-routes |
| `apps/mobile/app/(app)/discover/_layout.tsx` | Stack navigator for discover + trips sub-routes |

### Modified files

| File | Change |
|---|---|
| `apps/mobile/app/(app)/_layout.tsx` | Renamed `discover/index` → `discover`, `community/index` → `community`; removed all wrong `href:null` entries |

---

## Navigation Fixes

### `_layout.tsx` before → after

**Tab names:**
```diff
- <Tabs.Screen name="discover/index" ...   // WRONG: Expo Router expects folder name after _layout added
+ <Tabs.Screen name="discover" ...         // CORRECT: matches the nested stack

- <Tabs.Screen name="community/index" ...  // WRONG
+ <Tabs.Screen name="community" ...        // CORRECT
```

**Removed wrong `href:null` entries:**
```diff
- <Tabs.Screen name="community/report" options={{ href: null }} />   // handled by community Stack
- <Tabs.Screen name="community/profile" options={{ href: null }} />  // wrong name + handled by Stack
- <Tabs.Screen name="community/groups" options={{ href: null }} />   // wrong name + handled by Stack
- <Tabs.Screen name="community/travelers" options={{ href: null }} />// wrong name + handled by Stack
- <Tabs.Screen name="community/feed" options={{ href: null }} />     // wrong name + handled by Stack
- <Tabs.Screen name="discover/trips" options={{ href: null }} />     // wrong name + handled by Stack
```

### `community/_layout.tsx` (new)

Registers all community sub-routes as a Stack:

```
index                     → community/index.tsx (community hub)
report                    → community/report.tsx (modal)
profile/[uid]             → community/profile/[uid].tsx
groups/index              → community/groups/index.tsx
groups/create             → community/groups/create.tsx (modal)
groups/[groupId]          → community/groups/[groupId].tsx
groups/[groupId]/requests → community/groups/[groupId]/requests.tsx
travelers/index           → community/travelers/index.tsx
feed/index                → community/feed/index.tsx
```

### `discover/_layout.tsx` (new)

Registers discover routes as a Stack:

```
index         → discover/index.tsx (main discover screen)
trips/index   → discover/trips/index.tsx (public trips list)
trips/[tripId]→ discover/trips/[tripId].tsx (trip detail)
```

---

## Route Verification Table

All navigation calls verified against real files:

| `router.push()` call | Resolves to file | Status |
|---|---|---|
| `/(app)/community/groups` | `community/groups/index.tsx` | ✅ |
| `/(app)/community/groups/create` | `community/groups/create.tsx` | ✅ |
| `/(app)/community/groups/${id}` | `community/groups/[groupId].tsx` | ✅ |
| `/(app)/community/groups/${id}/requests` | `community/groups/[groupId]/requests.tsx` | ✅ |
| `/(app)/community/profile/${uid}` | `community/profile/[uid].tsx` | ✅ |
| `/(app)/community/report` | `community/report.tsx` | ✅ |
| `/(app)/community/travelers` | `community/travelers/index.tsx` | ✅ |
| `/(app)/community/feed` | `community/feed/index.tsx` | ✅ |
| `/(app)/discover/trips` | `discover/trips/index.tsx` | ✅ |
| `/(app)/discover/trips/${id}` | `discover/trips/[tripId].tsx` | ✅ |
| `/(app)/profile/privacy` | `profile/privacy.tsx` | ✅ |
| `/(app)/profile/safety` | `profile/safety.tsx` | ✅ |
| `/(app)/profile/join-requests` | `profile/join-requests.tsx` | ✅ |
| `/(app)/profile/blocked-users` | `profile/blocked-users.tsx` | ✅ |
| `/(app)/trips/${id}/requests` | `trips/[id]/requests.tsx` | ✅ |
| `/(app)/trips/${id}/edit` | `trips/[id]/edit.tsx` | ✅ |
| `/(app)/groups/${id}/chat` | `groups/[groupId]/chat.tsx` | ✅ |
| `/privacy` | `app/privacy.tsx` | ✅ |
| `/terms` | `app/terms.tsx` | ✅ |

---

## Firestore Index Status

The app launched and triggered two `failed-precondition` errors for indexes still building:

| Collection | Index fields | Status |
|---|---|---|
| `activityFeed` | `visibility ASC, createdAt DESC` | ⏳ Building |
| `travelGroups` | `visibility ASC, createdAt DESC` | ⏳ Building |

**These are not code bugs.** Firestore composite indexes take 2–10 minutes to build after first deployment. Both indexes are correctly defined in `firestore.indexes.json`. The errors will self-resolve.

**Other indexes in `firestore.indexes.json`:** 18 total defined. Run `firebase deploy --only firestore:indexes` if not yet deployed.

**Firebase Console index build link from the log:**
- Activity Feed: Check Firebase Console → Firestore → Indexes
- Travel Groups: Check Firebase Console → Firestore → Indexes

---

## Remaining Blockers

None — all route warnings eliminated.

### Before going to EAS build

- [ ] Wait for Firestore indexes to finish building (2–10 min, check Firebase Console)
- [ ] Run `firebase deploy --only firestore:rules` if rules not yet deployed
- [ ] Run `firebase deploy --only firestore:indexes` if indexes not yet deployed
- [ ] Test Community tab → Groups list → Group detail → Join request flow
- [ ] Test Discover → Trips list → Trip detail → Join request
- [ ] Test Profile → Privacy Settings → toggle public
- [ ] Test Profile → My Join Requests (Sent + Received tabs)

---

## Final `_layout.tsx` Hidden Tab Summary

Only genuinely flat files that need `href: null` (no nested `_layout.tsx` of their own):

```
groups              — has _layout.tsx but hidden (existing chat feature)
notifications/index — flat file, hidden
profile/edit        — flat file, hidden  
profile/privacy     — flat file, hidden
profile/safety      — flat file, hidden
profile/join-requests — flat file, hidden
profile/blocked-users — flat file, hidden
saved-places/index  — flat file, hidden
```

Community and discover sub-routes are no longer listed here — they are managed by `community/_layout.tsx` and `discover/_layout.tsx` respectively.
