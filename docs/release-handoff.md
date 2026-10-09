# Release handoff (free tier: Firebase Spark + Workers Free + KV/D1)

Status at commit time: **not store-ready.** Staging is consolidated and live-verified (see below and `docs/release-hardening.md`). Two Android preview APKs were built and tested on an Android 15 emulator (section 10). The second verified the device fixes; one follow-up fix (keyboard while offline) still needs a build. Production is untouched, and the iOS, build and owner items in section 9 are still open. Everything marked *draft* must be confirmed by the app owner before it is entered in a console. No owner, staff member or completed operation is assumed here.

Technical detail and test evidence: `docs/release-hardening.md` (latest section: "Consolidated staging on the Durable Object host").

## 0. Current staging state

- **API/media host:** `https://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev`, one Worker. A thin front forwards to SQLite-backed Durable Objects, which authenticate and run the handlers. The same origin serves media URLs, the EAS `preview` Worker URL and the app's token attachment.
- **Maintenance:** one schedule, `*/5 * * * *`, via an internal RPC to a fixed maintenance object.
- **Rollback:** `cd workers/r2-upload-worker && npx wrangler deploy --env staging --var API_HOST_MODE:worker` (verified live); return with `npx wrangler deploy --env staging`.
- **Active staging credentials:**
  - One service-account key (ID ending `615e6b`) in the Worker secret `GOOGLE_SERVICE_ACCOUNT_JSON`.
  - The Worker secret `ADMIN_DELETION_TOKEN`, which the owner must rotate and store.
  - No other user-managed keys exist for `sts-staging-deleter`.
- **Retired:** the proof Worker `solotravelsoul-api-do-staging` (deleted) and its key (revoked).
- **Disposable test accounts:** earlier live-test runs left some in staging Auth/Firestore (emails `sts-live-<run>-<key>@example.test`). Delete them when staging testing is finished. The native run of 2026-10-09 removed all of its own (section 10).

## 1. Open decisions and owners (to be named)

| Item | Needed before | Owner | Status |
|---|---|---|---|
| Approve the staging approval packet (release-hardening.md → "Staging approval packet") | any staging write or build | app owner | open |
| Appoint at least two moderators and confirm response targets (release-hardening.md → "Responsibilities, response targets and escalation") | store submission (App Store 1.2) | app owner | open: no moderators appointed in staging or production |
| Choose how old app versions are retired (section 5) | production rules deploy | app owner | open |
| Decide the legacy media path (section 6) | production Worker deploy | app owner | open |
| Confirm the privacy answers (section 3) | console entry | app owner | open: drafts only |

## 2. Account-deletion URL

- Served by the Worker at `GET /account-deletion` (in-app steps, email request, what is deleted and kept). Operator fulfilment: `POST /admin/account-deletion` with the `ADMIN_DELETION_TOKEN` secret.
- Production URL to enter in Play Console: `https://<production worker host>/account-deletion`. It must be reachable on the production Worker **after** the Worker with KV/D1 bindings is deployed. Verify it on a phone browser first.
- Staging URL (for testing only, live): `https://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev/account-deletion`.
- Privacy contact used in the app and page: `privacy@solotravelsoul.app`. Confirm that the mailbox exists and is monitored.

## 3. Store privacy answers (draft)

Derived from the current code, which differs from the older tables in `docs/PLAY_STORE_SUBMISSION_CHECKLIST.md` Step 7 and `docs/APP_STORE_SUBMISSION_CHECKLIST.md` Step 7. Correct those files once confirmed.

| Data | Collected | Shared with other users | Notes from code |
|---|---|---|---|
| Name, email | Yes (required) | Name and photo appear on public profile, posts, comments and chats | Email is used for sign-in and an exact-match lookup directory; it is not listed publicly |
| Photos | Yes (optional) | Yes, when attached to public posts, journals or the profile | Stored by the Worker (KV/D1); access is checked on every request; copies already downloaded cannot be recalled |
| User content (trips, journals, posts, comments, reviews) | Yes | Public posts and journals; trips are private unless published | — |
| Messages (direct and group chats) | Yes | With the chat participants | Kept for the other participants after deletion, with the name shown as "Deleted User" |
| Location | Device position used on-device (`services/locationService.ts`); the user-entered city is stored | City and destination are shared with other users only through the opt-in Nearby Travelers feature | Confirm whether coordinates are sent to Mapbox/Foursquare place searches. If so, declare approximate location processed by service providers |
| Crash logs / analytics | **No SDK found** (no Crashlytics or analytics package in `apps/mobile/package.json`) | — | The older checklist's Crashlytics row is wrong unless an SDK is added |
| Push token | Check `expo-notifications` usage before declaring | — | Confirm with the owner |

- Encrypted in transit: yes (HTTPS to Firebase and the Worker).
- Deletion: in-app (Profile → Delete account) and the web URL above. Deletion can end in a **blocked** state if legacy media cannot be verified as deleted. The account stays locked and is completed later, so state "deletion may take time" rather than "immediate".
- Data not sold; no advertising SDKs found.

## 4. Store submission placeholders

`apps/mobile/eas.json` → `submit.production` still holds `REPLACE_WITH_YOUR_APPLE_ID`, `REPLACE_WITH_YOUR_APP_STORE_CONNECT_APP_ID` and `REPLACE_WITH_YOUR_APPLE_TEAM_ID`. Android needs `google-play-key.json` locally (gitignored). iOS distribution needs an Apple Developer Program membership, which is a paid account. It is out of scope under the no-paid-plans constraint and listed as a blocker, not a recommendation.

## 5. Old-client rollout requirement

The current rules reject old app versions: bulk email queries, comment batches without action IDs, separate DM writes, and Firebase Storage uploads (removed). Before deploying the rules to production:

1. Release the new app version and wait for adoption, or ship a forced-update gate. A gate has not been implemented; that is a decision for the owner.
2. Deploy the rules only once old clients are acceptably retired. Old clients then fail closed: they cannot write.
3. Run the counter audit (section 7) and repair before testing unlike/unfollow on production data.

## 6. Legacy media

Read-only inventory, made with the logged-in Firebase CLI account (counts only):

| Store | Result |
|---|---|
| Production Firebase Storage `solotravelsoul-57a9e.firebasestorage.app` | bucket readable by the owner account; **2 objects, both under `profile_images/`** |
| Production `solotravelsoul-57a9e.appspot.com` | bucket does not exist (404) |
| Staging `solotravelsoul-staging.firebasestorage.app` / `.appspot.com` | do not exist (404): never provisioned |
| Production legacy R2 `solotravelsoul-images` | not inventoried: Wrangler access exists, but a production R2 listing has not been authorized in any phase so far |

The two `profile_images/*.jpg` objects stay **unresolved** until their deletion is independently verified by a fresh listing. Separate, approval-gated steps (none run):

1. **Migration dry run:** `ADMIN_DELETION_TOKEN=… npx tsx scripts/migrateLegacyMedia.ts --project solotravelsoul-57a9e --worker <production worker> --state <file> --source firebase`. This needs the production Worker with KV/D1 bindings and operator application-default credentials. Review the counts.
2. **Migration apply** (`--apply`): only after approval. Verify each import with the digest endpoint; the state file records `verified`/`referenced`.
3. **Source deletion:** a separate approval. Delete only objects whose state is `referenced` (or whose owner account no longer exists), using the owner's credentials. Then run a fresh listing of `profile_images/`, which must show none of them, and record the result in `legacyMediaCleanup/{uid}`. Until then, account deletions for those owners report `blocked` and keep Auth.

## 7. Counter repair (dry run prepared, not run)

`npx tsx scripts/auditCounters.ts --project <project> [--report <local file>]` reads posts, journals, likes, saves, comments, follows, profiles and members, and compares every stored counter with its relationship documents. It prints totals per counter and writes mismatching paths only to the local report file. It has no write path. Run order: staging first, then production with approval. It reads every document once, which counts against Spark's 50,000 reads/day. Repairs are a separate approved step, written from the report.

## 8. Native and live verification

Checklist: `docs/release-hardening.md` → "Live and native verification checklist". The staging backend is deployed and live-verified (section 0). **Android:** the preview APK (build `07c0e312`) was installed and the checklist run on an Android 15 emulator on 2026-10-09: results, defects and evidence are in section 10. A second preview build (`aa5c4b9e`, commit `1cc9600`) verified those fixes on the same emulator. One gap remains: the keyboard while the offline banner shows. It is fixed in code afterwards and needs one more build to verify (section 10). **iOS:** BLOCKED (no macOS; device builds need a paid Apple Developer membership). Builds exported with `expo export` and mocked tests are not proof of native UI behaviour.

## 9. Consolidated remaining blockers (owner actions)

1. **Native Firebase files: resolved for preview.** The app uses the Firebase JS SDK only (no `googleServicesFile`, no `@react-native-firebase`). `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICE_INFO_PLIST` were single EAS variables shared by production, preview and development. `preview` was unlinked; production and development keep them (values unchanged).
2. **Preview keys (optional):**
   - **Not required for a preview build.** `@rnmapbox/maps` 10.3.1 downloads the Android SDK without a token, and app config no longer passes one (the old option was misspelled and ignored).
   - **Mapbox maps:** without `EXPO_PUBLIC_MAPBOX_ENABLED=true` and a public `EXPO_PUBLIC_MAPBOX_TOKEN`, the app shows its placeholder map. To test Mapbox maps on a device, the owner adds both to EAS `preview`.
   - **Foursquare:** stays off unless `EXPO_PUBLIC_FOURSQUARE_ENABLED=true` (with `EXPO_PUBLIC_FOURSQUARE_API_KEY`); it is not needed.
3. **Builds:** the first Android preview build ran on 2026-10-09 (build `07c0e312`, section 10).
   - **Cost:** EAS Free plan, 2 of 30 builds used in the cycle ending 2026-11-01, $0.
   - **Second build:** `aa5c4b9e` (commit `1cc9600`) verified the device fixes (section 10).
   - **Next:** the offline-banner keyboard fix (committed after that build) needs one more preview build (owner approval) and a re-check of chat input while offline.
   - **iOS:** device builds need a paid Apple Developer membership, outside the no-paid-plans constraint.
4. **Device testing:** Android checklist run on an emulator (section 10): all items PASS or have fixed defects. `GET /admin/deletion-status` is BLOCKED until the owner supplies the rotated staging admin token. iOS is BLOCKED (no macOS). A physical Android device run is still advisable before submission.
5. **Legacy production media:** the 2 `profile_images/*.jpg` objects in production Storage stay unresolved until deleted and verified by a fresh listing (section 6); the legacy R2 inventory is not taken.
6. **Moderators and response targets:** none appointed; at least two are needed before submission.
7. **Privacy answers:** section 3 drafts need confirmation (location to place-search providers, push token).
8. **Old-client retirement:** decide forced update or adoption window before production rules (section 5).
9. **Production rollout** (separate approval):
   - production KV/D1 bindings, then the Durable Object binding and migration on the production Worker (as in `[env.staging]`);
   - production secrets, rules and indexes;
   - monitoring (`scripts/stagingUsage.cjs` against the production script);
   - a decision on the production cron.
10. **Quota ceilings to accept or plan for on Free/Spark:** about 1,000 uploads/day (KV writes), about 1,000 media deletions/day (KV deletes; the excess completes the next day), about 17,000–25,000 media views/day (Firestore reads), 100,000 API calls/day.
11. **Housekeeping:** rotate the staging admin token; delete the disposable staging test accounts.

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
9. **Health check afterwards:** `node scripts/stagingUsage.cjs` (with `STS_ADMIN_TOKEN` for stalled deletions).

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
| 2 | Keyboard covers inputs | **PASS online**: comments sheet, DM and group inputs sit above the keyboard; send works with the keyboard open. **FAIL while offline:** the global offline banner pushes the screens down, and the chat input sits behind the keyboard by the banner's height. Fixed in code afterwards (the banner now overlays the status-bar area, with a regression check); **not verified natively**, since it needs another build. |
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

**Observation (not fixed):** `useNetworkState` re-checks connectivity only on mount and when the app returns to the foreground. While the app stays open, losing the network is not detected: no offline banner appears and sends are not queued by the app (Firestore's own buffer holds them).

**Health re-check (analytics, fresh window):**
- The 12.29 ms front-Worker CPU p99 reported earlier comes from version `e784bd26` (the pre-consolidation worker-mode build) in the hours before 10-09 02:19Z. That window includes the consolidation deploy and the rollback test.
  - The script reports the **maximum** of per-status-group p99s over 24 h.
  - Since version `b228b58f` (object mode, from 02:19:23Z) the hourly front p99 is 0.64–2.98 ms, with no Worker errors.
- The single Durable Object error falls in the 15:00Z hour, with status `clientDisconnected` and no exception recorded in analytics. It coincides with the deliberate force-stop of the app during the abandoned-deletion test (15:13:27Z); the front Worker logged 2 `clientDisconnected` requests in the same hour.
- Workers Logs could not be read with the local Wrangler OAuth token (Telemetry API "Authentication error"), so the exact request is not proven. No defect was reproduced; nothing was redesigned.

**Admin checks:** `GET /admin/deletion-status` is BLOCKED; no staging admin token is available to this run.

