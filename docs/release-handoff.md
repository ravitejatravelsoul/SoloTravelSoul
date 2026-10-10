# Release handoff (free tier: Firebase Spark + Workers Free + KV/D1)

Status at commit time: **not store-ready.** Staging is consolidated and live-verified (see below and `docs/release-hardening.md`). Three Android preview APKs were built and tested on an Android 15 emulator (section 10); every device defect found so far is fixed and verified there. Production is untouched, and the iOS, build and owner items in section 9 are still open. Everything marked *draft* must be confirmed by the app owner before it is entered in a console. No owner, staff member or completed operation is assumed here.

Technical detail and test evidence: `docs/release-hardening.md` (latest section: "Consolidated staging on the Durable Object host").

## 0. Current staging state

- **API/media host:** `https://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev`, one Worker. A thin front forwards to SQLite-backed Durable Objects, which authenticate and run the handlers. The same origin serves media URLs, the EAS `preview` Worker URL and the app's token attachment.
- **Maintenance:** one schedule, `*/5 * * * *`, via an internal RPC to a fixed maintenance object.
- **Rollback:** `cd workers/r2-upload-worker && npx wrangler deploy --env staging --var API_HOST_MODE:worker` (verified live); return with `npx wrangler deploy --env staging`.
- **Active staging credentials:**
  - One service-account key (ID ending `615e6b`) in the Worker secret `GOOGLE_SERVICE_ACCOUNT_JSON`.
  - The Worker secret `ADMIN_DELETION_TOKEN`, rotated 2026-10-10. The encrypted owner copy and its procedures are in section 10, "Staging admin credential: encrypted owner copy and procedures".
  - No other user-managed keys exist for `sts-staging-deleter`.
- **Retired:** the proof Worker `solotravelsoul-api-do-staging` (deleted) and its key (revoked).
- **Disposable test accounts:** earlier live-test runs left some in staging Auth/Firestore (emails `sts-live-<run>-<key>@example.test`). Delete them when staging testing is finished. The native run of 2026-10-09 removed all of its own (section 10).

## 1. Owner decisions (one table, 2026-10-10)

Every open decision is in this table. Recommendations come from the code and the checks recorded in this file; nothing has been decided or appointed.

| Decision | Recommendation | Consequence | Required input |
|---|---|---|---|
| Moderators and coverage | Name a primary moderator and a backup (project recommendation, not a store rule) and adopt the response targets in section 11 | Without anyone working the queue, the "timely responses" (Apple 1.2) and "robust, ongoing moderation" (Google Play) requirements cannot be met; reports are only auto-hidden at 3 | Who (the accounts to grant later), and confirmation of the targets |
| Privacy answers | Declare per section 3: no device location, no push token, no analytics; retained items as listed | Store forms must match the shipped build; enabling Mapbox or Foursquare later changes the answers | Confirm section 3, the privacy mailbox, and that Mapbox/Foursquare stay off for release |
| Old clients | **Answered:** the owner confirmed on 2026-10-10 that neither the Expo app nor the legacy Swift app (`Raviteja.SoloTravelSoul`) was ever distributed. So: no forced-update gate, no adoption window, and nothing to retire for users. Deploy the new rules with the first store release (section 5). | No installed old clients exist to break | None |
| Legacy data and media | **Answered:** the owner confirmed on 2026-10-10 that the Swift app's production data is disposable test data. No migration: after the inventory (section 6, step 0), delete the 2 `profile_images/*.jpg` (step 3) and clear the Swift-era test data. Each step is a separate production write. | Until done, deletions for those owners end `blocked` and keep the account in Auth | Approval and a date for the inventory, then for the deletions |
| Production counter audit | Approve the sizing count first, then the full read-only audit if the count fits the budget (section 7) | Without it, counters are unverified before the stricter rules | Approval and a low-traffic day |
| Production rollout | Approve as one change set: production EAS variables, Worker bindings and Durable Object migration, secrets (including a production admin token stored with the section 10 procedure), rules, indexes, cron | Nothing in production changes until then; store review needs a working production backend | Approval and a date |
| Store accounts and iOS | Android first; iOS only if a paid Apple Developer membership is accepted | iOS stays BLOCKED otherwise | Play Console access and service-account key (kept local); the decision on iOS |
| Free/Spark ceilings | Accept for launch and monitor with `scripts/stagingUsage.cjs` | Above the ceilings, uploads, deletions or views fail until the next day | Acceptance |

## 2. Account-deletion URL

- Served by the Worker at `GET /account-deletion` (in-app steps, email request, what is deleted and kept). Operator fulfilment: `POST /admin/account-deletion` with the `ADMIN_DELETION_TOKEN` secret.
- Production URL to enter in Play Console: `https://<production worker host>/account-deletion`. It must be reachable on the production Worker **after** the Worker with KV/D1 bindings is deployed. Verify it on a phone browser first.
- Staging URL (for testing only, live): `https://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev/account-deletion`.
- Privacy contact used in the app and page: `privacy@solotravelsoul.app`. Confirm that the mailbox exists and is monitored.

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

**Owner confirmation needed:** that `privacy@solotravelsoul.app` exists and is monitored.

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

### Legacy media approval packet (prepared; nothing run)

**Owner answer (the owner confirmed on 2026-10-10):** the legacy data is disposable test data. Use steps 0 and 3 only: inventory, then deletion with a fresh listing. Migration (steps 1 and 2) is not needed. Step 3's rollback note then only asks for an offline copy if wanted.

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

**Production (prepared; not run):**
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
- Three Android preview builds (EAS Free, 3 of 30 used, $0) and the native checklist on an Android 15 emulator: all device defects found are fixed and verified.
- Staging admin endpoints verified: a valid token is accepted, missing or wrong tokens are refused, and a stalled/unresolved fixture is reported and cleaned up (2026-10-10).

**A. Required before release (owner decisions or approvals):**
1. **Staging admin token: done (2026-10-10).** Rotated, and the encrypted owner copy is stored (section 10). Valid-token, refusal and stalled-fixture checks pass. Production needs its own token (item 6), handled with the same procedure.
2. **Moderation staffing:** the stores require working reporting, blocking, filtering, timely responses and ongoing moderation (Apple 1.2; Google Play user-generated content). They do **not** set a number of moderators. Project recommendation: a primary moderator plus a backup, with the targets in section 11. Until someone is appointed, reports are only auto-hidden at 3.
3. **Privacy answers** (section 3): confirm the location and push-token rows, and confirm that `privacy@solotravelsoul.app` exists and is monitored.
4. **Old clients: decided** (the owner confirmed on 2026-10-10: nothing was distributed). No forced update or adoption window; the rules deploy with the first store release (section 5).
5. **Legacy media and test data** (section 6): the owner confirmed disposable test data, so they are deleted, not migrated. Each step is approval-gated:
   - delete the 2 production `profile_images/*.jpg` (packet steps 0 and 3; step 1 is optional, steps 2 and 4 are not needed) and verify with a fresh listing;
   - inventory the legacy R2 bucket.
6. **Production rollout** (separate approval):
   - KV/D1 bindings, then the Durable Object binding and migration on the production Worker;
   - production secrets (including its own `ADMIN_DELETION_TOKEN`), rules and indexes;
   - the cron decision and monitoring (`scripts/stagingUsage.cjs --script <production>`);
   - then the production account-deletion URL in Play Console (section 2).
7. **Counter audit** (section 7): dry run, then an approved repair on production before the rules deploy.
8. **Store submission:**
   - production builds;
   - replace the `eas.json` `submit.production` placeholders and provide `google-play-key.json` locally (section 4);
   - store listings.
   No submission has been made.
9. **Physical-device check:** one run of section 10's checklist on a real Android phone before submission; so far only an emulator has been used.
10. **iOS:** only if iOS is in scope. It needs macOS and a paid Apple Developer membership, which is outside the no-paid-plans constraint; it is BLOCKED otherwise.
11. **Free/Spark ceilings:** accept them or plan for them: about 1,000 uploads/day (KV writes), about 1,000 media deletions/day (KV deletes; the excess completes the next day), about 17,000–25,000 media views/day (Firestore reads), 100,000 API calls/day.

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
| Primary moderator | — | Works the queue daily, oldest first; records a resolution on every report |
| Backup moderator | — | Covers the primary's absence; checks the queue age daily |

**Proposed response targets (recommendations):**
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
