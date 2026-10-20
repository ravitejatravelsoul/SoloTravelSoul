# Release handoff (free tier: Firebase Spark + Workers Free + KV/D1)

Status at commit time: **not store-ready.** Staging is consolidated and live-verified (see below and `docs/release-hardening.md`). Three Android preview APKs were built and tested on an Android 15 emulator (section 10); every device defect found so far is fixed and verified there. Production is untouched, and the iOS, build and owner items in section 9 are still open. Everything marked *draft* must be confirmed by the app owner before it is entered in a console. No owner, staff member or completed operation is assumed here.

Technical detail and test evidence: `docs/release-hardening.md` (latest section: "Consolidated staging on the Durable Object host").

## 0. Current staging state

- **API/media host:** `https://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev`, one Worker. A thin front forwards to SQLite-backed Durable Objects, which authenticate and run the handlers. The same origin serves media URLs, the EAS `preview` Worker URL and the app's token attachment.
- **Current version:** `fdce6651-d034-462f-a36e-61b8e32b2c95` (commit `3766425`, contact addresses, deployed 2026-10-11). Previous version (version rollback target): `b8392e10-5149-47d1-9a11-a2375eaa43be`.
- **Maintenance:** one schedule, `*/5 * * * *`, via an internal RPC to a fixed maintenance object.
- **Rollback:** `cd workers/r2-upload-worker && npx wrangler deploy --env staging --var API_HOST_MODE:worker` (verified live); return with `npx wrangler deploy --env staging`.
- **Active staging credentials:**
  - One service-account key (ID ending `615e6b`) in the Worker secret `GOOGLE_SERVICE_ACCOUNT_JSON`.
  - The Worker secret `ADMIN_DELETION_TOKEN`, rotated 2026-10-10. The encrypted owner copy and its procedures are in section 10, "Staging admin credential: encrypted owner copy and procedures".
  - No other user-managed keys exist for `sts-staging-deleter`.
- **Retired:** the proof Worker `solotravelsoul-api-do-staging` (deleted) and its key (revoked).
- **Firestore rules and Worker on staging match commit `ffa6af3`** (deployed 2026-10-18): ruleset `1d5285d9-0f5a-46d0-af48-4ceef6a16611`, Worker version `603c9c0e-6cef-4166-b1ca-4ce87e544ed3`. Rollback: Worker `fdce6651-d034-462f-a36e-61b8e32b2c95`; rules: re-release ruleset `12ac24a4-b1fb-4a52-bbf3-6324434edfc4` (released 2026-10-05; copy saved locally as `%LOCALAPPDATA%\SoloTravelSoul\staging-rollback\firestore.rules.ruleset-12ac24a4`). Section 10, "Staging compatibility verification".
- **Demo feed (seed `sts-demo-feed-v1`, 2026-10-11):** 8 fictional "(Demo)" travelers plus a private QA viewer, 24 photo posts, 4 photo journals, follows, likes and comments, for phone testing. Section 10, "Staging demo feed".
- **Disposable test accounts:** earlier live-test runs left some in staging Auth/Firestore (emails `sts-live-<run>-<key>@example.test`). Delete them when staging testing is finished. The native run of 2026-10-09 removed all of its own (section 10).

## 1. Owner decisions (one table, 2026-10-10)

Every open decision is in this table. Recommendations come from the code and the checks recorded in this file; nothing has been decided or appointed.

| Decision | Recommendation | Consequence | Required input |
|---|---|---|---|
| Moderators and coverage | **Owner decision 2026-10-11:** primary moderator is the owner (Teja). Backup: **not decided**. Response targets (section 11): **pending the owner's confirmation** that they can be met. | Without anyone working the queue, the "timely responses" (Apple 1.2) and "robust, ongoing moderation" (Google Play) requirements cannot be met; reports are only auto-hidden at 3 | A backup (optional but recommended); confirmation or adjustment of the targets |
| Privacy answers | Declare per section 3: no device location, no push token, no analytics; retained items as listed. **Owner decision 2026-10-11:** Mapbox and Foursquare stay **off** for the first release. The privacy and support mailbox is `ravitejatravelsoul@gmail.com`, working and checked daily. | **Contact addresses fixed in code (2026-10-11):** the app and the deletion page now publish only `ravitejatravelsoul@gmail.com`; the bouncing `@solotravelsoul.app` addresses are gone. The fix reaches users with the next app build and Worker deploy. | The remaining section 3 confirmations (retained media metadata, production logs) |
| Old clients | **Answered:** the owner confirmed on 2026-10-10 that neither the Expo app nor the legacy Swift app (`Raviteja.SoloTravelSoul`) was ever distributed. So: no forced-update gate, no adoption window, and nothing to retire for users. Deploy the new rules with the first store release (section 5). | No installed old clients exist to break | None |
| Legacy data and media | **B2 done (2026-10-10):** 77 demo docs deleted, backup kept. A2 is blocked by the Storage billing restriction (section 6). Still open: A1 (207 root + 229 subcollection Swift-era docs) and B1 (3 Swift Auth accounts). Keep the shared account and the 12 demo roots that reference it; migrate its R2 photo with the production Worker. | A2 and the shared account's Storage image stay unreadable without billing | A1 approval; B1 decision; an A2 path (console download or a billing decision) |
| Production counter audit | **Done (read-only, 2026-10-10)**: 20 mismatches before B2, all on demo docs; **0 mismatches after B2** (section 7) | No repair needed | None |
| Production rollout | Approve as one change set: production EAS variables, Worker bindings and Durable Object migration, secrets (including a production admin token stored with the section 10 procedure), rules, indexes, cron | Nothing in production changes until then; store review needs a working production backend | Approval and a date |
| Store accounts and iOS | **Owner decision 2026-10-11: Android first.** iOS is out of scope for the first release. | iOS stays BLOCKED (no paid Apple membership) | Play Console access and service-account key (kept local) |
| Free/Spark ceilings | **Owner decision 2026-10-11: accepted** for the initial launch, with regular usage checks (`scripts/stagingUsage.cjs` against production). **No paid upgrade without the owner's separate approval.** | Above the ceilings, uploads, deletions or views fail until the next day | None (decided) |

## 2. Account-deletion URL

- Served by the Worker at `GET /account-deletion` (in-app steps, email request, what is deleted and kept). Operator fulfilment: `POST /admin/account-deletion` with the `ADMIN_DELETION_TOKEN` secret.
- Production URL to enter in Play Console: `https://<production worker host>/account-deletion`. It must be reachable on the production Worker **after** the Worker with KV/D1 bindings is deployed. Verify it on a phone browser first.
- Staging URL (for testing only, live): `https://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev/account-deletion`.
- Contact on the page and in the app: `ravitejatravelsoul@gmail.com` (owner-confirmed working mailbox, checked daily). **Live on staging** (Worker version `fdce6651`) and in preview build `bc55069f` (2026-10-11; section 10, "Fourth preview build: contact addresses"). Production gets it with the production build and Worker deploy.

## 3. Store privacy answers (draft from code, 2026-10-10)

Checked against the current code. It differs from the older tables in `docs/PLAY_STORE_SUBMISSION_CHECKLIST.md` and `docs/APP_STORE_SUBMISSION_CHECKLIST.md` (Step 7); correct those once confirmed. **Owner confirmation needed** is marked; everything else is a fact of the current code.

| Data | Collected / stored | Shared with other users | Sent to service providers | From code |
|---|---|---|---|---|
| Name, email | Yes (required) | Name and photo on the public profile, posts, comments and chats; email is not listed publicly | Firebase (Auth, Firestore) | Email is used for sign-in and an exact-match lookup directory |
| Photos | Yes (optional) | When attached to public posts, journals or the profile | Cloudflare (Worker, KV, D1) | Access is checked on every request; copies already downloaded cannot be recalled |
| User content (trips, journals, posts, comments, reviews) | Yes | Public posts and journals; trips are private unless published | Firebase | — |
| Messages (direct and group) | Yes | With the chat participants | Firebase | Kept for the other participants after deletion, shown as "Deleted User" |
| Profile city and home country | Yes, typed by the user (private `users/{uid}`) | Copied to `publicProfiles/{uid}` (`currentCity`, `homeCountry`). Any signed-in, unblocked user can read them **only while the profile is public**; new profiles default to private | Firebase | Free text, not coordinates |
| Nearby Travelers entry | Only after the user switches on discovery in Privacy settings (default off) | `nearbyTravelers/{uid}`: name, photo, travel styles, city and current destination. Any signed-in user can read it; switching discovery off deletes it, and so does making the profile private | Firebase | Free text |
| Location on posts and journals | Yes, optional `location` and `country` text on each post and journal | With the content: any signed-in user while it is public and not archived; always the author and moderators | Firebase | Free text |
| Destination on public trips | Yes, when a trip is published | `publicTrips`: every signed-in user | Firebase | Free text |
| Destination on community groups | Yes | `travelGroups`: every signed-in user for public groups; the owner only for private groups | Firebase | Free text |
| Destination on chat groups | Yes | `groups`: members only | Firebase | Free text |
| Private trip plans | Yes (destination, itinerary places with their place coordinates) | No: owner only (`users/{uid}/trips`) | Firebase | Place coordinates come from the place catalogue or search, not from the device |
| Device location (GPS) | **Not collected in the current build** | — | — | `getCurrentLocation()` is reachable only through `hooks/useLocation.ts`, which no screen uses. Foursquare `searchNearby()` has no caller. Mapbox and Foursquare are off unless `EXPO_PUBLIC_MAPBOX_ENABLED` / `EXPO_PUBLIC_FOURSQUARE_ENABLED` are `"true"`, and neither is set for production. **Owner confirmation needed:** if Mapbox is enabled later, maps show the device position through the Mapbox SDK, whose telemetry must then be declared or disabled. The location permissions in `app.json` are declared but unused. |
| Push token | **Not collected** | — | — | No `getExpoPushTokenAsync`/`getDevicePushTokenAsync` call. Only local notifications are scheduled on the device (trip reminders, join-request alerts). The FCM receive permission comes in through the `expo-notifications` library. |
| Crash logs, analytics, advertising IDs | **None** | — | — | No Crashlytics, analytics or ad SDK in `apps/mobile/package.json` |
| Safety reports | Yes (reporter, target, reason, optional details) | Moderators only | Firebase | Retained after either party's deletion |

**Deletion behaviour (in-app: Profile → Delete account; web: section 2):**
- **Deleted:**
  - the profile and every subcollection, the directory entries, and the public profile;
  - posts, journals, trips and groups the user owns, and the user's likes, saves, follows and memberships;
  - the image bytes (KV), and the Firebase Auth account (last).
- **Kept, anonymised as "Deleted User":** messages the user sent, comments on others' posts (as tombstones), and notifications already delivered to others.
- **Kept (records):**
  - safety reports;
  - the `accountDeletions/{uid}` job record (status, steps, timestamps), which permanently blocks writes for that UID;
  - `legacyMediaCleanup/{uid}`;
  - the D1 media index rows with `status = removed`. These keep the owner UID, media ID, purpose, size, type and timestamps, but no image.

  **Owner confirmation needed:** declare these retained technical records, or approve a later change that clears `owner_uid` on removal.
- **Timing:** deletion usually completes in seconds. It can take longer, because the cron finishes interrupted deletions (verified: about 8 minutes). It can end `blocked` while legacy media is unverified. State "deletion may take time" rather than "immediate".
- **Logs:** Cloudflare Workers Logs are enabled on staging (`[env.staging.observability]`). **Owner confirmation needed:** whether production enables them, and their retention.

Other facts:
- Encrypted in transit: yes (HTTPS to Firebase and the Worker).
- No data is sold; no advertising SDKs.

**Contact addresses (Owner decision 2026-10-11):**
- The working privacy and support mailbox is `ravitejatravelsoul@gmail.com`, monitored daily.
- **Previous problem:** the app published `privacy@`, `safety@` and `legal@solotravelsoul.app`. The domain `solotravelsoul.app` does not resolve (NXDOMAIN, checked 2026-10-11), so those addresses bounced.
- **Fixed in code (2026-10-11): every published address is now `ravitejatravelsoul@gmail.com`.** No domain was bought.
  - App: one constant, `CONTACT_EMAIL` in `apps/mobile/constants/contact.ts`. It is used by the privacy policy (data deletion and contact sections), Terms (contact line), Safety & Guidelines (the mailto link and its label are the same constant) and the three account-deletion messages in `hooks/useAuth.ts`.
  - Deletion web page: `CONTACT` in `workers/r2-upload-worker/src/deletionPage.ts` (both mailto links and the displayed address).
  - Regression check: `tests/release/app.cjs` fails on any `@solotravelsoul.app` address or any mailto target other than the mailbox in the shipped app and Worker sources.
  - Verified locally: release suites pass; mobile and Worker typecheck pass; the Android export bundle contains the mailbox and no old address; the locally rendered deletion page shows the mailbox and both of its mailto links point to it.
  - **Live on staging** (Worker version `fdce6651`) and in preview build `bc55069f` (2026-10-11; section 10, "Fourth preview build: contact addresses"). Production gets it with the production build and Worker deploy.

## 4. Store configuration and credentials still missing (no values requested here)

| Item | State | What the owner provides (locally, never in chat) |
|---|---|---|
| EAS `production` environment | Holds only `GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICE_INFO_PLIST` (names checked; the app does not use them). **None of the eight `EXPO_PUBLIC_*` values** is set (Firebase web config of `solotravelsoul-57a9e`, production Worker URL), so a production build would fail its config guard. | Add the eight values to EAS `production` after the production Worker exists (the same names as `preview`). `npm run check:staging` validates the staging set; run the equivalent check before building production. |
| `eas.json` `submit.production.ios` | `REPLACE_WITH_YOUR_APPLE_ID`, `REPLACE_WITH_YOUR_APP_STORE_CONNECT_APP_ID`, `REPLACE_WITH_YOUR_APPLE_TEAM_ID` | Only if iOS is in scope (needs the paid Apple Developer Program) |
| `eas.json` `submit.production.android` | `serviceAccountKeyPath: ./google-play-key.json`, track `internal` | The Play Console service-account JSON at `apps/mobile/google-play-key.json`; it is gitignored and never committed |
| Play Console app `com.solotravelsoul.app` | Not created according to this repository; no EAS production build exists (EAS lists only the three staging previews) | Create the app; complete Data safety (section 3), content rating and target audience; set the account-deletion URL (section 2) |
| Android signing for production | EAS-managed keystores exist only for `com.solotravelsoul.app.staging` | The first production build creates the production keystore. Run it interactively once, after approval. |
| Version numbers | `app.json` `version` 1.0.0; build numbers are managed by EAS (`cli.appVersionSource: remote`, `production.autoIncrement: true`) | Nothing needed; raise `version` for user-visible releases |
| Target API | Builds target API 36, which meets Google Play's requirement for new apps and updates from 31 Aug 2026 ([developer.android.com](https://developer.android.com/google/play/requirements/target-sdk)) | — |

## 5. Old clients: forced update versus adoption window

**Who the old clients are (checked 2026-10-10):**
- **Expo app (`com.solotravelsoul.app`):** the current EAS build history contains only the three staging preview builds (package `com.solotravelsoul.app.staging`, 2026-10-09), and `app.json` carries no version history. **Answered:** the owner confirmed on 2026-10-10 that no build was ever distributed outside it.
- **Legacy native Swift iOS app** (Xcode project at the repository root, bundle `Raviteja.SoloTravelSoul`):
  - It uses the production Firebase project `solotravelsoul-57a9e` (its `GoogleService-Info.plist`) and the collections `users`, `groupChats`, `messages`, `trips`, `requests`, `notifications`, `preferences`, `languages`, `destinations` and `groups`, plus Firebase Storage.
  - The new rules do not allow most of these paths, and Storage uploads are refused. Once the rules deploy, an installed copy fails closed and can no longer write.
  - **Answered:** the owner confirmed on 2026-10-10 that it was never distributed (no TestFlight, no App Store), and that its production data is disposable test data. No installed copies exist, and nothing needs migrating.

| Option | Fits this project? | Cost | Effect |
|---|---|---|---|
| Forced-update gate in the Expo app | **Not needed**: no older Expo build was distributed (owner-confirmed). It could not reach the Swift app anyway. | New code, a remote config value, store review | — |
| Adoption window (keep the old rules until the old versions fade) | **Not needed**: there are no old clients to wait for, and the old rules keep the forged-relationship and counter holes open | Delayed security fixes | — |
| **Deploy the new rules with the first store release (decided by the owner's answers)** | Yes | None beyond the production rollout | No user-facing impact: no distributed old client exists |

Before the production rules deploy:
1. Distribution and data: answered (the owner confirmed on 2026-10-10). Nothing was distributed, and the Swift-era data (for example `users`, `groupChats`, `requests` written by the Swift app, and `profile_images/`) is disposable test data. Clearing it is a separate, approved production step: inventory first (counts only), then deletion, then a fresh count. It is optional for launch, because the new rules deny those paths.
2. Run the counter audit (section 7).
3. Deploy the rules together with the production backend (section 9, item 6).

## 6. Legacy media

Read-only inventory, made with the logged-in Firebase CLI account (counts only):

| Store | Result |
|---|---|
| Production Firebase Storage `solotravelsoul-57a9e.firebasestorage.app` | bucket readable by the owner account; **2 objects, both under `profile_images/`** |
| Production `solotravelsoul-57a9e.appspot.com` | bucket does not exist (404) |
| Staging `solotravelsoul-staging.firebasestorage.app` / `.appspot.com` | do not exist (404): never provisioned |
| Production legacy R2 `solotravelsoul-images` | not inventoried: Wrangler access exists, but a production R2 listing has not been authorized in any phase so far |

The two `profile_images/*.jpg` objects stay **unresolved** until their deletion is independently verified by a fresh listing.

### Production read-only preflight (2026-10-10)

Target confirmed: Firebase project `solotravelsoul-57a9e` (ACTIVE). Read-only throughout: Cloud Monitoring showed 0 document writes and 0 deletes in production for the day; this preflight used about 300 document reads (estimate; the monitoring data lags), well under 1% of the 50,000 Spark daily reads.

**Storage and R2:**

| Store | Count | Bytes | How |
|---|---|---|---|
| Firebase Storage `solotravelsoul-57a9e.firebasestorage.app` (whole bucket) | 2 objects | 912,600 | `node scripts/countLegacyStorage.cjs <bucket> ""` |
| …of which `profile_images/` | 2 objects | 912,600 | same, prefix `profile_images/` |
| `solotravelsoul-57a9e.appspot.com` | bucket does not exist (404) | — | same |
| Legacy R2 `solotravelsoul-images` | 1 object | 341,597 | Cloudflare GraphQL analytics (`r2StorageAdaptiveGroups`): **no R2 operations were spent**. Month-to-date R2 use: 0 Class A and 216 Class B operations (`GetObject`, i.e. the object is being viewed), against free limits of 1M and 10M. |

**Firestore (COUNT aggregations; field names only, never values):**
- 16 root collections, 305 documents.
- 89 documents carry `demo: true`: seed data from `scripts/seedCommunityDemo.ts`.
- Attribution by Swift-only collection name, or by Swift-only document schema:

| Group | Documents | Attribution |
|---|---|---|
| `groupChats` | 20 (+ `messages` 41, `requests` 8) | Swift-only collection |
| `groups` with the Swift schema (`admins`, `creator`, `joinRequests`, `requests`, `activities`) | 20 | Swift schema; the other 4 `groups` docs use the new app's schema (3 of them demo) |
| `notifications` | 3 | Swift schema (`fromUserId`, `toUserId`, `timestamp`); the new app writes `userId`, `isRead`, `createdAt` |
| `users` with only Swift fields | 4 (+ `notifications` 151, `trips` 12, `saved_places` 17). 3 of the 4 have an Auth account; they hold a legacy `fcmToken` field | Swift schema; none of the new app's profile fields |
| `profile_options_destinations` / `_languages` / `_preferences` | 56 / 50 / 54 | Swift-only reference collections |
| `users` mixing Swift and new-app fields | 1 (+ `notifications` 161, `trips` 13, `saved_places` 5), with an Auth account | **Used by both apps: kept** |
| Other new-app documents (not demo) | `userLookup` 2, `direct_chats` 1, `travelGroups` 1, `publicProfiles` 1, `nearbyTravelers` 1, `activityFeed` 1, `groups` 1 | Kept |

- Firebase Auth: 4 accounts in total (counted without user info).
- `profile_images/` owners: one object belongs to a Swift-only user, and one to the mixed account.
- The mixed account's `users` and `publicProfiles` photo URLs point at the **legacy R2 object**, which is why that object is still being read.

### Cleanup scope requiring approval (prepared; nothing deleted)

Local files outside the repository, readable only by the owner account, in `%LOCALAPPDATA%\SoloTravelSoul\`. They hold document and object paths or UIDs, which are not reproduced here:
- `production-cleanup-manifest-2026-10-10.json`: scopes A1, A2, B1, the B2 reference, and the exclusions;
- `demo-cleanup-plan-2026-10-10-r2.json`: the current B2 dry-run manifest (the earlier `demo-cleanup-plan-2026-10-10.json` was deleted; its approval hash is invalid);
- `protected-accounts.json`: the shared account's UID.

| Scope | Contents | Basis | Approval |
|---|---|---|---|
| **A1. Confirmed Swift-era Firestore data** | Root documents: `groupChats` 20, Swift-schema `groups` 20, `notifications` 3, Swift-only `users` 4, `profile_options_destinations` 56, `_languages` 50, `_preferences` 54 (207 in total). Subcollection documents: `groupChats/*/messages` 41, `groupChats/*/requests` 8, `users/*/notifications` 151, `users/*/trips` 12, `users/*/saved_places` 17 (229 in total). | The owner confirmed that Swift data is disposable test data; attribution by Swift-only collection or schema | Required, separately from A2 |
| **A2. Confirmed Swift-era Storage object** | 1 object, `profile_images/<swift-only uid>.jpg` (893,727 bytes) | Same | Required, separately from A1 |
| B1. Auth accounts of the Swift-only users | 3 accounts (the 4th Swift user doc has none) | Accounts, not data; not covered by the confirmation | Separate decision |
| B2. Demo seed content | Revised dry-run plan (2026-10-10, with reference protection; file `demo-cleanup-plan-2026-10-10-r2.json`, SHA-256 `ef1dff3c21b93790997e8033c7db87be4fad39a447d4947cce3e7f6deeb59b10`): **77 root documents deletable**: `activityFeed` 30, `publicTrips` 12, `nearbyTravelers` 10, `publicProfiles` 10, `travelGroups` 8, `tripJoinRequests` 4, `groupJoinRequests` 3. **0 subcollection documents.** These include all 20 docs with counter mismatches. No retained document references any of them. The earlier plan (SHA-256 `ea3b3544884a…`) is **invalidated**: its file was deleted, and the new preflight would reject it anyway. | Seed data (`demo: true`), not Swift data | Separate decision; apply only with the new SHA-256 |
| B2 protected exclusions (kept) | 12 demo roots that reference the shared account are skipped with all their children: `direct_chats` 5 (+ 27 messages), `groups` 3 (+ 15 messages), `tripJoinRequests` 2, `groupJoinRequests` 2. Removing them would change what the shared account sees in its chats and requests. The 4 kept join requests are addressed to the shared account as owner. Their target trip or group exists in none of `publicTrips`, `travelGroups`, `trips`, `groups` or the owner's private trips, so they were already dangling and no planned deletion touches them. | Protected account | Owner decision later (not in B2) |
| **Not in scope (keep)** | The mixed account and all its documents; its `profile_images` object; the legacy R2 object (its current photo; needs **migration**, not deletion); every other new-app document | Used by both apps, or new-app data | — |

**Demo cleanup procedure (`scripts/cleanupCommunityDemo.ts`, rewritten 2026-10-10):**
- **Dry run by default.** It requires `--project` and writes a local manifest (paths and exact update times) with counts. Nothing is deleted.
- **Apply** requires `--apply --manifest <file> --approve <SHA-256 of that file>`, and `--project` must match the manifest.
  - **Preflight (nothing deleted on failure):** it re-reads every item (same update time, still `demo`), every parent's full child set, and every reference to a planned root. Any difference rejects the whole run before the first delete.
  - **Deletion (not atomic as a whole):** it runs children first in batches of up to 400, each delete with a `lastUpdateTime` precondition. Each batch is atomic; the run is not. If a later batch fails, earlier batches stay applied, and the script reports a **partial apply** with deleted and not-deleted counts. Re-plan before continuing.
- **What it never deletes:**
  - unmarked documents (the old "delete every message under a demo parent" fallback is gone);
  - a parent with any non-demo or nested child (the whole parent is skipped, so nothing is orphaned);
  - anything that references a protected account (`--protect <uids.json>`);
  - **a target that a retained document still references:** the trip or group of a retained trip or group join request (protected, non-demo or otherwise kept), the chat group of a retained community group, or the trip of a retained chat group. This cascades.
- **Tests:** emulator tests in `tests/release/demoCleanup.cjs` (part of `npm run test:rules`) prove this. Non-demo messages, unmarked messages and the shared account's data survive. Retained join requests (protected and non-demo) keep their trips and groups, including the cascade to a chat group. Missing or wrong approval, the wrong project, a changed item, a new child, or a join request created after planning are all rejected in preflight with nothing deleted. A later batch failure is reported as a partial apply with exact counts.
- **Production commands** (after approval):
  ```
  npx tsx scripts/cleanupCommunityDemo.ts --project solotravelsoul-57a9e --plan <new plan file> --protect %LOCALAPPDATA%\SoloTravelSoul\protected-accounts.json
  npx tsx scripts/cleanupCommunityDemo.ts --project solotravelsoul-57a9e --apply --manifest <that plan file> --approve <its SHA-256>
  ```
  Apply exactly the plan file that was approved, by its SHA-256; **do not re-plan in between**. Every plan records its creation time, so a new plan always has a new hash and needs a new approval. The apply preflight already re-checks the approved plan against live data. If the preflight rejects it, nothing is deleted: make a new plan and ask for a new approval.

### Approved A2 + B2 execution (2026-10-10): STOPPED before any deletion

- **Approval** (owner, 2026-10-10): A2 and B2 only; A1, B1 and all protected shared-account data unchanged.
- **Checks passed:**
  - project `solotravelsoul-57a9e` ACTIVE;
  - plan file `demo-cleanup-plan-2026-10-10-r2.json` SHA-256 equal to the approved `ef1dff3c…59b10`;
  - 77 roots, 0 nested documents, 12 protected skips;
  - A2 manifest entry: 1 object, 893,727 bytes.
- **Baseline fingerprint** (read-only): 790 Firestore documents (306 top-level paths, of which 1 is a `groupChats` path with subcollection documents but no document itself, plus 484 nested), 2 Storage objects, 4 Auth accounts. It is stored outside the repo in `%LOCALAPPDATA%\SoloTravelSoul\ops-2026-10-10\`, owner account only.
- **Stopped at the backup step.** Reading the A2 object's metadata (GCS JSON API `objects.get` with the Firebase CLI owner token) returned **HTTP 403**, although listing the bucket works with the same token. Under the stop conditions (permission failure), the run stopped with no retry.
- **Nothing was deleted:** no B2 preflight or apply ran and the A2 object was not touched. The backup folder `%LOCALAPPDATA%\SoloTravelSoul\backup-2026-10-10\` is empty.
- **To resume:** the approved hash is still valid if production is unchanged. The apply preflight re-checks that. The A2 object read permission must be resolved before the backups can be made.
- **A1 finding:** `groupChats` has one path that holds subcollection documents without a document of its own. It is not counted in the A1 root figures; review it before any A1 approval.

**403 diagnosis (2026-10-10, read-only, one metadata request):**
- **Credential is fine:** the Firebase CLI owner token is valid and carries `cloud-platform` (plus `firebase` and read-only project scopes). Missing scopes and invalid credentials are ruled out.
- **The response:** `GET storage/v1/b/solotravelsoul-57a9e.firebasestorage.app/o/<A2 object>` returned **HTTP 403, reason `accountDisabled`**: "The billing account for the owning project is disabled in state absent".
- **Cause: a Cloud Storage billing restriction, not authentication or IAM.**
  - The project has no active billing account (Spark), and the bucket now refuses object data access.
  - Listing objects (metadata) still works, which is why the earlier inventory succeeded.
  - Downloading, and most likely deleting, the object is blocked the same way.
  - Nothing about billing, IAM, bucket rules or public access was changed.
- **Result:** the approved run stopped again before any write. 0 backups were written, B2 did not run, and A2 was not touched.
- **Consequences beyond A2:**
  - The shared account's own `profile_images` object is equally unreadable, so its migration is blocked too.
  - The legacy-media step of account deletion cannot verify or remove Firebase Storage objects while this restriction holds; such deletions end `blocked`.
  - B2 (Firestore only) does not depend on Storage, but it was approved together with A2 and was therefore not run separately.
- **Owner action:** in the Firebase console (Storage → `profile_images/`), try **Download** on the A2 object (its name is in the local manifest, `A2_storageSwiftEra`). Save it as `%LOCALAPPDATA%\SoloTravelSoul\backup-2026-10-10\a2-object.bin`.
  - If the console also refuses, the only routes to A2 are a billing decision (for example, temporarily linking a billing account; owner only, not done here) or leaving the 0.9 MB object in place.
  - Separately, B2 can be re-approved on its own.

### B2 executed (2026-10-10, owner-approved B2 only)

- **Scope:** exactly `demo-cleanup-plan-2026-10-10-r2.json`, SHA-256 `ef1dff3c21b93790997e8033c7db87be4fad39a447d4947cce3e7f6deeb59b10` (verified in full): 77 roots, 0 nested documents, 12 protected skips. A2 was excluded, and no Storage access of any kind was made.
- **Backup** (before deletion; owner-only; outside the repo): `%LOCALAPPDATA%\SoloTravelSoul\backup-2026-10-10\b2-documents.json`, holding the full REST JSON of all 77 documents. It was re-read from disk and verified: 77 unique planned paths, update times equal to the plan, all `demo: true`. `b2-backup-checks.json` records the file's SHA-256.
- **Before deletion:**
  - fresh fingerprint: 790 Firestore paths (306 top-level including 1 missing-parent, 484 nested), 4 Auth accounts; identical to the earlier baseline (0 added, removed or changed);
  - the script's own preflight against the approved file, without re-planning: **passed, 0 problems**.
- **Apply:** one run through the script's CLI, which repeats the preflight first. **Deleted 77**; not a partial apply; no retry.
- **After deletion:**
  - fingerprint: 713 paths (229 top-level, 484 nested), 4 Auth accounts;
  - comparison: **77 removed, all of them approved B2 paths; 0 removed outside B2; 0 added; 0 changed**. That covers A1, the shared account and every protected record; all 12 protected roots are present.
- **Counter audit re-run (read-only):** 3 documents read, **0 mismatches**.
- **Fingerprints** are stored in `%LOCALAPPDATA%\SoloTravelSoul\ops-2026-10-10\` (owner-only).

### Legacy Storage deletion on Spark: listing-based proof (2026-10-10)

**Risk fixed:**
- Account deletion used to send an unconditional `DELETE profile_images/{uid}.jpg`, then an object metadata GET, to prove absence.
- On this Spark project, object-level calls fail with a billing 403 (`accountDisabled`, section 6) even when the object does not exist. Every production deletion would therefore have ended `blocked`, with Auth kept, although nothing remained.
- The late-media sweep sent the same DELETEs and counted an inaccessible store as swept.

**Fix** (`workers/r2-upload-worker/src/objectStores.ts`, `accountDeletion.ts`):
- **Proof of absence** comes only from authenticated listings: each owned prefix (`profile_photos/{uid}/`, `trip_covers/{uid}/`, `journals/{uid}/`), plus the exact legacy name (listed with the name as prefix, exact match), across all pages.
- **What counts as a listing:** only an authenticated 200 with a well-formed body. Every item must be a named object inside the requested prefix, with valid page tokens and a page cap.
- **What never counts:** a denied (401/403), missing-bucket (404), failed, incomplete or malformed listing. These throw and are never treated as empty.
- **Deletion:** only objects a listing shows are deleted, and a fresh listing must then show them gone (`verified_absent`, proof `listing`).
- **Spark behaviour:** when nothing is listed, no object-level request is sent at all. A listed object that cannot be deleted (billing 403) records the objects as `unresolved` and keeps the deletion `blocked` with Auth kept, as before.
- **The late-media sweep** uses the same listing-based calls. A denied listing, or a listed object that cannot be deleted, is now a failed job (reported as `deletion_sweep_failed` and retried next pass), not a silent success.
- **Unchanged:** barriers, leases, continuation, quotas and the staging-only no-legacy mode. There is no static exclusion list, and production `LEGACY_MEDIA_MODE=none` stays refused.

**Evidence:**
- **Regressions first** (`tests/release/accountDeletion.cjs`, 4 new tests on the real adapter with a fake GCS: listings work, object calls return 403 `accountDisabled`). 3 of 4 failed before the fix; "existing object stays blocked" already held. They show that:
  - deletion completes with zero object calls when listings are empty;
  - an existing object stays blocked (Auth kept, unresolved recorded);
  - a denied, failed, incompletely paginated, non-JSON, malformed, foreign-prefix or nameless listing never proves absence;
  - the sweep makes no object calls for empty jobs and does not count an undeletable object as swept.
- **Suites:**
  - `npm run test:release` passes (account deletion 69/69 in memory);
  - `npm run test:rules` passes (account deletion 56/56 on the Firestore emulator, end-to-end 7/7 with the Storage emulator, demo cleanup 7/7);
  - the Worker typecheck is clean.
- **Live, read-only check on production** (the owner's Firebase CLI token; only GET listings; 8 requests, 0 others):
  - the new `verifyAbsent` proved a random, never-used UID absent;
  - it correctly detected the Swift-only user's existing `profile_images` object, under the current billing restriction.

**Remaining limitations:**
- **Accounts that do own a legacy Storage object stay `blocked`** while billing is absent, because their object cannot be deleted. Today that is the Swift-only user (A2) and the shared account.
- **Proof relies on Cloud Storage listings being strongly consistent and complete.** It covers the known owned prefixes and the exact legacy filename; objects stored under other, unknown paths would not be found.
- **The production Worker's service account does not exist yet.** It needs `storage.objects.list` on the bucket (and `storage.objects.delete` for any object it should remove). The live check used the owner's credentials.
- **Legacy R2** handling is unchanged.
- **If production listings are ever denied** (for example, missing IAM), deletions block with `unresolved` and the sweep warns on every pass. That is by design: the warning signals the problem rather than hiding it.

### Staging deployment of the Storage deletion fix (2026-10-11)

- **Deployed:** commit `7a03695` to staging only (`npx wrangler deploy --env staging`), on the existing Durable Object host (`src/edge.ts`, `ApiShard`, 8 shards, `*/5` cron). **Version `b8392e10-5149-47d1-9a11-a2375eaa43be`**, live from 21:55:20Z. Secrets were unchanged.
- **Rollback target:** the previous version `3362ef45`.
- **Limitation:** staging runs `LEGACY_MEDIA_MODE = "none"` and its Storage bucket was never provisioned, so the Firebase Storage step proves absence through the existing bucket-not-provisioned lookup. **The new listing-based path is not exercised on staging.** It is covered by the regression suites and by the read-only production listing check (section 6).

**End-to-end check** (disposable accounts V and B, `tests/staging/live.cjs`):

| Check | Result |
|---|---|
| Upload media | `seed-large v`: 20 photo uploads and posts, plus 1 more from `start-user`. V also has 15 likes and 25 comments on B's posts, mutual follows, a DM and a group with B. B viewed every V image (40/40 authorized views). |
| Start deletion, continue across slices | First call limited to one slice → 202 `in_progress` (step `likes`, 0 completed). Continued with V's own token → 200 `deleted`. Job `completed` after 11 attempts, 25/25 steps. |
| Owned data, media and Auth removed | `verify-deleted v` PASS: job completed, Auth sign-in refused, data removed, **21 media rows purged** (KV deletes done). V's profile, public profile and lookup entry are gone; 0 posts, likes or follows (either direction); 0 live comments. Legacy record `verified_absent` (`bucket-not-provisioned`). B now gets **404 for all 20** of V's image URLs. |
| Second account unchanged | All **30** of B's documents remain (profile, public profile, lookup, 15 posts, group, DM with 10 messages). The only field changes are the intended relationship releases: likes on B's posts 15 → 0, comments 25 → 0, B's followers 1 → 0 and following 1 → 0, V removed from B's group (2 → 1 members), DM participant shown as "Deleted User". B still signs in. |
| deletion-status | `GET /admin/deletion-status` (token recovered from the DPAPI copy, never displayed): 200, `count=0`, 0 stalled, 0 unresolved. Wrong, one-character-off and missing tokens → 403. |
| Worker errors since deploy | Front Worker (version `b8392e10`): 93 requests, **0 errors**, hourly CPU p99 ≤ 2.79 ms (one `clientDisconnected` request, not an error). Durable Objects: 127 requests, **0 errors**. |
| Cleanup | B deleted through `POST /account/delete` and verified (`verify-deleted b` PASS). No fixture from this run remains. |

**Independence from the new production Worker:**
- Inventory and the scope A/B deletions need only the owner's Google credentials: the GCS JSON API for the Storage object, Firestore REST or Admin for documents, and the Identity Toolkit admin API for B1. They can run before the production Worker is deployed.
- Only **migration** depends on the Worker (`/admin/media/import`). That covers the mixed account's R2 photo (and its Firebase Storage object, if it is to be kept).

**Verification after any approved deletion:**
- re-run `scripts/countLegacyStorage.cjs` and the COUNT inventory;
- each listed path must be absent;
- the excluded mixed-account data must be unchanged.

### Legacy media approval packet (prepared; nothing run)

**Owner answer (the owner confirmed on 2026-10-10):** the Swift app's legacy data is disposable test data. Step 0 is done (preflight above). For the Swift-only `profile_images` object, use step 3 (deletion with a fresh listing). The **mixed account's** `profile_images` object and its **legacy R2 photo** are not covered: they need migration (steps 1–2, which require the production Worker) or an owner decision.

Each step needs its own approval, and runs only after the production Worker with KV/D1 bindings exists (section 9, item 6). Credentials:
- the production admin token, held as described in section 10 (DPAPI copy), passed to the process environment only;
- operator application-default credentials for `solotravelsoul-57a9e`.

| Step | Command (read-only unless stated) | Expected quota | Verification | Rollback |
|---|---|---|---|---|
| 0. Inventory | `node scripts/countLegacyStorage.cjs solotravelsoul-57a9e.firebasestorage.app profile_images/` (GCS JSON API list; counts and bytes only) and `npx wrangler r2 bucket info solotravelsoul-images` (bucket metadata: object count and size) | 1 Storage list operation; 1 Cloudflare API call | 2 objects expected under `profile_images/`; the R2 count is recorded | none (read-only) |
| 1. Dry run | `npx tsx scripts/migrateLegacyMedia.ts --project solotravelsoul-57a9e --worker <production worker> --state <local state file> --source firebase` | a few Firestore reads per object (owner check and reference queries); 2 Storage downloads | Counts per stage: `planned` vs `skipped:<reason>` | none (no writes) |
| 2. Apply (**writes**) | step 1 plus `--apply` | 2 KV writes, about 6 D1 writes, 1 Firestore transaction per reference | Each item reaches `verified` (the digest endpoint matches the SHA-256), then `referenced`. Spot-check the profile photo in the app as its owner. | Before step 3 only: copy the state file and note each referenced document's field. To revert, put the original Storage URL back into each recorded field in one transaction per document (the source objects still exist). The new media rows become unattached and are swept by maintenance. |
| 3. Source deletion (**destructive**) | owner credentials: delete only objects whose state is `referenced`, or whose owner account no longer exists | 2 Storage delete operations | A fresh listing of `profile_images/` shows none of them; record `verified_absent` in `legacyMediaCleanup/{uid}` | **none after deletion**. Keep a verification window (for example 7 days) after step 2 and an offline copy of the 2 objects, or accept that step 3 is irreversible. |
| 4. Legacy R2 | inventory only (step 0) until the owner decides; the same packet with `--source r2` | per object as above | as above | as above |

Accounts whose legacy media is unresolved: deletion ends `blocked` and the account stays in Auth until step 3 is verified.

## 7. Counter audit (staging run 2026-10-10; production prepared)

**Staging (read-only, done 2026-10-10):**
- Command: `npx tsx scripts/auditCounters.ts --project solotravelsoul-staging --report <local file>`, with temporary application-default credentials from the Firebase CLI login. The credential file was deleted after the run.
- Result: **358 documents read, 0 mismatches** across all nine counters (`summary: {}`); the report file is `[]`.
- A count with `scripts/countAuditCollections.cjs` gave the same total, 358, for about 10 reads.

**Production (read-only, run 2026-10-10):**
- Daily headroom was checked first: Cloud Monitoring showed 0 production document reads for the day.
- Sizing (`node scripts/countAuditCollections.cjs solotravelsoul-57a9e`): **33 documents**: `publicProfiles` 11, `publicTrips` 12, `travelGroups` 9, `members` 1, all other audited collections 0. The count cost about 10 reads.
- Audit (`npx tsx scripts/auditCounters.ts --project solotravelsoul-57a9e --report <local file outside the repo>`, temporary application-default credentials deleted afterwards): **33 documents read, 20 mismatches**:
  - `publicTrips.memberCount`: 12 docs, stored total 20, expected 0;
  - `travelGroups.memberCount`: 8 docs, stored total 368, expected 0;
  - none negative.
- **All 20 are `demo: true` seed documents**: seeded member counts with no member records. There are no counter mismatches on non-demo data.
- **After B2 (2026-10-10):** the audit re-run read 3 documents and found **0 mismatches**, so no counter repair is needed.

**Production procedure (for re-runs):**
1. Sizing: `node scripts/countAuditCollections.cjs solotravelsoul-57a9e`. It runs COUNT aggregations and prints counts only. Cost: about 1 read per 1,000 index entries per collection, i.e. about 10 reads for small collections.
2. Budget: Spark allows 50,000 Firestore reads per day, shared with app traffic, and the full audit reads every document once. The recommended rule is to run it only if the sizing total is at most 20,000, on a low-traffic day. Above that, the audit needs a smaller scope or a different plan: Firestore export is not available on Spark.
3. Audit: `npx tsx scripts/auditCounters.ts --project solotravelsoul-57a9e --report <local file outside the repo>` (dry run; no write path).
4. Repairs: a separate approved step, written from the report.

## 8. Native and live verification

Checklist: `docs/release-hardening.md` → "Live and native verification checklist". The staging backend is deployed and live-verified (section 0). **Android:** the preview APK (build `07c0e312`) was installed and the checklist run on an Android 15 emulator on 2026-10-09: results, defects and evidence are in section 10. A second preview build (`aa5c4b9e`, commit `1cc9600`) verified those fixes on the same emulator. A third build (`161e441d`, commit `9d807ca`) verified the offline-banner keyboard fix and live connectivity detection (section 10). **iOS:** BLOCKED (no macOS; device builds need a paid Apple Developer membership). Builds exported with `expo export` and mocked tests are not proof of native UI behaviour.

## 9. Remaining release blockers (authoritative list, 2026-10-10)

This list replaces every earlier blocker list in this file and in `docs/release-hardening.md`. Nothing here is done unless marked so. Evidence for the completed work is in section 10.

**Already done (no action):**
- Staging host consolidated and live-verified.
- Four Android preview builds (EAS Free, 4 of 30 used this billing period, $0) and the native checklist on an Android 15 emulator: all device defects found are fixed and verified.
- Staging admin endpoints verified: a valid token is accepted, missing or wrong tokens are refused, and a stalled/unresolved fixture is reported and cleaned up (2026-10-10).

**A. Required before release (owner decisions or approvals):**
1. **Staging admin token: done (2026-10-10).** Rotated, and the encrypted owner copy is stored (section 10). Valid-token, refusal and stalled-fixture checks pass. Production needs its own token (item 6), handled with the same procedure.
2. **Moderation staffing:** the stores require working reporting, blocking, filtering, timely responses and ongoing moderation (Apple 1.2; Google Play user-generated content). They do **not** set a number of moderators. **Owner decision 2026-10-11:** the owner (Teja) is the primary moderator; the backup is not decided; the response targets in section 11 await the owner's confirmation. Granting the production moderator role is part of the production rollout.
3. **Privacy answers and contact addresses** (section 3):
   - **Decided:** the working mailbox is `ravitejatravelsoul@gmail.com`, and Mapbox and Foursquare stay off.
   - **Fixed in code (2026-10-11):** the published addresses are now `ravitejatravelsoul@gmail.com`. It ships with the production build and Worker deploy; check the deletion page and the Safety, Privacy and Terms screens on the release build.
   - **Open:** confirm the retained media metadata and the production logs items.
4. **Old clients: decided** (the owner confirmed on 2026-10-10: nothing was distributed). No forced update or adoption window; the rules deploy with the first store release (section 5).
5. **Legacy media and test data** (section 6): the owner confirmed disposable test data, so they are deleted, not migrated. Each step is approval-gated:
   - inventory done (section 6, "Production read-only preflight");
   - **B2 done** (77 demo roots deleted 2026-10-10, backup kept);
   - A2 is blocked by the Storage billing restriction (console download or a billing decision);
   - A1 (Swift-era Firestore docs) still needs approval, and B1 (Swift Auth accounts) a decision;
   - the mixed account's `profile_images` object and legacy R2 photo are kept and need migration after the production Worker exists.
6. **Production rollout** (separate approval):
   - KV/D1 bindings, then the Durable Object binding and migration on the production Worker;
   - production secrets (including its own `ADMIN_DELETION_TOKEN`), rules and indexes;
   - the cron decision and monitoring (`scripts/stagingUsage.cjs --script <production>`);
   - then the production account-deletion URL in Play Console (section 2).
7. **Counter audit** (section 7): **done.** 0 mismatches after B2 (2026-10-10); no repair is needed.
8. **Store submission:**
   - production builds;
   - replace the `eas.json` `submit.production` placeholders and provide `google-play-key.json` locally (section 4);
   - store listings.
   No submission has been made.
9. **Physical-device check:** one run of section 10's checklist on a real Android phone before submission; so far only an emulator has been used. The owner has a phone available; its Android version is not yet recorded (it must be Android 7.0 / API 24 or newer for this app).
10. **iOS:** out of scope for the first release (**Owner decision 2026-10-11: Android first**). It would need macOS and a paid Apple Developer membership.
11. **Free/Spark ceilings: accepted for launch** (Owner decision 2026-10-11), with regular usage checks; no paid upgrade without separate approval. The ceilings are about 1,000 uploads/day (KV writes), about 1,000 media deletions/day (KV deletes; the excess completes the next day), about 17,000–25,000 media views/day (Firestore reads), and 100,000 API calls/day.

**B. Staging housekeeping (not release-blocking):**
- Delete the disposable `sts-live-*` accounts left by earlier live-test runs. The native runs removed their own.
- Optional EAS `preview` keys: Mapbox (`EXPO_PUBLIC_MAPBOX_ENABLED`, `EXPO_PUBLIC_MAPBOX_TOKEN`) and Foursquare (`EXPO_PUBLIC_FOURSQUARE_ENABLED`, `EXPO_PUBLIC_FOURSQUARE_API_KEY`). The placeholder map is shown without them.
- `scripts/stagingUsage.cjs` reports the **maximum** per-status p99 over the window, so hours from older versions can dominate. Read it with the per-version breakdown in section 10.

**C. Optional UI features (owner choice; not required for release):**
- A screen to lift a suspension. Moderators can use the console or `unsuspendUser` meanwhile.
- Changing an existing post's visibility. Today it is set only when the post is created.
- A per-account client-side daily report limit. Today it is per device and advisory; the server rules enforce one report per user and item.
- A staging banner in the app. The launcher label already says "SoloTravelSoul Staging".

## 10. Android preview build and device test

**Prerequisites (verified):**
- EAS `preview` holds exactly the eight `EXPO_PUBLIC_*` staging values (Firebase web config from the staging project, Worker URL = media origin).
- `npm run check:staging -- --eas-env <pulled preview> --firebase-metadata <staging SDK config>`: 28/28 PASS.
- **Evaluated Android config:**
  - package `com.solotravelsoul.app`, with no native Firebase file and no Mapbox token in `gradle.properties`;
  - merged-manifest permissions limited to location (coarse, fine), camera, internet, notifications, boot-completed (local reminders), biometrics and vibrate;
  - restricted media, storage, audio, exact-alarm and overlay (`SYSTEM_ALERT_WINDOW`) permissions are removed.
- The preview build is a separate staging app: `app.config.js` with `APP_VARIANT=staging` (set only by the `preview` profile) gives Android package `com.solotravelsoul.app.staging`, label "SoloTravelSoul Staging" and scheme `solotravelsoul-staging`. It installs beside the production app and has its own EAS-managed keystore; production identifiers and credentials are untouched. Mapbox and Foursquare are pinned off in the `preview` profile.

**Build** (owner approval required). In `--non-interactive` mode EAS generates and stores a new keystore for the staging package itself:

```
cd apps/mobile
npx eas build --profile preview --platform android --non-interactive
```

Run interactively instead (without `--non-interactive`) to be asked before the keystore is generated. The build runs in the EAS Free queue and ends with an install URL/QR code for the APK.

**Install** on an Android 10+ device: open the URL/QR on the device and allow installing from that source. With a computer and USB debugging: `adb install -r <downloaded.apk>` (platform-tools and the emulator are installed under `%LOCALAPPDATA%\Android\Sdk`).

**Device test (two disposable staging accounts, A and B; one moderator account granted with `npx tsx scripts/grantModerator.ts --project solotravelsoul-staging --uid <M> --apply`):** run the "Live and native verification checklist" in `docs/release-hardening.md` and record PASS/FAIL with screenshots:
1. **Sign-up and sign-in:** check the staging banner/environment (Firebase project `solotravelsoul-staging`).
2. **Authenticated images:**
   - A uploads a profile photo and a post photo.
   - B sees them only once the post is public.
   - A makes the post private: B's next load fails. (Copies cached on the device may still show; that is expected and documented.)
3. **Token refresh and account switching:**
   - Keep the app open for more than 1 hour and confirm images still load.
   - Sign out of A, sign in as B, and confirm no A-only image is shown.
4. **Uploads:** a photo over 2 MB is rejected with the size message; a normal photo succeeds.
5. **Large groups:** create a group with 10 or more members; all appear; the group stays hidden until creation completes.
6. **Moderation:** three reports hide a post (`under_review`); the moderator removes it; the media stops loading for others.
7. **Suspension:** the moderator suspends B, so B cannot post or upload; unsuspending restores this.
8. **Deletion:**
   - A deletes the account (password re-entry; progress shown) and the app signs out.
   - B sees "Deleted User" in chats and comments.
   - Abandon a second account's deletion mid-way (close the app); confirm the staging cron finishes it within about an hour (`GET /admin/deletion-status`).
9. **Health check afterwards:** `node scripts/stagingUsage.cjs`. For stalled deletions, pass `STS_ADMIN_TOKEN` to that process only, recovered from the encrypted copy (section 10, procedure 2).

### First Android preview build (2026-10-09)

- **EAS build `07c0e312-69a9-4f1f-bf7c-47a71e8c18d2`**, profile `preview`, commit `e02a9e0`, SDK 54, version 1.0.0 (versionCode 1): **FINISHED** (04:28–04:41 UTC). Logs: https://expo.dev/accounts/ravitejatravelsoul/projects/solotravelsoul/builds/07c0e312-69a9-4f1f-bf7c-47a71e8c18d2 · APK: https://expo.dev/artifacts/eas/mCYfUbC9VKRCeGjg938WOC3gWHzet1fmPvF1N0yi8zE.apk
- **How it was built:**
  - From a clean `git worktree` of the pushed commit, so no local uncommitted files were uploaded.
  - `--non-interactive`: EAS generated a new cloud keystore for `com.solotravelsoul.app.staging` only; the production package has no credentials touched.
  - Only the `preview` variables and the profile env were loaded.
  - EAS Free usage afterwards: 1 of 30 builds, no overage, $0.
- **Artifact inspection** (the APK's compiled manifest and resources; not native behaviour):
  - package `com.solotravelsoul.app.staging`, label "SoloTravelSoul Staging", scheme `solotravelsoul-staging`, no native Google/Firebase config.
  - App permissions as introspected: coarse/fine location, camera, internet, post-notifications, boot-completed, biometric, fingerprint, vibrate.
  - Library-merged permissions: network/Wi-Fi state, wake lock, FCM `c2dm.RECEIVE` (expo-notifications), Play install referrer, vendor launcher badge permissions.
  - None of the blocked restricted permissions is present.
- **Native checklist:** run on an emulator on 2026-10-09 (below).

### Native Android verification (2026-10-09, emulator)

- **Device:**
  - No physical device was connected.
  - Android Emulator, AVD `sts_api35`: Pixel 6 profile, Android 15 (API 35), `google_apis` x86_64 image.
  - Accelerated with WHPX, which was already usable. No BIOS, security or host settings were changed. Only the emulator's own stylus-handwriting setting was turned off, because its tutorial pop-up captured keyboard input.
  - The SDK was installed locally under `%LOCALAPPDATA%\Android\Sdk` (free).
- **APK:**
  - The artifact of build `07c0e312-69a9-4f1f-bf7c-47a71e8c18d2` (SHA-256 `ff18ccb6a650beda88685f5f8786fffb66e85b570ae6c79413b7ac6fa6f2e90f`), installed with `adb install -r`.
  - `pm list packages` shows `com.solotravelsoul.app.staging`, versionName 1.0.0 (versionCode 1), minSdk 24, targetSdk 36.
  - It talks only to staging: sign-up and sign-in land in `solotravelsoul-staging`, and media URLs are on the staging Worker.
- **Fixtures:**
  - Disposable accounts A, B, moderator M, reporters R1–R3, group members G1–G9 (`tests/staging/live.cjs setup` / `accounts`), and SU (created through the app's sign-up screen).
  - All were deleted afterwards through the app's own deletion endpoint, and every job is `completed`. The moderator grant, the test group and the 4 report documents created by this run are gone. All 6 remaining media rows are `removed` with no pending KV deletes.
- **Evidence:** `docs/evidence/native-android-2026-10-09/`:
  - 32 screenshots (named by step);
  - `logcat-app-sanitized.txt`: app and crash buffers; no app crash; the only fatal entries are the Google Search app during an emulator system restart;
  - `g1-abandoned-deletion-watch.txt`;
  - `test-release-summary.txt`.

| # | Checklist item | Result | Notes |
|---|---|---|---|
| 1 | Sign-up and sign-in | **PASS** | Sign-up through the UI creates the user in `solotravelsoul-staging` and opens the feed; sign-in through the UI for A, B, M, R1–R3 and G1. The app has **no staging banner**: the environment is visible only as the launcher label "SoloTravelSoul Staging". |
| 2 | Authenticated images | **PASS** | Post and profile photos upload to opaque `/media/<id>` URLs (D1 `active`, `purpose` post/profile); B sees A's public post and profile photo. A made a post private: it left B's Explore, and the Worker returns 404 (`private, no-store`) to B and 200 to A. There is **no UI to change an existing post's visibility**, so that write was made as A through the client SDK (`live.cjs set-visibility`) under the real rules. Already downloaded images are served by Android's image cache without contacting the Worker; the cache is device-wide, not per account (the documented limitation). |
| 3 | Token refresh and account switching | **PASS** | After the app process had run about 62 minutes (Android restarted it during a 9-hour idle period), B uploaded a photo and the new, never-cached Worker image rendered: the media token was refreshed in-process. After A → sign out → B, A's private post was not shown, and the composer draft did not carry over. |
| 4 | Uploads | **PASS (expectation corrected)** | A normal photo uploads. A 4.2 MB photo is cropped and resized on the device (1024 px JPEG, quality 0.8) to 559 KB and accepted, so the "max 2 MB" message is unreachable through the picker. The Worker's 413 stays covered by `npm run test:release` and the live test. |
| 5 | Large groups (10+) | **PASS** | B created "Native Big Group" with 9 invitees: the app shows 10 members; Firestore `members` = 10, `pendingMembers` = []; member G1 sees it. The intermediate hidden state was too short to observe (end state only; the rules/emulator tests cover it). |
| 6 | Moderation | **PASS** (defects fixed in code) | Three UI reports (R1–R3) → `reportCount` 3, `under_review`, gone from Explore. M previewed it in the queue (photos load) and removed it → `removed`, images cleared, both media rows `removed` with KV purged, Worker 404 for B. Defects: see below (report submit tap, "This message" label, sibling reports left open). |
| 7 | Suspension | **PASS** (defects fixed in code) | M suspended B with "Suspend author": the upload is refused (403), the post write is refused and no message is stored. Unsuspension has **no UI** (`unsuspendUser` exists, unused); M lifted it through the client SDK (`live.cjs unsuspend`). B could then post, upload and message. Defects: misleading upload message, silent post failure, and the refused message being queued and **delivered after unsuspension**. |
| 8 | Deletion | **PASS**; admin endpoint **BLOCKED** | **A (in the app):** password re-entry, a progress spinner, then signed out in about 4 s. The job completed in 3 slices / 25 steps, and `verify-deleted a` passed (Auth gone, data removed, 4 media rows purged). **B afterwards:** sees "Deleted User" in the DM list and thread. A's comment shows as "(Comment deleted)" (a tombstone), and B's post `commentCount` went 1 → 0. **G1 (abandoned):** the app was force-stopped 1 s after confirming (15:13:27Z; job `in_progress`, 19 steps). The staging cron resumed it at 15:16Z and completed it at 15:21:10Z (3 attempts, 25 steps). The group went 10 → 9 members, and G1's message shows "Deleted User". `GET /admin/deletion-status`: BLOCKED (the staging admin token is not available here); the job was checked read-only in Firestore instead. |
| 9 | Health check | **Run; attention** | `node scripts/stagingUsage.cjs`: every Free limit is ≤ 20.1% used (KV writes the highest); 0 Worker errors; **1 Durable Object error**; front Worker CPU p99 12.29 ms (above the 10 ms Free reference). Stalled deletions were not checked (no admin token). |

**Defects found on the device:**
- All are fixed in code, with regressions in `tests/release/app.cjs` that fail on the old code and pass now; `npm run test:release` passes.
- None is verified natively yet: that **requires a new preview APK**, which this phase did not build.

1. **Notification bell (Home and Profile) and Saved Posts** opened "Unmatched Route". They pushed `/(app)/…/index`; they now push the folder route.
2. **The keyboard covers text inputs on Android 15** (comments sheet, chats, composers, sheets). Edge-to-edge means the window no longer resizes, and every `KeyboardAvoidingView` was disabled on Android. All 15 now use `behavior="padding"`.
3. **The New Post composer kept the previous post's photos and caption after sharing**: a second post re-uploaded the first photo. The form is now cleared after a successful share, and a refused post shows "Post not shared" instead of failing silently.
4. **Profile stats row clipped** on a phone-width screen (the Posts count was invisible). The six stats now share the row.
5. **Report sheet:**
   - The first tap on Submit only dismissed the auto-focused keyboard (`keyboardShouldPersistTaps="handled"`).
   - Posts were labelled "This message".
6. **Moderation:** removing an item resolved only the report that was opened, and the others on the same item stayed in the queue. One decision now resolves every open report on that item.
7. **Suspended uploads** said "Please sign in again". The Worker's `account/restricted` 403 now gives "This account can no longer upload photos."
8. **Chat sends refused by the rules** (suspended) were queued and delivered after the suspension was lifted. A `permission-denied` send is now dropped with a toast and not queued (DMs and groups).

**Not fixed (owner decisions):**
- No UI to lift a suspension or to change an existing post's visibility.
- The client-side daily report limit (5) is stored per device, not per account. It is advisory only; the server rules enforce one report per user and item.
- There is no staging banner.

### Second preview build: fix verification (2026-10-09)

- **Build:**
  - EAS build `aa5c4b9e-f7a2-41ae-a061-447ea129b19f`, profile `preview`, commit `1cc9600`, built from a clean `git worktree` of the pushed commit: **FINISHED**.
  - APK: https://expo.dev/artifacts/eas/YiJfBp6Gcf6rZqKEZVDHx9YvRDxDabsHzS1lAbr_7K4.apk (SHA-256 `08e3982ec73c4544409d0b816848ece830aad31cc3e9b2ed844cedf43c6529f8`), package `com.solotravelsoul.app.staging` 1.0.0 (1).
  - EAS Free usage afterwards: 2 of 30 builds, $0.
- **Device:** installed with `adb install -r` on the same Android 15 emulator, with app data cleared first.
- **Fixtures:** A, B, M (moderator), R1–R3. All were deleted afterwards (jobs `completed`). The moderator grant, the group, the A–B DM thread and the 3 report documents created by this run were removed. The remaining media row is `removed` with no pending KV delete.
- **Evidence:** `docs/evidence/native-android-2026-10-09-build2/` (28 screenshots; `logcat-app-sanitized.txt`, with no app crash or exception).

**Queue correction in this build (`1cc9600`):**
- A queued DM or group send that the server refuses with `permission-denied` is now dropped under the queue lock. It is reported in `rejected` (also counted as failed); its pending bubble is cleared, and the user sees "N queued messages were not sent".
- Network failures still stop the drain and keep the send; other errors still retry. Per-user queues and single-flight draining are unchanged.
- Behaviour tests: `tests/release/chatQueue.cjs` (11) covers the queue, both chat hooks (online denial, online transient failure, offline queue then denial) and the sync-engine report. The queue and offline tests fail on the old queue code, and the online-denial tests fail on the hooks from before the last fix.

| # | Defect | Result on build `aa5c4b9e` |
|---|---|---|
| 1 | Notification bell (Home, Profile) and Saved Posts | **PASS**: all open their screens. |
| 2 | Keyboard covers inputs | **PASS online**: comments sheet, DM and group inputs sit above the keyboard; send works with the keyboard open. **FAIL while offline:** the global offline banner pushes the screens down, and the chat input sits behind the keyboard by the banner's height. Fixed in code afterwards (the banner now overlays the status-bar area, with a regression check); verified on the third build (`161e441d`, below). |
| 3 | Composer kept the previous post; refused post failed silently | **PASS**: the composer reopens empty after sharing; a refused post shows "Post not shared". |
| 4 | Profile stats clipped | **PASS**: all six stats are visible. |
| 5 | Report sheet: first tap; "This message" | **PASS**: the label is "This post". Submit worked on the first tap in all three reports. The keyboard was confirmed showing (`mInputShown=true`) in the two where it was measured. |
| 6 | Sibling reports left open | **PASS**: two reports on one post; one Remove → both `actioned`, the post `removed`, gone from the queue. |
| 7 | Suspended upload message | **PASS**: "This account can no longer upload photos." |
| 8 | Refused chat sends queued and delivered after unsuspension | **PASS**: see below. |

Defect 8, in detail:
- **Online:** DM and group sends while suspended show "Message not sent…" and leave no bubble.
- **Offline, app's own queue:** with airplane mode on and the app reopened, a DM and a group message were queued. After reconnecting (B still suspended), the app reported "2 queued messages were not sent…" (captured in the UI dump; the screenshot was taken a moment earlier), and both bubbles cleared.
- **After unsuspension:** M lifted the suspension and the app drained again. **None of the refused messages exists on the server**, while a new group message was delivered.
- **Firestore's own buffer:** if the app is offline but has not noticed (see below), Firestore's client SDK holds the write instead of the app's queue. When the app returned to the foreground it was refused, and the online path removed it the same way.

**Observation (fixed in `9d807ca`, verified on the third build below):** `useNetworkState` re-checked connectivity only on mount and when the app returned to the foreground. While the app stays open, losing the network is not detected: no offline banner appears and sends are not queued by the app (Firestore's own buffer holds them).

**Health re-check (analytics, fresh window):**
- The 12.29 ms front-Worker CPU p99 reported earlier comes from version `e784bd26` (the pre-consolidation worker-mode build) in the hours before 10-09 02:19Z. That window includes the consolidation deploy and the rollback test.
  - The script reports the **maximum** of per-status-group p99s over 24 h.
  - Since version `b228b58f` (object mode, from 02:19:23Z) the hourly front p99 is 0.64–2.98 ms, with no Worker errors.
- The single Durable Object error falls in the 15:00Z hour, with status `clientDisconnected` and no exception recorded in analytics. It **probably** comes from the deliberate force-stop of the app during the abandoned-deletion test (15:13:27Z), which falls in that hour; the front Worker logged 2 `clientDisconnected` requests in the same hour.
- Workers Logs could not be read with the local Wrangler OAuth token (Telemetry API "Authentication error"), so the exact request is not proven. No defect was reproduced; nothing was redesigned.

**Admin checks:** `GET /admin/deletion-status` is BLOCKED; no staging admin token is available to this run.

### Third preview build: live connectivity and offline keyboard (2026-10-10)

- **Build:**
  - EAS build `161e441d-4ea4-4f19-a635-e1682f547a78`, profile `preview`, commit `9d807ca`, built from a clean `git worktree` of the pushed commit: **FINISHED**.
  - APK: https://expo.dev/artifacts/eas/QSWUn8CpLnivgUWT73t0d8CxFiNdoNdhM0kRHFOIgJY.apk (SHA-256 `743a4183fb6992a34b61d7e2cc73af9e89af74a0aff67ec1fb73d7bf95600557`).
  - EAS Free usage afterwards: 3 of 30 builds, $0.
- **Device:** installed with `adb install -r` on the same Android 15 emulator, with app data cleared first. Connectivity was toggled with airplane mode while the app stayed in the foreground.
- **Fixtures:** A, B, M (moderator), R1–R3. All were deleted afterwards (jobs `completed`). The moderator grant, the group and the A–B DM thread were removed; this run created no reports.
- **Evidence:** `docs/evidence/native-android-2026-10-10-build3/` (14 screenshots; `logcat-app-sanitized.txt`, with no app crash or exception).

**Changes in this build:**
- `useNetworkState` now also subscribes to expo-network's live listener. The checks on mount and on return to the foreground and `recheck()` are kept.
- Every check and event is sequenced, so an older async check can't overwrite a newer event. Both subscriptions are removed on unmount.
- The status-bar overlay banner (`9db701e`) shows a short, centred "No internet connection" label; the full sentence is its accessibility label.
- Behaviour tests: `tests/release/network.cjs` (6). They cover:
  - live disconnect/reconnect;
  - the stale-check race;
  - subscription cleanup;
  - the banner, chat hook and sync engine together: an offline send is queued and delivered exactly once after reconnect, a write already in flight is not queued twice, and a refused queued send is never delivered.

  Five of the six fail on the previous hook.

| Check (build `161e441d`) | Result |
|---|---|
| Disconnect while staying in the app | **PASS**: the offline banner appeared within about 1 s and the chat showed "Offline — messages will send when reconnected"; no backgrounding. |
| Reconnect while staying in the app | **PASS**: the banner disappeared within about 3 s and the queue drained. |
| Banner | **PASS**: drawn in the status-bar band, readable between the clock and the system icons; screens are not shifted. The Home screen keeps its own inline banner (Home has no text inputs). |
| Keyboard: DM, group, comments, composer | **PASS online and offline**: the inputs and send controls sit above the keyboard; sending works with the keyboard open. The composer's lowest field (hashtags) moves above the keyboard, and positions are identical online and offline. |
| Offline messages deliver exactly once | **PASS**: one DM and one group message sent while offline were each stored exactly once after reconnect. Unread counters for the recipient: 2 per chat (no double count). |
| Refused messages never deliver | **PASS**: B suspended (moderator, client SDK: `live.cjs suspend`), DM and group messages queued offline, reconnect → "2 queued messages were not sent…" and the bubbles cleared. After unsuspension and another disconnect/reconnect, neither refused message exists on the server, while a new group message was delivered once. |
| `GET /admin/deletion-status` | **BLOCKED**: no staging admin token available. |

### Fourth preview build: contact addresses (2026-10-11)

- **Source:** commit `3766425`. **Staging Worker:** version `fdce6651-d034-462f-a36e-61b8e32b2c95` (`npx wrangler deploy --env staging`; the previous version `b8392e10` is the rollback target). Bindings unchanged; the long-standing `r2_buckets` warning is expected (staging has no R2).
- **EAS build:** `bc55069f-621d-4b13-9fa9-84f19d3edd70` (profile `preview`, FINISHED 2026-10-12T00:42:56Z). APK: https://expo.dev/artifacts/eas/HcpeKC9Cv4a0gESJhIjpNy3VoHqThspoSLvrN3MYyaA.apk (SHA-256 `207b3e3494d85726caaf4eb9e3c9ef8330073db56b6ddcb0c222fe9df897a18`), package `com.solotravelsoul.app.staging` 1.0.0 (1).
- **EAS Free usage:** checked before building with `eas account:usage` (plan Free, 3 of 30 used, overage 0). Afterwards 4 of 30, $0.

| Check | Result |
|---|---|
| Deployed deletion page (`GET /account-deletion` on staging) | 200 `text/html`. Displays `ravitejatravelsoul@gmail.com`; both links are `mailto:ravitejatravelsoul@gmail.com` (one with the subject "Delete my SoloTravelSoul account"); no `@solotravelsoul.app` text. |
| APK installed on the emulator (Android 15, `sts_api35`) | `adb install -r` succeeded over the previous preview (lastUpdateTime 2026-10-11 19:43). |
| Privacy Policy (opened from Create account) | Data deletion: "...contact ravitejatravelsoul@gmail.com..." and "...email ravitejatravelsoul@gmail.com."; Contact: "For privacy questions, safety concerns and account deletion requests: ravitejatravelsoul@gmail.com". |
| Terms (opened from Create account) | "Contact: ravitejatravelsoul@gmail.com". |
| Safety & Guidelines (signed in, disposable staging account) | Legal & Support row shows `ravitejatravelsoul@gmail.com`. |
| Tap on Safety's email row | Android started Gmail `ComposeActivityGmailExternal` with `act=VIEW dat=mailto:ravitejatravelsoul@gmail.com`, `launchedFromPackage=com.solotravelsoul.app.staging` (from `dumpsys activity`). Gmail has no account on the emulator, so it showed its welcome tour instead of a compose screen; the recipient was read from the intent. |
| Deletion messages | `tests/release/accountDeletion.cjs`, "client deletion messages that name a contact use the working mailbox": the real `useAuth` hook with the real `constants/contact.ts` produces the unavailable, blocked and in-progress messages, each naming `ravitejatravelsoul@gmail.com`. 70/70 deletion checks; all release suites pass. |
| Cleanup | The disposable account was deleted through the app's Delete account flow (app returned to sign-in). Staging Auth lookup by its email: 0 users. |

**Notes:**
- An emulator "System UI isn't responding" dialog appeared once at launch (emulator load, not the app) and was dismissed with Wait; adb went offline once briefly and reconnected.
- The staging feed still shows posts by "Live B" from earlier live-test runs; these are the leftover disposable accounts listed in section 0, not data from this run.
- One sign-in attempt for the disposable account went by mistake to **production** Auth (`apps/mobile/.env` holds the production config). It was read-only, returned `INVALID_LOGIN_CREDENTIALS`, and changed nothing; the staging check above is the real result.

### Staging operational closure (2026-10-10, commit `9aa1db3`)

| Check | Result |
|---|---|
| Admin credentials available to this run | **None at the time** (resolved below by rotation): not in the process, user or machine environment, nor in Windows Credential Manager. The token was not rotated: the owner may hold the only working copy, and storage of a new one could not be confirmed. The Worker secret `ADMIN_DELETION_TOKEN` is set on staging (secret names listed only). |
| Missing / wrong credentials refused | **PASS**: `GET /admin/deletion-status` with no `Authorization`, an empty bearer, a random wrong bearer or a non-Bearer scheme → 403 `{"error":"Forbidden"}` each. `POST /admin/account-deletion` with a wrong bearer → 403. (A 403 rather than 404 also confirms the secret is configured.) |
| Valid credentials return the status | BLOCKED at the time; **PASS** below |
| Disposable stalled / unresolved fixture reported, then removed | BLOCKED at the time; **PASS** below |
| Read-only job state (not the endpoint) | 0 `in_progress`, 0 `failed`, 0 `blocked` jobs (none older than 6 h); pending-finalization: none. |
| `node scripts/stagingUsage.cjs` (24 h, sanitized) | Worker requests 827 (0.83% of the Free daily limit), Durable Object requests 755 (0.76%), Durable Object GB-s 243 (1.87%), D1 rows read 14,652 (0.29%) and written 3,118 (3.12%), KV reads 438 (0.44%), writes 202 (20.20%), deletes 185 (18.50%). Worker errors 0; Worker CPU p99 9.16 ms. **1 Durable Object error**: the `clientDisconnected` event at 10-09 15:00Z, **probably** from the deliberate force-stop test (not proven). Per-version CPU above 10 ms appears only in pre-consolidation hours (`e784bd26`). Stalled deletions not checked (no token). |

**Admin access recovered (2026-10-10, after the table above):**

The staging `ADMIN_DELETION_TOKEN` was rotated, with your authorization, and every check above that was BLOCKED was then run:

| Check | Result |
|---|---|
| Valid token → `GET /admin/deletion-status` | **PASS**: HTTP 200 `{stalled, count, legacyMediaUnresolved, checkedAt}`; baseline `count=0`, 0 unresolved. |
| Wrong token / token one character off / no `Authorization` | **PASS**: 403 `{"error":"Forbidden"}` each. |
| Isolated stalled + unresolved fixture | **PASS**. One disposable account received `accountDeletions/{uid}` (`in_progress`, step `directory`, started 7 h earlier, lease held 3 h so the cron skips it) and `legacyMediaCleanup/{uid}` (`unresolved`). The endpoint reported `count=1`: that uid as stalled (status `in_progress`, step `directory`, attempts 1, age 7 h) and as unresolved legacy media. |
| Fixture removal | **PASS**: exactly those two documents were deleted, then the account was deleted through `POST /account/delete` (`verify-deleted`: job completed, Auth gone, 0 media rows). The endpoint is back to `count=0`, 0 unresolved. |
| `node scripts/stagingUsage.cjs` with the token (24 h) | Worker requests 884 (0.88%), Durable Object requests 815 (0.81%), Durable Object GB-s 246 (1.89%), D1 rows read 13,672 (0.27%) and written 2,023 (2.02%), KV reads 272 (0.27%), writes 127 (12.70%), deletes 130 (13.00%). Worker errors 0; Worker CPU p99 7.51 ms; **stalled deletions 0; unresolved legacy media 0**. Exit 1 only because of the single Durable Object error, the `clientDisconnected` invocation at 10-09 15:00Z. It is **probably** the deliberate force-stop during the abandoned-deletion test (same hour, a client-disconnect status, no exception), but the exact request was not proven. |

**Rotation incident, kept for the record (no exposure):**
- The first two uploads stored a UTF-8 byte-order mark (U+FEFF) in front of the token. In Windows PowerShell 5.1, a child process's redirected stdin uses `[Console]::InputEncoding`, whose UTF-8 encoder writes a preamble, even when bytes are written to the base stream. Wrangler trims only trailing whitespace.
- A local probe that reads stdin the way Wrangler does showed 44 characters starting with U+FEFF. With `[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)` it received exactly the 43-character token, and the third upload worked.
- No value was displayed or logged at any point.

### Staging admin credential: encrypted owner copy and procedures

- **Location:** `%APPDATA%\SoloTravelSoul\staging-admin-deletion-token.dpapi`, i.e. `C:\Users\ravit\AppData\Roaming\SoloTravelSoul\staging-admin-deletion-token.dpapi`. It is outside the repository.
- **Protection:** Windows DPAPI, `CurrentUser` scope. Only the Windows user `ravit` on this PC can decrypt it.
  - The file ACL has inheritance removed and grants that user read/write; SYSTEM and Administrators keep their default entries, but they cannot decrypt user-scoped DPAPI data without this user's credentials.
  - Contents: the encrypted UTF-8 bytes of a 43-character base64url token (32 random bytes from the OS CSPRNG). There is no plaintext copy anywhere.
- **If the Windows profile or PC is lost, the copy is lost.** This is staging only: rotate again with procedure 3. Optionally keep a second copy in your password manager by decrypting it locally (procedure 1) and pasting it there yourself.
- **Never** put the value in command arguments, persistent environment variables (`setx`, `SetEnvironmentVariable`), logs, chat or the repository.

**1. Recover into memory (nothing is shown):**
```powershell
Add-Type -AssemblyName System.Security
$file = Join-Path $env:APPDATA 'SoloTravelSoul\staging-admin-deletion-token.dpapi'
$t = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file), $null, 'CurrentUser'))
"recovered: length $($t.Length)"   # expect 43; never print $t
```

**2. Use it** (with `$t` from step 1):
- **Status check** (prints the response, not the token):
  ```powershell
  Invoke-RestMethod -Uri 'https://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev/admin/deletion-status' -Headers @{ Authorization = "Bearer $t" }
  ```
- **Usage check:** the token goes to the child process only.
  ```powershell
  $psi = New-Object Diagnostics.ProcessStartInfo 'node', 'scripts/stagingUsage.cjs'
  $psi.WorkingDirectory = '<repo>'; $psi.UseShellExecute = $false
  $psi.EnvironmentVariables['STS_ADMIN_TOKEN'] = $t
  [Diagnostics.Process]::Start($psi).WaitForExit()
  ```
- Clear it afterwards: `$t = $null`.

**3. Rotate** (staging only; store first, never discard the only working copy):
1. Generate 32 random bytes with `[Security.Cryptography.RandomNumberGenerator]` and encode them as base64url. Encrypt with `ProtectedData.Protect(..., 'CurrentUser')` and write to a **new** file. Keep the old file until step 4 passes.
2. Decrypt the new file in a fresh PowerShell and check the length (procedure 1).
3. Upload through stdin with **no BOM**:
   ```powershell
   [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
   $psi = New-Object Diagnostics.ProcessStartInfo 'cmd.exe', '/c npx wrangler secret put ADMIN_DELETION_TOKEN --env staging'
   $psi.WorkingDirectory = '<repo>\workers\r2-upload-worker'
   $psi.UseShellExecute = $false; $psi.RedirectStandardInput = $true
   $p = [Diagnostics.Process]::Start($psi)
   $b = [Text.Encoding]::UTF8.GetBytes($t)
   $p.StandardInput.BaseStream.Write($b, 0, $b.Length)
   $p.StandardInput.Close(); $p.WaitForExit()
   ```
   Without the first line, Windows PowerShell 5.1 prefixes U+FEFF and every request is refused.
4. Check `GET /admin/deletion-status` with the new value: expect 200. Then replace the old file with the new one.

### Staging demo feed (2026-10-11, seed `sts-demo-feed-v1`)

A realistic feed for physical-phone testing, on staging only.

**What it is**
- 8 fictional travelers, each named "… (Demo)" with a bio starting "Demo profile (fictional).", public profiles and generated initials avatars.
- 24 photo posts (4 two-photo carousels) across 24 places in 11 countries; 4 photo journals (cover plus 2 gallery photos each). Every post and journal carries `#demo`; journals end with "This is a demo journal written for testing the app. The traveler is fictional."
- 27 follows, 96 likes (84 on posts, 12 on journals) and 25 comments (6 of them replies), all between demo accounts.
- 1 QA viewer account ("QA Viewer (Demo)", private profile, no content) for emulator checks.
- 48 photos (40 scene photos, 8 avatars) generated locally by `scripts/stagingFeedImages.py`; each carries a "DEMO · <place>" label. No third-party photos, no named or rated businesses (no reviews), no real people.

**How it is written:** `scripts/seedStagingFeed.cjs`, content in `scripts/stagingFeedContent.cjs`.
- Every write goes through the app's own `packages/firebase` modules with the client SDK, signed in as the demo account (real security rules). Photos go through the staging Worker's `POST /media/upload` (real KV/D1 media; views use the normal access rules).
- Before every run it checks: the staging section of `wrangler.toml` (Worker name and `FIREBASE_PROJECT_ID = solotravelsoul-staging`), `scripts/checkStagingIsolation.cjs`, the Firebase web config fetched for `solotravelsoul-staging`, each signed-in token's `aud`, and that the staging Worker is serving. It never reads `apps/mobile/.env`.
- The Firebase CLI owner login is used read-only (Auth lookup by email, Firestore REST reads); D1 is read with `wrangler d1 execute`.
- State, outside the repo, in `%LOCALAPPDATA%\SoloTravelSoul\staging-demo-feed\`: `manifest.json` (every account, document path and media ID, keyed by stable content keys), `credentials.json` (generated passwords, 0600, never printed) and `images\`.
- Reruns are idempotent. Accounts, posts, journals, likes, follows and comments are skipped when the manifest has them; posts, journals and comments carry `demoKey` = `sts-demo-feed-v1:<key>` so an interrupted run adopts what it already created; likes and follows use the app's fixed document IDs. An account that exists in Auth but not in the manifest stops the run. Journal text is synced in place.

**Commands** (from the repo root):

```
node --no-warnings scripts/seedStagingFeed.cjs plan            # dry run
node --no-warnings scripts/seedStagingFeed.cjs seed --apply    # create or complete
node --no-warnings scripts/seedStagingFeed.cjs verify          # read-only checks + media views
node --no-warnings scripts/seedStagingFeed.cjs cleanup         # dry run of cleanup
node --no-warnings scripts/seedStagingFeed.cjs cleanup --apply --confirm sts-demo-feed-v1
```

Cleanup deletes only the manifest's 9 accounts, each through the app's account deletion (`POST /account/delete` with that account's own token), which removes their posts, journals, likes, follows, comments and media. It then checks every manifest document and media row and the Auth accounts. A deletion that does not complete stops the run and is not retried automatically. Likes, follows or comments that other accounts (yours included) leave on demo content go with it.

**Results (2026-10-11)**

| Check | Result |
|---|---|
| Quota before seeding (`scripts/stagingUsage.cjs`, 24 h) | Every Free limit ≤ 2.3% used; 0 errors. The seed added about 48 KV writes (~5% of the daily limit) and about 500 Firestore writes (~2.5%). |
| Targeted tests | `tests/release/stagingFeed.cjs` 5/5 (now part of `npm run test:release`); release suites all pass; `npm run test:rules` all pass (82 rule checks, 56 deletion, 11 media, 7 end-to-end, 7 demo-cleanup). |
| Seed | Created 9 accounts, 48 media, 24 posts, 4 journals, 27 follows, 96 likes, 25 comments. `verify` PASS: every counter matches (likes, comments, followers, following), all 48 media rows active, the viewer gets 48/48 photos (posts and journals `private, max-age=300`), anonymous 401, no deletion barrier on any demo account. |
| Rerun | Nothing new created; Firestore holds exactly 24 posts, 4 journals and 25 comments with the seed key (no duplicates). |
| Cleanup dry run | Would delete 9 accounts, 194 documents and 48 media items. `--apply` without `--confirm` is refused. Not run: the feed stays for phone testing. |
| Emulator, preview `bc55069f`, signed in as the QA viewer | **Feed:** photos, avatars, captions, `#demo` tags, like/comment counts and the carousel indicator render; scrolling reaches the end after 20 posts (see note on limits). **Like:** heart fills, post screen shows 2 → 3. **Comment:** posted and shown as "QA Viewer (Demo)"; deleted again ("(Comment deleted)" placeholder); the like was removed again, and `verify` passed afterwards. **Profile:** a demo traveler's profile opens with avatar, bio, styles, interests and countries. **Journal:** cover photo, title, author, likes, text and tags render. **Explore:** Trending Destinations and Popular Journals show demo content. **Moderation controls:** "Report or block" on posts, REPORT / BLOCK on profiles. |

**Notes from the UI check (app behaviour, not changed in this phase):**
- **Home feed limits:** up to 50 posts from followed travelers plus the 20 most-liked public posts; no cursor pagination ("load more"). Explore lists the 30 newest. The app has **no follow button** and no screen listing another traveler's posts, so an account that follows nobody sees the top 20 trending posts.
- Counts on feed cards and the post screen are read once; they update after a refresh or reopening.
- Journal gallery photos (`images`) are attached and authorized but the journal screen shows only the cover (the app's own journal composer saves no gallery photos).
- Journal bodies are plain text in the app (no Markdown rendering), so the demo journals use plain text.
- Explore's "PT · 36 posts" tile is leftover live-test content (section 0), not the demo feed.

**Refreshing the feed on a phone** (preview APK, signed in to your staging account): pull down on the Feed to refresh; Explore reloads when the tab opens; if counts or text look stale, close the app fully and reopen it.

### Travel compatibility onboarding (2026-10-17)

Helps travelers find suitable companions for a specific trip from preferences they chose to state. Built on the existing profile, discovery (`nearbyTravelers`), public-trip, join-request and chat flows; no new collections, services or paid APIs.

**Flows**
- **Sign-up → optional setup** (`app/(app)/profile/preferences.tsx`): 7 short steps (travel styles, interests, languages, pace, schedule, group size, sharing), progress "Step n of 7 · optional", Back, Skip (question) and "Skip setup for now". Every step saves, so leaving and returning resumes at the saved step. Existing users and part-way users see "Set up / Finish your travel preferences" on Community; finished or skipped setups are not offered again.
- **Editing later**: Edit Profile shows the same questions (shared `PreferenceField` component and `sanitizePreferences()`); Privacy Settings links to the setup.
- **New preferences only where missing**: pace (relaxed/balanced/active), schedule (planned/spontaneous), group size (one companion / small group / larger group). Styles, interests and languages are the existing profile fields. Destination, dates and budget stay on trips.
- **Find travel companions** (`app/(app)/community/companions.tsx`; entry from Community, from your own trip, and from Nearby Travelers): pick one of your upcoming trips; see travelers who shared a trip to the same destination and public trips there, ranked by date overlap first, then stated preferences. Each card shows a level ("Strong match", "Good match", "Some overlap", "Not enough information"), the reasons, real differences, and "Not provided: …". Missing answers are never a mismatch. Actions are the existing **View profile** and **View trip → Request to Join**; nothing is sent automatically. Destination-only browsing (Nearby Travelers) stays, now with the same explanations per card.
- **Matching** (`packages/shared/src/compatibility.ts`): deterministic and documented; runs on the device; no scores shown, no inference, no safety judgement.

**Data, consent and privacy**
- Stored on the user's own `users/{uid}`: `travelPace`, `travelSchedule`, `groupSizePreference`, `shareCompatibility` (default off), `preferenceSetup` (status, step), `discoveryTripId`.
- The discovery record `nearbyTravelers/{uid}` exists only while the profile is public **and** discovery is on (unchanged opt-in). It now also holds interests and languages (already public on the profile), pace/schedule/group size **only with `shareCompatibility`**, and the destination and dates of **one trip the user chose** in Privacy Settings ("Trip shown in discovery"). Never itinerary, notes, exact location or contact details. Withdrawing consent, choosing "Don't show a trip", going private or turning discovery off rewrites or removes the record at once (verified in the app).
- Privacy policy text updated (community features and data deletion).

**Rules** (`firestore.rules`, verified in the emulator, **not deployed**)
- `users/{uid}`: new preference fields validated when they change (allowed values, list sizes, setup record); older profiles with legacy values keep saving other fields.
- `nearbyTravelers/{uid}`: only listed fields; owner-only; requires public profile + discovery opt-in on the owner's user document; pace/schedule/group size require `shareCompatibility`; a shared trip must be complete (key, destination, both dates, end ≥ start); `updatedAt` = request time; text filter; reads by query capped at `limit ≤ 50`; delete by the owner or a moderator.
- `publicTrips`: optional `destinationKey` (≤ 80 chars), written on publish.
- **Join requests (existing flow, fixed)**: the app read the organizer's block list before every request, which the rules forbid, so every "Request to Join" failed and showed "Already requested". Blocking (either direction) is now enforced by the rules on create; the client no longer reads the block list; "Already requested" is shown only when a pending request exists, otherwise "Request not sent". Cancelling on the trip screen now cancels on the server (before, only the screen changed), and a requester may ask again after cancelling (not after a rejection).

**Deletion, suspension, blocking**
- Account deletion: new first step `discovery` removes `nearbyTravelers/{uid}` as soon as deletion starts (the final `privateData` step still removes it and `users/{uid}` with the new fields). The Worker change needs a deploy to take effect on staging.
- Moderator suspension (`suspendUser`) also removes the discovery record; suspended and deleting accounts cannot write it back.
- Blocked users and yourself are hidden from candidates; opening a profile still enforces blocking in the rules; join requests to/from blocked users are refused.

**Reads and writes (Spark)**
- Companion screen, per open or refresh (one-shot, no listeners): 1 query ≤ 30 discovery records + 1 query ≤ 20 public trips + 1 batched `in` query ≤ 30 owner records = **≤ 80 document reads, 3 queries** (an empty result still counts 1 read per query). About 600 worst-case loads use the 50,000 daily reads.
- Nearby Travelers destination search: unchanged listener, limit 50, now an equality on `destinationKey` (single-field index; no new composite index).
- Writes: one `users` update per setup step (≤ 7), plus a public-profile and discovery upsert when public/discoverable; privacy toggles 2 writes. Rules: discovery writes add 1 `get(users)`; join-request creates add 2 block `exists()`.

**Verification**
- `tests/release/compatibility.cjs` (17 checks, part of `npm run test:release`): matching, missing/partial answers, date overlap, ranking, determinism, skip/resume/edit, old and demo profiles, consent and record contents, rules/app option parity, bounded reads, blocked/self/deleting/suspended guards, join-request fixes, privacy text.
- `tests/release/rules.cjs` (emulator, 92 checks): +10 for preferences, discovery opt-in/consent/withdrawal, field and trip validation, query limit, suspended/deleting writers, moderator removal, public-trip key, and join requests (create, blocking both ways, deleting organizer, cancel, ask again, rejection stands).
- All release and emulator suites, mobile and Worker typechecks, lint (no new findings) and the Android export pass.
- **UI** (2026-10-17): the app ran in **Expo Go** on the Android 15 emulator against **staging** (EAS preview environment pulled to a scratch file, `checkStagingIsolation` passed including resource ownership, `.env` loading disabled). Verified: sign-up → setup step 1 of 7; three answers; leaving mid-way; Community "Finish your travel preferences" resumed at step 4; skip a question; finish (sharing off, no discovery record); edit schedule and group size in Edit Profile (saved); companions for a Lisbon trip: "Strong match" with 6-day overlap and reasons plus one difference, "Not enough information" with dates not overlapping and "Not provided" (consent off), public trip with organizer preferences; Request to Join created on staging, cancel reached the server, asking again showed "Request not sent" (staging still has the old rules); consent withdrawal and "Don't show a trip" cleared the record; own-trip "Find travel companions" row; Nearby Travelers explanations.
- **Native (preview APK) verification: BLOCKED** — needs an updated binary (no EAS build in this phase). In Expo Go, photos return 401 and push is unavailable (Expo Go limitations, not this feature).
- Fixtures: four discoverable test accounts with Lisbon trips (`tests/staging/live.cjs compat`) plus the sign-up test account; all five removed with `delete-user` and confirmed with `verify-deleted`. Demo feed untouched.

**Not changed (listed for later)**
- Public trips published before this change have no `destinationKey`, so companion matching does not find them (destination browsing still does); no backfill was run.
- The discovery record is refreshed when profile, preferences or privacy settings are saved; editing a shared trip's dates does not refresh it until the next such save.
- Firestore list rules cannot hide travelers who blocked you from discovery lists (profile opening is refused); unchanged.
- Trip details reads the join-request status once per visit.
- Expo Go: authenticated media returns 401 (the preview APK loads them).

#### Compatibility corrections (2026-10-17)

- **Consent is atomic and enforced.** Discovery settings (opt-in, sharing consent, shared trip) and preference edits while discoverable are saved with the discovery record in one batch (`setDiscoverySettings`; going private: `updateProfileVisibility`, which now also turns discovery off). New rule `discoveryConsistent()` refuses any `users/{uid}` write that would leave a record while not discoverable, pace/schedule/group size without consent, or trip details without a chosen trip; record writes are judged on the owner's settings after the batch (`getAfter`). Privacy Settings, the setup and Edit Profile report success only after the write commits; on failure the switch rolls back and "Nothing was changed" is shown. Older app builds that change these settings in two steps are refused at the first step (no unsafe state).
- **Join requests: strict state machine.** pending → approved/rejected (organizer, final); pending → cancelled and cancelled → pending (requester); `requestId`, `tripId`, `ownerUid`, `requestorUid` immutable; decisions change only `status`/`updatedAt`. The rejected → cancelled → pending bypass is refused.
- **Matching freshness.** Companion results are kept raw and cards derived (`utils/companions.ts`), so preference, consent and block changes re-rank or hide cards without a query; a latest-only guard drops responses for an earlier trip/account; cards clear when a load starts; reload on trip, account or discoverability change.
- **Wording.** Known non-overlapping dates give "Dates don't overlap" (never Strong/Good); each card shows dates ("Dates overlap: n days" / "Dates don't overlap" / "Dates unknown") and "Preferences: …" on separate lines; unknown dates stay unknown (at most "Possible match").
- **Shared-trip sync.** Editing the trip shown in discovery updates its destination/dates in the record, and deleting (archiving) it clears the choice and removes its details, in the same batch as the trip write (`updateTrip`/`archiveTrip` with a discovery change from `useTrips`). Consent is kept; no other trip is published.
- **Local verification switch.** Development bundles started with `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` connect to the local Firestore (8188) and Auth (9189) emulators; release bundles never do (export checked).
- **Tests:** `compatibility.cjs` 23 checks; `rules.cjs` 98 (+6: direct-SDK withdrawal/opt-out/private refused, interrupted settings write leaves everything unchanged, atomic withdrawal/trip removal/opt-out/private, shared-trip edit/archive, join-request bypass sequence, valid transitions and immutable identity). All release and emulator suites, typechecks, lint (no errors) and the Android export pass.
- **UI (Expo Go, local emulators, not the native APK):** "Dates don't overlap" with "Strong preference match" shown separately; switching trips recomputed dates; blocking a traveler removed the card without a refetch; a refused settings write showed "Could not update discovery settings. Nothing was changed" with the switch rolled back and the server unchanged; withdrawal succeeded atomically; editing the shared trip's destination updated the record; deleting it cleared the trip choice and details with consent kept; going private removed the record and turned discovery off. **Native APK verification: BLOCKED** (needs a new build); staging still runs the older rules.

### Staging compatibility verification (2026-10-18)

**Before:** HEAD `ffa6af3`; `checkStagingIsolation` passed (configuration and resource ownership, with the EAS preview environment and the staging web-app config). The preview environment and `eas.json` contain no emulator setting (the emulator switch also requires a development bundle); the exported bundle contains no emulator address. Note `.firebaserc` default is **production**: every command named `--project solotravelsoul-staging`.

**Deployed (staging only):**
- Firestore rules: `firebase deploy --only firestore:rules --project solotravelsoul-staging` → ruleset `1d5285d9-0f5a-46d0-af48-4ceef6a16611` (previous `12ac24a4…`, released 2026-10-05, saved locally for rollback).
- Worker: `wrangler deploy --env staging` → version `603c9c0e-6cef-4166-b1ca-4ce87e544ed3` (previous `fdce6651…`). Health afterwards: 0 Worker or Durable Object errors, CPU p99 2.99 ms.

**Deployed-rules checks** (`tests/staging/live.cjs compat-verify`, two disposable accounts, 6/6 PASS): atomic opt-in; direct SDK withdrawal/opt-out/private/trip-clear refused (4/4, nothing changed); atomic consent withdrawal; shared trip destination edit → record updated, deletion → trip choice and details removed, consent kept; going private → record removed and discovery off; join → cancel → join again → organizer rejects; cancelling or reopening the rejected request and flipping the decision refused (3/3); identity change refused.

**Preview build:** EAS `6246c5ab-f1d4-4517-b56d-4fea2d97fa21` from `ffa6af3` (FINISHED 2026-10-18T15:25Z), APK https://expo.dev/artifacts/eas/ZgebicajoOLKugmsMG-AFiLcWg0sIwNjj8OY5UyWRCo.apk (SHA-256 `c9b975124c398ec0d7b5279b4174db3521b90e08aa0bfb1ffefeb47cae187a5b`). EAS Free: 4 of 30 used before (plan Free, no overage), 5 after, $0. Installed over the previous preview on the Android 15 emulator.

**In the APK (staging):**
| Check | Result |
|---|---|
| Sign-up → optional setup | Step 1 of 7; three answers; left via Community; "Finish your travel preferences" resumed at step 4; question skipped; finished (sharing off, no discovery record) |
| Editing later | Edit Profile saved schedule and group size |
| Matching explanations | Viewer fixture: "Strong match", "Dates overlap: 6 days", "Preferences: Strong preference match" with reasons and a difference; second traveler "Dates don't overlap" + "Preferences: Not enough information" + "Not provided" |
| Authenticated photos | Fixture profile photos uploaded through the Worker and demo-feed photos load |
| Destination edit, same trip | Lisbon → Porto in Edit Trip: matching showed Porto (no travelers) without refresh; back to Lisbon: Lisbon matches returned |
| Date-only edit | End date moved to Nov 21: overlapping traveler became "Dates don't overlap"; discovery record dates updated (Nov 17–21) |
| Blocking | Blocking a traveler removed the card; others stayed |
| Consent withdrawal | Privacy switch: sharing off and pace/schedule/group size removed from the staging record in one write |
| Join / cancel / again | Request to Join → pending; Cancel → cancelled; Request again → pending (verified on staging) |

**Deletion step:** deleting a discoverable fixture with one slice removed its discovery record while the job was still in progress (the profile document still existed); the deletion then completed.

**Cleanup:** all seven verification accounts (4 matching fixtures, the sign-up account, 2 rules-check accounts) deleted through account deletion and confirmed (`verify-deleted`: job completed, Auth gone, data and 4 fixture photos purged). Demo feed unchanged (`seedStagingFeed verify` PASS, 48/48 photos). No production operation.

### Bottom tab bar over the system navigation (2026-10-18)

- **Report:** on an SM-S711U (Android 16, three-button navigation) the bottom tabs overlapped Back/Home/Recents (staging APK from `ffa6af3`).
- **Cause:** `app/(app)/_layout.tsx` set `tabBarStyle` `height: 72` and `paddingBottom: 8`. React Navigation uses a numeric style height as-is and the style padding replaces its inset padding, so with edge-to-edge the bar ignored the bottom safe-area inset.
- **Fix:** `utils/tabBar.ts` `tabBarInsets(insets.bottom)` from `useSafeAreaInsets()`: content height unchanged (58), bottom padding = the real inset (at least 8 where there is none), height = 6 + 58 + padding. No device-specific offsets; keyboard hiding, badges, labels and the offline banner (top overlay) unchanged. Screens inside tabs use native `SafeAreaView`, which pads only real overlap, so there is no double padding.
- **Verified (Android 15 emulator, Expo Go with the staging configuration, JS fix):** three-button mode — tabs above the buttons, all six tabs, keyboard open hides the tabs and closing restores them; gesture mode — the handle has its own space below the labels. Reproduced first with the installed APK (three-button overlap). Screenshots: `docs/screenshots/2026-10-18-tab-bar/`.
- **Physical device verification (2026-10-18):** EAS preview build `757d78d2-bdd8-4b70-81a5-919f145a64c9` from a clean worktree at `225421a` (EAS Free 6/30, $0; staging isolation passed, no emulator setting). APK https://expo.dev/artifacts/eas/mWQ8D2m3_l0bt3a7ZHjb11vSYO5HJ753u8Y7Z6kPvEs.apk (SHA-256 `a396e4f7dc98f159dcf82196672d544cef7c7ff6b38d2621882a191072ebd3d7`). Installed with `adb -s R5CWB2VWTWB install -r` on the SM-S711U (Android 16): update in place, app data kept (first install 2026-10-11 unchanged).
  - **Before** (previous APK, three-button): Recents/Home/Back drawn over the tab labels.
  - **After, three-button:** all six tabs above the buttons; labels, icons and the active pill visible; screen content ends above the bar. Keyboard (Samsung) hides the tabs, closing restores them.
  - **After, gesture navigation** (temporarily enabled): all six tabs above the gesture handle with no overlap; keyboard hide/restore correct.
  - **Offline banner:** in airplane mode the status-bar overlay and the in-page banner appear and clear after reconnecting. Observed: while the app stayed in the foreground the banner appeared only after returning to the app (the live listener did not fire within 25 s on this device); unrelated to the tab bar, to investigate.
  - **Badges:** this account had no unread chats, so no tab badge was shown; badge rendering is unchanged.
  - **Restored:** three-button navigation (mode 0, no navigation overlays), gesture settings, Wi-Fi/mobile data on, airplane mode off — as recorded before testing.
  - Other finding (unrelated): at this phone's text size the Community label shows "Communi…" and a journal card's like count overlaps "1 min read".
  - Evidence (tab-strip crops only): `docs/screenshots/2026-10-18-tab-bar/sm-s711u-*.png`. **iPhone: BLOCKED** (no macOS/iOS simulator on this machine); the iOS export succeeds and the same inset logic covers the home indicator; screens with inputs use `KeyboardAvoidingView behavior="padding"`.
- **Test:** `tests/release/app.cjs` runs React Navigation's own `getTabBarHeight` with insets 0/24/34/48 (none, gesture, iPhone, three-button).

### Physical-phone regressions: connectivity, tab labels, journal card (2026-10-18)

- **Reported (SM-S711U, Android 16):** (1) airplane mode with the app in the foreground showed no offline banner within 25 s (backgrounding and resuming did); (2) "Community" shown as "Communi…"; (3) a journal card's like count overlapped "1 min read".
- **Connectivity diagnosis.** expo-network 8.0.8 (Android) emits only on `onAvailable`/`onLost` and reads `connectivityManager.activeNetwork` inside the callback; `isInternetReachable` is just `activeNetwork != null` (no reachability probe) and type `UNKNOWN` maps to `isConnected: false`. On the phone, logcat showed `ConnectivityService` calling `onLost` for Wi-Fi at the moment of the toggle and "Switching to new default network" only afterwards (~16 ms later here, ~90 ms on the emulator), so the event can carry the lost network as still connected and no later event follows. Reconnect has the same race. Emulator events (Expo Go, SDK 54): `UNKNOWN`/`isConnected:false` on loss, `WIFI`/`true` on return.
- **Fix (`hooks/useNetworkState.ts`).** Event-driven bounded confirmation: each native event is applied, then `getNetworkStateAsync()` is re-read after 1 s and 3 s (timers cleared on a newer event and on unmount; nothing runs while the network is quiet, no polling). `UNKNOWN`/missing flags are treated as unknown: the last known state is kept until confirmed and, if still unknown after the last confirmation, the app counts as offline (writes queue instead of failing). `isInternetReachable` is never true without a connection, and "connected but not reachable" stays distinct. Sequence-number stale protection, listener cleanup, queue ownership and the single reconnect drain are unchanged.
- **Tab labels (`components/ui/TabLabel.tsx`).** One line, scaled to the tab width from measured text (`adjustsFontSizeToFit` did not shrink on Android's new architecture; `minimumFontScale` is iOS-only), 2 dp slack for whole-pixel rounding, floor 0.65, growth capped at 1.3x of the system text size. Font scaling stays on; safe-area `tabBarInsets` untouched.
- **Journal card.** Metadata (author, read time) is a wrapping, shrinkable group; long names ellipsise to one line, "1 min read" stays whole and moves under the author when tight; the like control has its own non-shrinking slot. Counts format as 999, 1.5k, 999.9k, 1M, 2.4M (was `1000.0k` at a million).
- **Tests (written first, failing on the old code):** `tests/release/network.cjs` (onLost race, onAvailable race, unknown state, connection vs reachability, burst/stale/unmount, end-to-end banner -> queue -> single delivery; 12/12) and `tests/release/app.cjs` (tab label fit on 360/384/411 dp at text 1x-2x, card layout, count format; 14/14). Release suites, typecheck (0 errors), lint (0 errors) and the Android export pass.
- **Emulator verification (Android 15, 1080x2340 at 450 dpi to match the phone, Expo Go SDK 54, staging config, disposable staging accounts, since deleted):** "Community" whole at default text (scale 0.98), 1.3x and 2.0x (scale 0.77, capped); three-button and gesture navigation keep all six tabs above the system area; journal card reflows at default and 2.0x with the like count intact. Foreground airplane mode showed the banner (~6-12 s by screenshot polling) and cleared it after reconnect without leaving the app; those figures are dominated by the emulator's own Wi-Fi teardown (~20 s) and screenshot polling on a loaded host, not the app. Screenshots (tab strips and card crops only): `docs/screenshots/2026-10-18-phone-regressions/`.
- **BLOCKED / not verified:** the SM-S711U itself with the fixes (the phone's Expo Go is SDK 57 and cannot run this SDK 54 project; the installed APK predates the fix and a new APK needs an EAS build, which was not allowed; the phone was also no longer attached at the end). Native event latency on the phone is therefore unmeasured after the fix. Keyboard with the new labels and offline-message delivery through the real UI were not re-run on the emulator (it became unresponsive after the navigation-mode switch); delivery-once is covered by the end-to-end network test.
- **Restored:** the phone was not changed beyond airplane-mode toggles (airplane 0, three-button, font scale 1.0); the emulator is back to gesture navigation, default size/density, font scale 1.0, airplane off.

### Samsung verification of the three fixes (2026-10-19)

- **Build / source:** EAS preview build `48051168-d9aa-47b7-9aa8-1a03dcd7aca3` from a clean worktree at `b150243158832952cbeb2586a33486df6b5fdb2c` (EAS Free 7/30, $0 overage; staging isolation passed, no emulator variable). APK https://expo.dev/artifacts/eas/qGTyQi0nordWwVEe6XP3TBvoHBcigv1AF56gomBZvlM.apk (SHA-256 `945ffdab28a51720a4969c842121fe60c0623fc027e57f99029ff0060429d9ef`). Installed with `adb install -r` on R5CWB2VWTWB (SM-S711U, Android 16): update in place, first install 2026-10-11 unchanged, the signed-in session kept. Disposable staging accounts, journal, and test group were used; the accounts and journal were deleted.
- **Foreground disconnect/reconnect (app kept in the foreground, three-button navigation).** Measured on the phone's own clock: the airplane toggle and an accessibility-event stream (`uiautomator events`, one line per UI change, millisecond timestamps) are logged by one on-device script, together with `ConnectivityService` from logcat. Not screenshot polling. Three valid runs (runs 2-4 and 6 produced an empty event stream because a leftover `uiautomator` process held the connection, 8 likewise; discarded, not counted):
  - **Offline:** OS `onLost` at +430 / +277 / +241 ms after the toggle; first app UI change at **+1564 / +1423 / +1378 ms** (about 1.1 s after the OS event, the first confirmation re-check); a second UI change at about +3.4-3.6 s (the 3 s re-check).
  - **Reconnect:** OS network connected at +5118 / +5207 / +5133 ms after the toggle; app UI change at **+5310 / +5381 / +5244 ms** (about 110-190 ms later).
  - The accessibility events carry no text, so the banner is identified by timing plus a screenshot taken afterwards (banner and status-bar overlay visible 7 s after the toggle; cleared 12 s after reconnect), not by event content. Before the fix the same device showed nothing for 25+ s while foregrounded.
- **Offline DM and group messages (account signed in on the phone, with the app staying in the foreground).** Offline banner shown; message typed and sent while in airplane mode: pending bubble and "Offline — messages will send when reconnected"; the other side's chat held 0 messages before reconnect. After reconnect (25 s): exactly 1 copy server-side for the DM (`dm-offline-1`) and 1 for the group (`grp-offline1`, read by both other members), bubbles turned solid; a recount after the group test still showed 1 DM copy.
- **Tab labels (SM-S711U, 384 dp, fresh launch after each change of system text size).** Default 1.0: all six labels whole. 1.3 and 2.0: all six labels whole and readable; "Community" scaled down to fit (2.0 is capped at the 1.3 size by design). Observation: changing the system text size while the app stays open leaves stale layout until the app is restarted (at 1.3 live: "Commu…" and clipped descenders), which is React Native's behaviour for all text; every enlarged-size check above uses a fresh launch.
- **Journal card.** A disposable public journal with a 57-character author name and 1,234,567 likes (patched with the owner token, then deleted): default and 2.0 text, name truncated to one line, "1 min read" on its own line, "1.2M" intact beside it, no overlap.
- **Keyboard.** Three-button and gesture: opening the keyboard on the new-message field hides the tabs, the field stays visible above the keyboard; closing it restores the tabs.
- **Safe areas.** Three-button: tabs fully above Recents/Home/Back. Gesture: tabs fully above the gesture handle. Tab strip at 1.3/2.0 was checked in three-button navigation only.
- **Not verified:** the journal card and message screens were not re-checked in gesture mode; the tab strip in gesture mode was checked at default text only; the user account's feed content was not touched. The test DM and group "Verify-group" created from the signed-in account on staging remain in that account.
- **Restored:** three-button navigation (mode 0, no navigation overlay), airplane off, Wi-Fi and mobile data on, text size 1.0, 1080x2340 at 450 dpi, as recorded at the start; the installed app is the new build.
- **Evidence (cropped, no personal information):** `docs/screenshots/2026-10-19-samsung-verify/`.

### Remaining phone QA: gesture navigation and live text-size changes (2026-10-19)

- **Installed APK:** build `48051168-d9aa-47b7-9aa8-1a03dcd7aca3` (b150243), SM-S711U, Android 16. No build, deployment, production operation or billing change was made; `.claude/settings.json` untouched.
- **1. Gesture navigation, installed APK (new evidence only; earlier results are in the two sections above).** Enlarged tab labels at 1.3 and 2.0 (fresh launch): all six whole, "Community" scaled to fit, gesture handle clear below the tabs. Journal card (disposable journal, 57-character author name, 1,234,567 likes) at 2.0: name truncated, "1 min read" on its own line, "1.2M" intact. Keyboard at 2.0: opening hides the tabs and keeps the field visible, closing restores the tabs. Offline DM (`gdm-offline1`) and group message (`ggrp-offline1`) in gesture navigation: pending bubble plus the offline banner while in airplane mode, 0 server copies before reconnect, exactly 1 after (group read by both other members). Disposable accounts and journal deleted; the DM and group "Gesture-group" created from the signed-in account remain.
- **2. Changing the system text size while the app runs, reproduced on the installed APK** (draft typed in New Message, then text size 1.0 to 1.3 live; also with the app backgrounded and then reopened): the app returns on Feed (navigation reset, draft gone) and text is clipped ("SoloTravelS", "Commu…", descenders cut).
  - **Diagnosis.** (a) `logcat -b events`: `wm_relaunch_resume_activity … 40000000` (fontScale) then `handleRelaunchActivity` / `performDestroy` on MainActivity; same process id. (b) The installed manifest's MainActivity `configChanges` (decoded from the APK) is `keyboard|keyboardHidden|orientation|screenLayout|screenSize|uiMode`: no `fontScale`, which is Expo's template default (`@expo/config-plugins` `withAndroidBaseMods`), so Android relaunches the activity. (c) Node bounds from `uiautomator`: after the live change the title box is 349 px wide and "Trips" 39 px tall; after a fresh launch at 1.3 they are 414 px and 51 px. Layout kept the old scale while the new activity drew the new one. (d) React Native keeps its display metrics per process and only refreshes them in `ReactHostImpl.onConfigurationChanged` behind `enableFontScaleChangesUpdatingLayout` (default off, no public switch); a relaunch never reaches that path.
  - **Fix (app-side, native config).** `apps/mobile/plugins/withFontScaleConfigChange.js`, registered in `app.json`, appends `fontScale` to MainActivity's `configChanges` (idempotent, other flags and activities untouched). The intent is that the activity is no longer relaunched (and so the JS tree, navigation, drafts, session and queues stay in place); `ReactActivity.onConfigurationChanged` already forwards to React Native. This was expected from the source, not observed at runtime in that phase (see the following phase for the device result). No global font-scaling change, no setting changed to hide it.
  - **What the fix does not do (stated, not hidden).** With the activity kept, existing text keeps the size it was laid out with until the app is next started; reflowing live would need React Native's `enableFontScaleChangesUpdatingLayout` flag, which can only be overridden natively (`ReactNativeFeatureFlags.dangerouslyForceOverride`) and was not added blind because it cannot be verified without a binary.
  - **Tests (configuration only).** `tests/release/app.cjs` (15/15) proves the build configuration, not runtime behaviour (it does not show that drafts or navigation survive, that there is no relaunch, or that nothing is clipped): plugin appends `fontScale` to Expo's template value once, keeps order, handles a missing attribute, leaves other activities alone, goes through `withAndroidManifest`, is registered in `app.json` and survives the staging variant of `app.config.js`. Release suites, typecheck (0 errors), lint (0 errors) and Android export pass.
  - **Source verification (not the installed APK):** `expo prebuild --platform android` in a scratch copy (no .env) generates `android:configChanges="keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|fontScale"` on `.MainActivity`; `MainActivity.kt` does not override `onConfigurationChanged`, so `ReactActivity` delegates it.
- **BLOCKED:** verifying the fix on the phone needs a new APK (manifest change); builds were not allowed. To verify after one: with a draft open, change the text size (and return from Settings), expect no relaunch (`logcat -b events` shows no `wm_relaunch_resume_activity`), navigation and draft intact, no clipped text.
- **Restored:** three-button navigation, airplane off, Wi-Fi and mobile data on, text size 1.0, 1080x2340 at 450 dpi.
- **Evidence (cropped, no personal information):** `docs/screenshots/2026-10-19-gesture-and-text-size/`.

### Font-scale mitigation on the SM-S711U: PARTIAL (2026-10-19)

- **Verdict: PARTIAL.** The relaunch is gone (navigation, draft and session survive a text-size change). The app does **not** support live text-size changes: text adopts the new size inconsistently and the parts that do adopt it clip. Do not claim live font-size support.
- **Corrected earlier claim.** The regression added in `54f2b17` (`tests/release/app.cjs`) proves manifest configuration only; it does not prove draft preservation, absence of a relaunch, or absence of clipping. Its name and comment were corrected in `45fc108` and the earlier handoff wording was qualified. The results below are the runtime evidence.
- **Build / source:** EAS preview build `b96e7d1e-74fd-4325-b25d-05d946fe1386` from a clean worktree at `45fc10808e659822b24e30064a816d0b953142e9` (EAS Free 7/30 before the build, $0 overage; staging isolation passed, no emulator variable). APK https://expo.dev/artifacts/eas/3mYqA71tslt9ekmTb9cGoNYhVoZ3KkOojUHowdMhGTw.apk (SHA-256 `56bc3aaf1df305a150e617029197f84e2dbe3da71f616654803b6bd851a5e050`). The APK's own manifest decodes to MainActivity `configChanges` = `keyboard|keyboardHidden|orientation|screenLayout|screenSize|uiMode|fontScale` (was without `fontScale`). Installed as an update on R5CWB2VWTWB (SM-S711U, Android 16): first install 2026-10-11 unchanged, signed-in session kept.
- **Method.** Unsent draft typed in a group chat composer (a test group in the signed-in account; nothing was sent), keyboard open. System text size changed with `settings put system font_scale`: 1.0 to 1.3 to 2.0 (foreground), a trip through Settings and back, 2.0 to 1.0, then 1.0 to 1.3 to 2.0 with the app backgrounded (Home) and brought back. Each step: screenshot, `uiautomator` node bounds, `logcat -b events` relaunch count, process id. The app was never restarted and text size was not reset to hide a failure (the final reset to 1.0 came after all observations).
- **Survival (all steps, both scenarios): PASS.** No `wm_relaunch_resume_activity` or `wm_on_destroy_called`; the process id stayed 9984; the same chat screen, the draft text and the signed-in session persisted (before the fix on the previous APK the same change relaunched MainActivity and returned the app to Feed with the draft gone).
- **Text actually adopting the new setting: PARTIAL / inconsistent.**
  - Adopted (re-rendered or newly mounted views): composer text (node height 54 to 71 px at 1.3), the chat header title, the tabs that were re-rendered after the change (Explore and Chats grew), and every screen mounted after the change (journal card, New Message).
  - Retained its old size: tab labels that were not re-rendered (Feed, Trips, Community, Profile stayed 39 px tall at 2.0), and already-mounted screens such as the Chats list (header "Chats" kept its old size).
  - Layout boxes did not follow: the chat header title box stayed 291 x 61 px at 1.0, 1.3 and 2.0.
- **Clipping observed (live-changed state, no restart):**
  - Chat header: at 1.3 "Gesture-a..." (ellipsised), at 2.0 title and subtitle cut vertically ("Gestur", "1 members" half hidden); same with the app backgrounded during the change.
  - Tabs that grew (Explore, Chats) have descenders cut ("Explore" p); untouched tabs are fine.
  - **Input behind the keyboard:** with the keyboard open, a foreground change 1.0 to 1.3 moved the composer to y 1356-1427 while the keyboard starts at about y 1330, hiding the field and draft (reproduced twice); at 2.0, and when backgrounded during the change, the composer stayed visible (y 1221-1292).
  - Journal card (mounted after the change) at 2.0: name truncated, "1 min read" on its own line, "1.2M" intact: no clipping. New Message input and keyboard: fine on a freshly mounted screen.
- **Not done (stated):** no control at a fresh launch in this phase (earlier phases have fresh-launch evidence at 1.0, 1.3 and 2.0). Gesture navigation was not repeated here (three-button, the phone's original mode).
- **Remaining option (not applied):** React Native's own `enableFontScaleChangesUpdatingLayout` re-measures text on a font-scale change, but it can only be overridden natively (`ReactNativeFeatureFlags.dangerouslyForceOverride`), which cannot be verified here without another build. Alternatively the app could restart its UI when `useWindowDimensions().fontScale` changes, at the cost of losing state, which the requirement forbids.
- **Restored:** three-button navigation, airplane off, Wi-Fi and mobile data on, text size 1.0, 1080x2340 at 450 dpi, as recorded before testing. The disposable account and journal were deleted; existing conversations were not changed (no message sent; the draft was left unsent).
- **Evidence (cropped, no personal information):** `docs/screenshots/2026-10-19-font-scale-mitigation/`.

### Android font-scale layout flag on the SM-S711U: FAIL for consistent layout (2026-10-19)

- **Verdict.** The goal (system text-size changes update text *and* layout consistently, composer stays visible) is **not met**. What works: no relaunch, navigation, draft and session survive, and with the flag every text now adopts the new size. What fails: layout boxes do not follow (text is clipped/truncated) and the composer can still end up behind the keyboard. Do not claim live font-size support. Build was not repeated (one build was authorized); a candidate follow-up is described below and is **not** in the code.
- **Implementation (commit `74c9630`).** `apps/mobile/plugins/withFontScaleLayoutUpdates.js` (registered in `app.json`) generates `FontScaleLayout.kt` (one `ReactNativeFeatureFlags.dangerouslyForceOverride` whose provider delegates every flag but `enableFontScaleChangesUpdatingLayout` to the exact provider `loadReactNative` installed for the release level), one call after `loadReactNative(this)` in `MainApplication.kt`, and a `MainActivity.onConfigurationChanged` that forwards to RN (`super`) and then calls `requestLayout()` on the React surface. Defaults and init order are unchanged; no second plain `override`. Verified from RN 0.81.5 source: with the flag on, `ReactHostImpl.onConfigurationChanged` calls `DisplayMetricsHolder.initDisplayMetrics`, `ReactSurfaceImpl.getFontScale` feeds the live scale into the layout context, and `SurfaceHandler::constraintLayout` re-dirties measurable nodes when that scale changes; Java text size comes from `DisplayMetricsHolder` (the layout-context multiplier is ignored by `TextAttributeProps`), so there is no double scaling.
- **Checks before the build.** `tests/release/app.cjs` 16/16 (generated Kotlin/idempotence, single forced override, RN symbols and defaults in the pinned source, flag consumers present; fixtures of the real Expo 54.0.34 templates in `tests/release/fixtures/android/`), full release suite, typecheck 0 errors, lint 0 errors, Android export. `expo prebuild` in a scratch copy generated the three native files and `configChanges=...|uiMode|fontScale`. **Native compilation:** no JDK/Android platform/NDK on this machine, so Gradle could not run; instead the three generated Kotlin files (`FontScaleLayout.kt`, `MainApplication.kt`, `MainActivity.kt`, with stubs for the Expo and Gradle-generated classes) were compiled with Kotlin 2.1.20 on a scratch JDK 17 against RN 0.81.5's `react-android` release classes plus androidx and the Android 15 `android-all` jar: exit 0, warnings only. `javap` shows `FontScaleLayoutFlags` implementing the full provider interface.
- **Build / APK (installed-APK results below).** EAS preview build `674b77c2-0f88-46f6-ace3-3033f806ca7e` from a clean worktree at `74c963049bc0a892d97ef7b0c59930fc2b2f9a16` (EAS Free 8/30 at preflight, $0 overage; staging isolation passed, no emulator variable). APK https://expo.dev/artifacts/eas/4moJFtcl-6qitRxNNXK0J0JMxhHq64Kt97inMiQ6FXs.apk (SHA-256 `7e50fcd3709a4804162c7433f96e9777f33166082ba197ca7632c4cf9b613088`). The APK's manifest decodes to `configChanges` with `fontScale`, and its dex contains `FontScaleLayout`, `FontScaleLayoutFlags`, `enableFontScaleLayoutUpdates`, `relayoutReactSurface` and `dangerouslyForceOverride`. Installed as an update on R5CWB2VWTWB (first install 2026-10-11 unchanged, session kept).
- **Device method.** Three-button navigation (the phone's original mode). Unsent draft in a test group's composer, keyboard open. Text size via `settings put system font_scale`: 1.0 to 1.3 to 2.0 to 1.0 (foreground, keyboard open); Settings and back at 1.3; Home then resume at 2.0; then headers, tabs and Explore at 2.0; then a fresh-launch control at 2.0 (the only restart, done last, as a reference). Each step: screenshot, `uiautomator` node bounds, `logcat -b events` relaunch count, process id.
- **Results.**
  - State preservation: **PASS** at every step and in the Settings/background scenarios (no `wm_relaunch_resume_activity` / `wm_on_destroy_called`, same process id, same screen, draft intact, session intact).
  - Text adopts the new size: **PASS** (all text, unlike the manifest-only build where untouched text kept the old size).
  - Layout follows the new size: **FAIL.** Node boxes did not change at 1.3 or 2.0 (title 291 x 61 px, "Today" 92 x 46, "Ravi created the group" 328 x 46, bubble 223 x 57; only the native EditText re-measured: 54, 71, 100 px). A fresh launch at 2.0 gives title 514 x 106, "Today" 183 x 91, line 660 x 91, bubble 416 x 96. Result: header title ellipsised at 1.3 ("Gesture-a...") and cut vertically at 2.0 ("Gestur"), "Today"/"Ravi created..." and the bubble truncated, all six tab labels grew while their boxes stayed 39 px so descenders are cut. Returning to 1.0 restores consistency.
  - Composer above the keyboard: **FAIL (intermittent).** Visible at 1.0 to 1.3, 1.3 to 2.0, and after Settings/background changes (draft bottom 1291-1292 vs keyboard top 1332); hidden when going 2.0 to 1.0 with the keyboard open (draft bottom 1427 vs 1332).
  - Journal card: a screen mounted after the change (Explore) renders correctly at 2.0 (name truncated, "1 min read" on its own line, "1.2M" intact); screens already mounted keep stale boxes.
  - Safe areas and accessibility limits (TabLabel cap and fit) were not affected in these checks.
- **Diagnosis from an atrace capture (no new build).** On the change: `configChanged`, `ResourcesManager#applyConfigurationToResources`, `activityConfigChanged`, `windowResized`, `ReactSurfaceView.onMeasure` at +3 ms, 185 `ReactTextView.setText` and `UPDATE_LAYOUT` at +16 to +28 ms. So the shadow tree is re-committed and the flag path runs, but the re-measure produces the old sizes while the mount uses the new scale. This fits the measure running before React Native's display metrics are refreshed (Expo forwards `onConfigurationChanged` through a lifecycle coroutine; the surface measure runs on the next traversal), after which nothing re-dirties the nodes because the root already holds the new multiplier. Closing the keyboard (a real surface resize) did not repair it for the same reason. This is a hypothesis consistent with the data, not proven.
- **Candidate next step (not applied, needs one more authorized build to verify).** In the generated `MainActivity.onConfigurationChanged`, call `DisplayMetricsHolder.initDisplayMetrics(applicationContext)` (public RN API) before `super.onConfigurationChanged`, so metrics are fresh before the first measure with the new multiplier; then re-run this protocol including the composer. If that fails, the alternatives are to drop the flag and keep the manifest-only behaviour, or to accept a restart on text-size change (not allowed by the requirements). Until verified, live text-size changes are best treated as unsupported: a restart restores full consistency.
- **Restored:** three-button navigation, airplane off, Wi-Fi and mobile data on, text size 1.0, 1080x2340 at 450 dpi. The disposable account and journal were deleted; no message was sent and the draft was left unsent, so existing conversations are unchanged.
- **Evidence (cropped, test group only):** `docs/screenshots/2026-10-19-font-scale-layout-flag/`.

### Native font-scale fix, verified on the SM-S711U with a real local Gradle debug build: PASS (2026-10-19)

- **Verdict: PASS for the stated failure** (header stayed 291x61 live vs 514x106 fresh at 2.0; composer behind the keyboard on 2.0 to 1.0). Live text-size changes now give the same layout as a fresh launch, the composer stays above the keyboard, and activity, navigation, session and drafts survive. Verified on a **local Gradle debug build of the final repo code** (separate staging package `com.solotravelsoul.app.staging.fsdebug`, JS bundled, staging env, disposable accounts), not on a preview APK: no EAS build was made, so a new preview/production binary still has to be built to ship this. Not repeated here: gesture navigation, the production app variant on device, iPhone.
- **Method.** Installed free prerequisites from Google's repository into the existing SDK (platform 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1; the SDK licence was already accepted on this machine) and used a portable JDK 17 outside the repo. `expo prebuild` + `gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a` in a short-path scratch project (a long path breaks CMake/ninja on Windows), with scratch-only diagnostics (a Kotlin logger, a JS `onLayout` probe, a view-size sampler, an insets sampler, atrace). Every diagnostic lived only in the scratch copy and is not in the repo.
- **Measured cause 1: layout reverts (not a metrics-refresh order problem).** `Application.onConfigurationChanged` already sees fresh metrics (10 sp = 36.56 px at 1.3; the held `DisplayMetrics` is updated in place) and React Native's own refresh runs synchronously inside `super.onConfigurationChanged` (the held object swaps there), so the proposed before-super `initDisplayMetrics` was evaluated and rejected: it would change nothing. What the samples show: the native views reach the new size (probe 439x129 px, title 681x106, "Say hello!" 448x106) at +168 ms, then are reset to the old size (260x77, 681x61, 256x61) by +208 ms, while a JS `onLayout` probe fired once with the new frame (156.09 x 45.87 dp, identical to the fresh launch) and never again. With the RN flag on, the native tree re-measures all text (the C++ text-measure cache key now includes the live font scale), but the next React commit (any state change; here the safe-area insets event) installs React's own node instances for every subtree React did not touch. Those were never re-measured, so the mount layer silently resets their views to the old frames with no layout event. Removing the extra `requestLayout` did not change this.
- **Measured cause 2: composer behind the keyboard.** After a font-scale change the Samsung keyboard re-inflates: window insets pass through IME hidden (+177 ms), system bars 0 (+200 ms), IME back (+302 ms), bars restored (+500 ms). React Native computes its one `keyboardDidShow` payload in whichever state it catches; in 4 of 6 runs it carried `screenY` 521.6 dp instead of 473.6 dp (135 px = the navigation bar), and `KeyboardAvoidingView` padded the composer from it (composer bottom stuck at y 1427 vs keyboard top 1332). Nothing re-emits it once the insets settle.
- **Fix (three parts, flag defaults and startup order unchanged; no second plain override, no SDK change, no restart or root reset).**
  1. `apps/mobile/utils/fontScaleRelayout.ts`, installed in `app/_layout.tsx` before first render (Android only): wraps the real `react-native` `Text` and `TextInput` exports (via `require`, because a namespace import is a copy). After a `fontScaleChanged` event every mounted Text/TextInput re-renders once with a prop that changes per epoch (first version: `nativeID` `fs<epoch>` for every element, **superseded**: the hardening section below gives each element its own `fsr-<epoch>-<useId>` token; the caller's `nativeID`/`id`/`testID` is never replaced), so React re-commits them measured with the live scale. Caller props, refs, statics and draft text are passed through.
  2. `plugins/withFontScaleLayoutUpdates.js` generates `FontScaleLayout.relayoutReactSurface(this, newConfig)`: only when the font scale really changed it requests a surface relayout and, once that layout pass is done, emits `fontScaleChanged` to JS (so React commits against a surface that already carries the new scale).
  3. The same helper re-sends RN's own `keyboardDidShow` payload (same formula and shape as `ReactRootView.checkForKeyboardEvents`) at +700 ms and +1600 ms from the settled insets, only when the IME is visible.
  - The earlier parts stay: manifest `configChanges` + `fontScale` (no relaunch), and the single `dangerouslyForceOverride` flag provider that delegates every other flag to RN's own release-level provider.
- **Tests.** `tests/release/app.cjs` 17/17 at that time (19/19 after hardening): JS wrapper behaviour against fake React/RN (replaces the real export, idempotent, epoch 0 pass-through, new prop per event, caller props unmutated, `id`/`nativeID`/`testID` rules, statics and draft text kept, Android only); generated Kotlin and its use of RN symbols checked against the pinned RN 0.81.5 source (keyboard formula and payload shape, `emitDeviceEvent`, `ReactApplication.reactHost`, `KeyboardAvoidingView` subscription); event names match across JS and native; `_layout.tsx` installs before anything renders. Release suites, typecheck (0 errors), lint (0 errors) and the Android export pass. **Native compilation:** the final code was built with real Gradle three times (BUILD SUCCESSFUL, arm64 debug APK, Kotlin compiled by Gradle, no stubs).
- **Device results (draft in a DM composer, keyboard open; debug build; three-button navigation).**
  - Foreground 1.0 to 1.3 to 2.0 to 1.0, two full rounds (six live changes): header title box 61 to 77 to 106 to 61 px, "Say hello!" bubble 256 to 324 to 448 to 256 px wide, avatar 54 to 71 to 96 to 54, composer 54 to 71 to 100 to 54 px, identical in both rounds; composer above the keyboard every time (draft bottom 1291-1292 vs keyboard top 1332); no relaunch (`wm_relaunch_resume_activity` 0, process id unchanged), draft, screen and session intact. Before the keyboard part of the fix the same final-flag build left the composer behind the keyboard at 1.3, 2.0 and 1.0 (draft bottom 1427).
  - Settings round trip at 1.3, backgrounded (Home) at 2.0 and again at 1.0: same results, same process, draft intact, composer visible.
  - Screens mounted at 1.0 and changed live (Explore, the chats tab, the open chat): tab labels 39 to 51 to 51 to 39 px (capped at 1.3 by design), "Popular Journals" 394 to 653 to 465 to 394 px wide, journal card rows (name, "1 min read" 189 to 348 to 249 to 189, likes "1.2M" 92 to 170 to 121 to 92) all re-measured; journal metadata does not overlap at 2.0 (author name shrinks, read time and likes keep their own space).
  - Fresh-launch controls at 2.0 and 1.3 (restart used only as a reference after the live results were recorded): chat header, bubble, composer and the Explore card rows are **pixel-identical** to the live-changed values.
- **Remaining limits (honest list).**
  - Tab labels stay capped at 1.3x (`maxFontSizeMultiplier` in `TabLabel`, by design) and "Community" shrinks to at least 0.65 of its size; every other Text follows the system text size up to what was tested, 2.0x, with no global cap and no change to the user's setting.
  - ~~The Explore search field's text is vertically clipped at 2.0x~~ (fixed in the hardening section below: minimum height instead of a fixed height).
  - Not covered by the JS hook: text components created before the hook installs (`Animated.Text`, `createAnimatedComponent(Text)`) and React Native internals that import `Text` directly (RN's own `Button`). **Correction:** the earlier statement that the app uses neither `Button` nor `Alert` was wrong; the app calls `Alert.alert` in about twenty screens. Those are Android-native dialogs, outside the JS hook; see the hardening section below for what was checked. A Text/TextInput that sets both `nativeID`/`id` and `testID` itself is not re-committed.
  - The keyboard re-send is timed (700 ms, 1600 ms) because Android offers no "insets settled" signal; in 4 of 6 runs the composer sat about half a second too low before the correction. A much slower device could in principle settle later than 1.6 s.
  - Android 11+ only for the keyboard re-send (the legacy path below API 30 is untouched); the JS hook is Android only.
- **Restored:** three-button navigation, airplane off, Wi-Fi and mobile data on, text size 1.0, "stay awake while charging" back to 0 (it was enabled temporarily with your permission), 1080x2340 at 450 dpi. The debug package was uninstalled; the installed preview app and its data were not changed (one mis-targeted scripted tap sequence reached its chat list once, on a blank area, with nothing typed into a field; a foreground guard then prevented any input to anything but the debug app). Disposable accounts and journal deleted; scratch project removed. Android SDK additions (platform 36, build-tools, NDK, CMake) were left installed.
- **Evidence (cropped, disposable data only):** `docs/screenshots/2026-10-19-font-scale-native-fix/`.

### Font-scale fix hardened (unique ids, adaptive Explore search, Alert coverage), verified on the SM-S711U: PASS (2026-10-19)

Same local Gradle debug build method as the section above (staging package `com.solotravelsoul.app.staging.fsdebug`, disposable accounts, no EAS build, preview app and its data untouched). Corrections to the section above are marked there as superseded. The measured native fix (flag, relayout event, keyboard re-send) is unchanged.

- **1. Identifier collisions fixed.** The first version gave every re-committed element `nativeID` `fs<epoch>`, so after the first font change all of them shared one id. `apps/mobile/utils/fontScaleRelayout.ts` now builds `fsr-<epoch>-<useId()>`: unique per element, different in every epoch. A caller's `nativeID`/`id`/`testID` is never replaced (the token goes into `nativeID`, or into `testID` when the caller already set `nativeID`/`id`; an element that sets both `nativeID`/`id` and `testID` is still not re-committed). The wrapper keeps the same component type and adds no key, so React updates in place; refs, statics, `value`, `selection` and handlers pass through. Regression `tests/release/app.cjs` renders a nine-element tree with real React (`react-dom/server`, nested Text, caller ids, two TextInputs): all injected ids are unique, differ between epochs, caller ids and TextInput props/ref/selection are kept, and nothing is injected at epoch 0. A second test covers install semantics (real export replaced, Android only, idempotent).
- **2. Explore search no longer clips at 2.0x.** `apps/mobile/app/(app)/discover/index.tsx`: the bar had `height: 42` and the input `height: '100%'`; it now has `minHeight: 42` plus `paddingVertical: Spacing.sm`, and the input has no fixed height (`paddingVertical: 0`, so Android's default padding is not added). Measured bar height: **118 px at 1.0 (unchanged, 42 dp), 151 px at 2.0**; the input text box is 106 px tall at 2.0 and fully visible, identical live and on a fresh launch, and the bar is 118 px again after going back to 1.0. Typing with the keyboard open at 2.0 and hiding it left the bar unchanged. A regression test asserts that no fixed height is back.
- **3. Native dialogs (Alert).** The earlier claim that the app never uses `Alert` was wrong: about twenty screens call `Alert.alert`. Android renders those dialogs natively, so the JS hook does not apply to them and they were not changed. One representative dialog (Profile > Sign out, cancelled every time; the account was never signed out) was checked: opened at 1.0, opened at 2.0, opened at 1.0 then changed to 2.0 while showing, and opened at 2.0 then changed to 1.0 while showing. On this device the dialog text is the same size at 1.0 and 2.0 (title 800x76, message 936x61, buttons 213x152 / 243x152 px, identical in all four cases); it is unclipped, both buttons are reachable and it survives the live change. So native dialogs stay readable but do **not** follow the system text size here (that is the platform/OEM dialog theme, not the app). Only this one dialog was exercised, on one device and Android version; the other `Alert.alert` call sites, other OEMs and other dialog types (pickers, permission prompts) are unverified. In the three-button run the "before" capture for the 2.0-then-1.0 case was lost to an adb connection drop; the gesture run has it.
- **Native helper hardening** (`plugins/withFontScaleLayoutUpdates.js`, generated `FontScaleLayout.kt`): each font change takes a generation number and cancels the pending delayed callbacks; the layout listener and both keyboard re-sends check the generation and that the activity is not finishing/destroyed; the activity is held through a `WeakReference`. Quick successive changes therefore leave only the last change's callbacks, and leaving the screen cannot re-send keyboard metrics for a dead activity.
- **Tests.** `tests/release/app.cjs` 19/19 (adds the multi-element regression, install test, helper generation/cancel/weak-reference assertions and the search-bar assertion); the full `npm run test:release` chain, typecheck and Android export pass; lint reports 0 errors (existing warnings only). The final code compiled with real Gradle (BUILD SUCCESSFUL, arm64 debug APK).
- **Device results (draft `unsentdraftzq` in the DM composer with the cursor two characters from the end, keyboard open).** Run in **three-button** mode and again in **gesture** navigation (SM-S711U, 1080x2340, 450 dpi), identical numbers in both:
  - Live 1.0 to 1.3 to 2.0 to 1.0, one character typed after each change: the characters landed at the retained cursor position (`unsentdraftXzq`, `unsentdraftXYzq`, `unsentdraftXYZzq`), so draft, focus and selection survived; composer above the keyboard every time (draft bottom 1291-1292 vs keyboard top 1332); process id unchanged, `wm_relaunch_resume_activity` 0.
  - Seven changes 0.4 s apart ending at 1.0, then six ending at 2.0 (settled 6 s later): composer above the keyboard, draft intact (`...WVzq`), 2.0 layout equal to the single-change 2.0 values.
  - Change to 2.0 followed 0.25 s later by two Back presses (leaving the chat with the delayed keyboard re-sends pending), and by Home with a return after restoring 1.0: same process, no `FATAL EXCEPTION`, no AndroidRuntime errors; reopening the chat in gesture mode showed the composer above the keyboard.
  - Explore search at 1.0 / live 2.0 / back to 1.0 / fresh launch at 2.0 as above, in both navigation modes (live and fresh 2.0 crops are byte-identical).
- **Limitations.**
  - The keyboard re-send is timed (700 ms, 1600 ms), because Android offers no "insets settled" signal. In the earlier measurement the composer could sit about half a second too low before the correction (4 of 6 runs); this run sampled only **settled** states (5-6 s after each change) and did not capture intermediate frames, so the transient is not re-verified and no claim is made about every frame. A much slower device could settle after 1.6 s.
  - Native dialogs do not follow the text size and were verified for one dialog only (see 3).
  - Tab labels stay capped at 1.3x by design; Android 11+ only for the keyboard re-send; the JS hook is Android only; text components created before the hook installs and RN internals that import `Text` directly are not covered (the app's own `Alert.alert` is native, not such a component).
  - Not verified: iPhone, the production app variant on device, other Android versions/OEMs, a physical-keyboard or split-screen setup.
- **Restored:** three-button navigation (`navigation_mode` 0, gesture overlay off), text size 1.0, "stay awake while charging" back to 0 (enabled temporarily for the run), airplane off, Wi-Fi and mobile data on, 1080x2340 at 450 dpi. The debug package was uninstalled; the installed preview app and its data were not touched. Disposable accounts and journal deleted; scratch project contents cleared.
- **Evidence (cropped, disposable data only):** `docs/screenshots/2026-10-19-font-scale-hardening/`.

### Final Android preview check: packaged APK of `a264175` on the SM-S711U (2026-10-19)

- **Verdict: PASS, with one brief transient observed and reported (below).** The packaged APK behaves like the local debug build verified in the two sections above: live system text-size changes re-flow headers, tabs, journal cards and Explore search exactly as a fresh launch does, and navigation, session, draft, cursor and keyboard focus survive, in three-button and in gesture navigation. No code was changed in this phase.
- **Source / build.**
  - Source: commit `a2641750864ccb54031d079159ed54df98932296` (pushed), built from a clean `git worktree` (`git status` clean, `npm ci`, no `.env`; `tests/release/app.cjs` 19/19 in that worktree).
  - Staging isolation before the build: `npm run check:staging` with the pulled EAS `preview` environment and the staging web app's SDK config, **29/29 checks PASS** (Firebase project, Worker URL, media origin, no native Google service files). No emulator variable in the pulled environment or the shell.
  - EAS build **`a51b0e06-46d9-4643-8206-d1edf17389b7`** (profile `preview`, SDK 54, version 1.0.0 (1), FINISHED 2026-10-19T23:22Z). Logs: https://expo.dev/accounts/ravitejatravelsoul/projects/solotravelsoul/builds/a51b0e06-46d9-4643-8206-d1edf17389b7
  - **APK:** https://expo.dev/artifacts/eas/lQ_vWqb05wNSnLW1_ssAevCbf2dFxs6SUBQCpuVl3QQ.apk, 157,910,532 bytes, SHA-256 `3f0a2827e6d96d3688982f847740b8d0b38fef3281fccddd5bb8c992c40e1d63`.
  - Allowance: the account's build history lists 9 Android preview builds before this one, so this is the 10th (Free allowance 30 per month); one build only, no iOS build, no overage or paid change. The Expo billing page itself was not queried.
  - Inspection of the downloaded APK: package `com.solotravelsoul.app.staging`, label "SoloTravelSoul Staging", not debuggable, `configChanges` = `0x400007b0` (`keyboard|keyboardHidden|orientation|screenLayout|screenSize|uiMode|fontScale`), `FontScaleLayout`, `FontScaleLayoutFlags`, `relayoutReactSurface`, `enableFontScaleChangesUpdatingLayout` and `dangerouslyForceOverride` in the dex, the `fsr-` relayout code in the JS bundle, the staging Firebase project id in the bundle, no Google services resources, no emulator host (the production project id appears only as the guard constant in `packages/shared/src/environment.ts`).
- **Install.** `adb -s R5CWB2VWTWB install -r` on the SM-S711U (Android 16): update in place, `firstInstallTime` 2026-10-11 21:16:22 unchanged, signed-in session kept (the app opened signed in to the owner's account; its feed loaded).
- **Account handling (stated, not hidden).** The phone is signed in to the owner's account, whose password is not available, so signing out was avoided. On the phone, every composer test used an unsent draft in the existing test group "Verify-group" (a group that contains only the owner and deleted test members); nothing was sent from the phone and no setting of the account was changed. Sign-in, authenticated images and offline sending were checked with the same APK on the Android 15 emulator and disposable accounts (below). One mis-sequenced script step reached the group's Group Info screen and typed a stray character into the unsent draft; nothing was saved or sent, and the draft was cleared by hand.
- **Device results (SM-S711U, 1080x2340, 450 dpi; `uiautomator` node bounds, `logcat -b events`, process id; text size via `settings put system font_scale`).**
  - **Live 1.0 to 1.3 to 2.0 to 1.0 with a draft `unsentdraftzq`, cursor two characters from the end, keyboard open (three-button, then gesture):** a character typed after each change landed at the retained cursor position (`unsentdraftXzq`, `unsentdraftXYzq`, `unsentdraftXYZzq`), so draft, cursor and focus survived; keyboard stayed open; composer above the keyboard in every settled state (draft bottom 1291-1292 vs keyboard top 1332); process id unchanged, `wm_relaunch_resume_activity` 0, no `FATAL EXCEPTION`.
  - **Quick successive changes** (seven 0.4 s apart ending at 1.0, six ending at 2.0): composer above the keyboard, draft intact, 2.0 values equal to the single-change 2.0 values. **Leaving the screen with callbacks pending:** change to 2.0, then two Back presses 0.25 s later; and change to 2.0, then Home, restore 1.0 while backgrounded, resume: same process, no crash, the chat re-opened with the composer above the keyboard (both modes).
  - **Background/resume (gesture):** with the draft and keyboard open, Settings round trip at 1.3, Home then 2.0 then resume, Home then 1.0 then resume: same process, no relaunch, draft intact, header title box 252x61 (1.0) / 320x77 (1.3) / 443x106 (2.0) / 252x61 (back at 1.0), composer above the keyboard each time.
  - **Headers, tabs, journal card, Explore search (Explore opened and scrolled at 1.0, then changed live; both navigation modes; disposable journal with a 57-character author name and 1,234,567 likes):** 1.0 / 1.3 / 2.0 / back to 1.0. Search field box 61 / 77 / 106 / 61 px (the bar itself 118 px at 1.0, 151 px at 2.0, text not clipped); "Popular Journals" 394 / 465 / 653 / 394 px wide; journal title 148 / 156 / 208 / 148 px tall; author 553 / 524 / 475 / 553 px wide; "1 min read" 189 / 249 / 348 / 189; likes "1.2M" 92 / 121 / 170 / 92; tab labels 39 / 51 / 51 / 39 px tall (capped at 1.3 by design, "Community" scaled to fit). Fresh-launch controls at 2.0 and 1.3 give the same values (within 1-2 px on one height). The chat header and bubbles equal a fresh launch too (title 320x77 at 1.3, 443x106 at 2.0 live and fresh).
- **Temporary keyboard overlap: observed, with the method stated.** Not inferred from screenshots taken seconds later: the phone screen was recorded (`screenrecord`, 540x1170, frames about 8 ms apart while the screen animates) while the text size changed with the keyboard open and a draft in the composer, and every frame was classified (keyboard top, composer pill visibly above the keyboard or not). 17 recordings: three-button 1.0 to 1.3, 1.3 to 2.0, 2.0 to 1.0 (five times), 1.0 to 2.0, 1.3 to 1.0, 2.0 to 1.3; gesture the same seven transitions (2.0 to 1.0 twice).
  - **Observed:** in **2 of the 5 three-button 2.0 to 1.0 recordings** the composer faded out and was **not in its place above the keyboard for about 100 to 170 ms** (99 ms and 166 ms measured; only a faint top edge of the composer visible at the keyboard edge), then reappeared at its correct size above the keyboard. The keyboard top stayed at 1332 px throughout. The composer was fully visible and settled with a 42 px gap above the keyboard at the end of every recording.
  - **Not observed:** in the other 3 three-button 2.0 to 1.0 recordings and in all other transitions (growing the text size, 1.3 to 1.0, 2.0 to 1.3), nor in any of the 7 gesture recordings (there the composer text cross-fades from the 2.0 to the 1.0 size with the composer above the keyboard in every frame). The occurrence is irregular, so absence in the other runs is not a guarantee. One recording saw the keyboard top shift by 2 px for a single frame.
  - Limits of this measurement: only the composer-above-keyboard condition was classified automatically; timing is relative to the first affected frame (about 10 ms resolution, screen recording adds load); the cause (a Samsung keyboard/inset change at the end of the cross-fade versus the app's re-commit) was not isolated. The earlier timed keyboard re-send (700/1600 ms) is unchanged.
- **Smoke checks with disposable staging fixtures (same APK, Android 15 emulator, `pm clear` first).**
  - **Sign-in:** the sign-in form accepted a disposable account and opened the Feed.
  - **Authenticated image:** after the clean sign-in the staging demo post's image rendered (images are served by the staging Worker with the user's token).
  - **Offline messaging (DM between two disposable accounts):** airplane mode on: banner "Offline - messages will send when reconnected", message shown as a faded pending bubble, **0** server copies while offline; airplane mode off: after about 30 s the bubble turned solid and exactly **1** server copy existed, the same count read from the other account.
  - The emulator froze once ("system isn't responding", before these checks) and was restarted with `emu kill`; nothing was lost.
- **Limitations retained.**
  - Tab labels stay capped at 1.3x by design.
  - Native dialogs (`Alert.alert`, about twenty screens) are Android-rendered, are outside the JS hook, did not follow the text size and were verified for one dialog on the debug build; they were **not** re-tested on the packaged APK (the only reachable dialog would sign the owner's account out).
  - A Text/TextInput that sets both `nativeID`/`id` and `testID` itself is not re-committed.
  - iPhone not tested; the production app variant was not installed or tested; other Android versions and OEMs not tested; the keyboard re-send is timed, not event-driven.
- **Restored / removed.** Phone: three-button navigation (`navigation_mode` 0, gesture overlay off), text size 1.0, "stay awake while charging" 0 (enabled temporarily), airplane off, Wi-Fi and mobile data on, 1080x2340 at 450 dpi; the owner's session, data and feed untouched; the updated preview app stays installed. Emulator: font 1.0, airplane off, app data cleared. Removed only what was created here: the disposable journal and the two disposable accounts (with their DM), the scratch worktree, the pulled EAS environment file and the screen-recording tooling (`av`). `.claude/settings.json` untouched.
- **Evidence (cropped, disposable data or composer/keyboard only):** `docs/screenshots/2026-10-19-final-preview-check/` (installed-APK Explore/journal/search/tabs at 2.0 live and fresh, composer after quick changes, frame sheets of the 2.0 to 1.0 transitions with and without the transient, emulator offline pending/delivered and authenticated image).

## 11. Moderator onboarding (prepared; nobody appointed, no production roles granted)

**Store requirements (verified 2026-10-10 against the official texts):**
- **Apple App Review Guideline 1.2** requires, for user-generated content:
  - a method for filtering objectionable material;
  - a mechanism to report offensive content, with timely responses to concerns;
  - the ability to block abusive users;
  - published contact information.

  It sets no number of moderators and no response time ([developer.apple.com](https://developer.apple.com/app-store/review/guidelines/#user-generated-content)).
- **Google Play's User Generated Content policy** requires:
  - acceptance of terms or a user policy before users post;
  - definitions of objectionable content;
  - in-app reporting and blocking (blocking for 1:1 interaction);
  - "robust, effective, and ongoing" moderation.

  It sets no moderator count or hour targets ([support.google.com](https://support.google.com/googleplay/android-developer/answer/9876937)).
- The app already provides the term filter, reporting with auto-hide at 3, blocking, the moderation queue, removal, suspension and the published contacts. **Staffing and the targets below are project recommendations.**

**Roles (proposed):**

| Role | Who (owner fills in) | Responsibility |
|---|---|---|
| Project owner | — | Grants and revokes the moderator role, owns the blocked-term list, approves suspensions over 30 days, handles legal and law-enforcement requests |
| Primary moderator | Teja (owner), decided 2026-10-11 | Works the queue daily, oldest first; records a resolution on every report |
| Backup moderator | Not decided | Covers the primary's absence; checks the queue age daily |

**Proposed response targets (recommendations; the owner is still confirming whether they can be met):**
- **Safety:** child safety, credible threats or self-harm within 4 hours.
- **Abuse:** harassment, hate or sexual content within 24 hours.
- **Other:** spam, fake profiles and everything else within 72 hours.
- **Escalation:** anything older than its target goes to the owner. Child sexual abuse material is removed, the account suspended, the report kept and reported to NCMEC (CyberTipline) or the national authority. Imminent danger goes to local emergency services.

**Onboarding steps (existing tools):**
1. The moderator creates a normal app account. The owner records its UID; it is never sent in chat.
2. Grant on staging first: `npx tsx scripts/grantModerator.ts --project solotravelsoul-staging --uid <UID>` (dry run), then add `--apply`. Production requires `--production` and is part of the production rollout approval. Revoke with `--revoke`.
3. Walk through the queue on staging: Profile → Safety & Guidelines → Moderation queue.
   - Show the reported item, then use Dismiss, Remove (also deletes its photos), Restore, or Suspend author. One decision resolves every open report on that item.
4. **Lifting a suspension:** there is no in-app screen (an optional feature). The owner deletes `accountSuspensions/{uid}` in the Firebase console, or a moderator calls `unsuspendUser`.
5. **Web deletion requests:** verify that the requester owns the account email first, then `POST /admin/account-deletion` with the admin token (section 10 procedures).
