# Release hardening from 40fff39

This branch fixes Firebase environment validation in Expo device bundles; queue lost updates, cross-trip coalescing and duplicate drains; account-switch state; private post/journal reads; social relationship ownership and atomic counters; comment/reply transactions; DM retries, previews, unread counts and newest-message subscriptions; profile counter preservation; and enumerable email-directory queries. Privacy text now describes public photo links and foreground location use accurately.

## Verification

- `npm ci`, then `npm run type-check`, `npm run lint`, `npm run test:release`.
- Install a compatible Firebase CLI separately; `npm run test:rules` starts a demo-project Firestore emulator on port 8188. The tests exercise the actual client functions. Java 17 / firebase-tools 14.17.0 was used for this review.
- From `apps/mobile`: `CI=1 EXPO_OFFLINE=1 npx expo export --platform ios --platform android --no-bytecode --max-workers 2 --output-dir <temporary-output>`.
- Emulator success and JS exports do not verify device permissions, native builds, real production configuration, or store acceptance.

Verified in this change: 13 queue/startup/session checks and 23 Firestore integration/security checks passed. Full typecheck passed; lint passed with existing warnings. Both iOS and Android JavaScript exports passed. The migration script typechecked; it was not run against production.

## Coordinated rollout required

Do not deploy only these rules while old clients remain active. Old clients use bulk email queries, comment batches without action IDs and separate DM writes, which the new rules reject. Stage and validate the updated app first; decide how to retire old clients before enforcing these rules.

1. Back up production data and inspect existing social relationships/counters. Earlier rules allowed forged relationships and arbitrary counters; this branch prevents new abuse but does not establish the provenance of historical data. Repair invalid or negative counters with trusted administration before testing unlike/unfollow.
2. Run `npx tsx scripts/backfillEmailLookup.ts --project <staging-project>` with operator application-default credentials. It is read-only by default, logs counts rather than emails, and refuses to overwrite an alias belonging to another UID. Review conflicts; add `--apply` only for the intended project. Repeat the reviewed process for production. The client also populates its own alias at sign-in, but dormant users require this backfill to remain discoverable by exact email.
3. Deploy the indexes in `firestore.indexes.json`, including the new author + visibility indexes for posts and journals, and wait for them to become ready. The emulator does not enforce production composite-index provisioning.
4. Validate two-user flows in a staging native build: login/logout/account switch, offline edits on two trips, reconnect from a non-trip screen, comment/reply/edit/delete, like/unlike, save/unsave, follow/unfollow, public/private visibility, exact email search, blocking, DM retries and unread badges.
5. Deploy updated rules as part of the coordinated app rollout. No production deployment was performed by this change.

## Account deletion (server-side)

`POST /account/delete` on the R2 worker (`workers/r2-upload-worker/src/accountRoute.ts`, `accountDeletion.ts`) deletes an account with Admin credentials held only as a Worker secret. The app reauthenticates with the password, sends a force-refreshed ID token, and the Worker rejects tokens whose `auth_time` is older than 5 minutes.

- Deleted: `users/{uid}` and every subcollection, saved places, directory entries (exact-email alias only when it still belongs to the user), public profile, nearby/reputation docs, block list, notifications, place reviews, activity feed, posts, journals, stories, owned public trips/groups (with member subcollections), join requests, the user's likes/saves/follows, memberships, R2 `profile_photos/{uid}/` + `post_photos/{uid}/`, Firebase Storage `profile_photos/`, `trip_covers/`, `journals/` for the UID.
- Counters on other users' documents (likes, saves, comments, replies, followers/following, memberCount) are released in the same atomic commit as the relationship, with optimistic preconditions; never below zero.
- Preserved, anonymized as "Deleted User": the user's comments on others' posts (tombstoned, replies kept), sent chat messages, group chat previews, DM participant info, notifications delivered to others. Safety reports are retained.
- Barrier: `accountDeletions/{uid}` is created before any step and never removed. Every client write rule in `firestore.rules` and every write in `storage.rules` (cross-service `firestore.exists`) refuses that UID while it exists, and the Worker upload endpoints check it before storing and again after (removing an object whose upload was in flight when deletion began). Other devices and still-valid ID tokens therefore cannot recreate data during or after deletion. Rules also refuse new inbound relationships to a deleting account or its content (likes, saves, follows, comments, replies, trip/group memberships, join requests) and new chat links: creating or adding to a chat group with a deleting member, creating a direct chat with one, or sending a direct message to one (the message, and the preview update). Existing chat history stays readable and can be marked read. Because rules cannot iterate a member list, each group create/update may add at most 8 members, each checked against the barrier; `createGroup` adds larger groups in chunks of 8 (pending members are hidden until added) and drops any member the rules refuse, with that member's identity fields. Unrelated users' writes are unaffected. Uploads fail closed with 503 `uploads/unavailable` when the Worker has no usable service-account secret to read the barrier.
- Late media and finalization: before Auth removal the job durably records `mediaClearedAtMs` and `pendingFinalization: true`. The hourly cron (1) completes any job still pending finalization. Recovery is fenced: it first claims the job lease with a conditional write on fresh state (refused if a live attempt holds it, and refusing user retries and other cron runs while it works), then re-verifies ownership with a conditional lease renewal immediately before removing a remaining Auth user, and stops if the lease was lost. Recovery never runs under another attempt's live lease, so a lost final write is completed on the first cron run after that lease expires; a lost final bookkeeping write or a failed Auth removal never depends on the user signing in again. (2) It resumes deletions that stopped before Auth removal (failed step, lost lease, or a Worker request that ran out of subrequests) through the normal fenced plan, skipping jobs under a live lease. (3) It sweeps media for every job whose media was cleared in the last 24 h, regardless of completion status, covering uploads that were authorized before the barrier and finished after the media step.
- Attempts: each request claims the job with a unique `attemptId` and a 5-minute lease, renewed whenever less than half remains while it works (including per media page). Every job update is conditional on owning the job (`attemptId`, `in_progress`, unexpired lease, document `updateTime`). An attempt whose lease expired or was taken over stops at its next operation and cannot mark a newer attempt failed or overwrite a completed job.
- Retry safety: steps are idempotent and rediscover work on every attempt. Firebase Auth is deleted only after every data and media step succeeds. After a failure some data may already be deleted and the account is locked against changes (barrier); the hourly cron finishes the deletion, and the user can also sign in and retry.
- Likes and saves by any user that point at the deleted user's own posts/journals are removed together with that content; other users' likes/saves on other content are untouched.
- The client pauses offline sync during deletion and, only after success, clears every AsyncStorage key containing the UID (caches, sync/chat queues, reminder IDs) and cancels scheduled reminders.

### Rollout prerequisites

1. Uploads now require the `GOOGLE_SERVICE_ACCOUNT_JSON` secret (barrier read) and return 503 without it — set the secret before deploying this Worker. Grant the Firebase Storage service agent access to Firestore for cross-service rules (the console prompts on first deploy of `storage.rules`); without it the Storage barrier denies all writes. Then create a dedicated service account with Cloud Datastore User, Storage Object Admin (Firebase bucket) and Firebase Authentication Admin roles; `wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON`. Confirm `FIREBASE_STORAGE_BUCKET` in `wrangler.toml`. Without the secret the endpoint returns 503 and deletes nothing.
2. Deploy `firestore.indexes.json` field overrides (collection-group `members.uid`, `messages.senderId`) and wait for them; production rejects those queries until then.
3. Deploy the Worker (including its hourly cron trigger) to staging, set `EXPO_PUBLIC_R2_UPLOAD_WORKER_URL` for the staging build, and validate with two accounts on native builds: wrong password, stale login, deletion with posts/comments/follows/chats/photos, forced failure + retry, and that the other account's content and counters are intact.

Tests: `npm run test:release` (in-memory store, route gate, client flow) and `npm run test:rules` (same scenario through the real REST adapter on the Firestore emulator). `test:rules` also runs the Storage emulator to verify the cross-service barrier. The R2 / Cloud Storage / Identity Toolkit adapters and the cron trigger are exercised with fakes only; they need staging verification.

## Consolidated store-release review (from d43c603)

### Fixed in this phase

| Area | Defect | Fix |
|---|---|---|
| Groups | Creation interrupted between chunks left a partly populated group visible; an interrupted rollback left it behind. | Members beyond the first chunk are stored in `pendingMembers`; groups with pending members are hidden from every member's list. The creator's client resumes creation whenever it sees the group again, dropping only refused members (updated in the gap closure below). |
| Account deletion | A deletion that stopped mid-plan (step failure, lost lease, Worker subrequest limit) stayed half-done and locked until the user retried. | Hourly cron resumes such jobs through the normal fenced plan; failure messaging and privacy text say deletion completes automatically. |
| Google Play | No web resource for account-deletion requests; no way for an operator to fulfil one. | Worker `GET /account-deletion` page (in-app steps, email request, what is deleted/kept). `POST /admin/account-deletion` (bearer `ADMIN_DELETION_TOKEN` secret, constant-time check, disabled when unset) runs the same plan for a verified request. Privacy screen links the page from the configured Worker URL. |
| App Store 1.2 | Posts, journals, comments and direct chats had no report action; blocked users' posts, journals and comments still appeared. | Report/block menu on post, journal and chat headers and on long-press of others' comments; reports accept `post`/`journal`/`comment` targets. Feed, explore, journal and comment/reply lists hide blocked authors. |
| App Store 1.2 | Terms lacked a zero-tolerance policy for objectionable content/abusive users. | Terms section 5 "Community standards". |
| Google Play policy | `READ_MEDIA_IMAGES` requested although photos are picked occasionally (Photo and Video Permissions policy); `SCHEDULE_EXACT_ALARM` for reminders (exact-alarm policy); `RECORD_AUDIO` added by the image picker. | Removed and blocked (`tools:node="remove"` verified with `expo config --type introspect`); picker no longer requests library permission (system photo picker needs none); expo-notifications falls back to inexact alarms. |
| Login | Biometric button was shown while signed out, where it can never sign in. | Shown only while a session exists. |
| Build | Production builds did not auto-increment with remote versioning; EAS environment per profile implicit. | `autoIncrement` for production; explicit `environment` per profile; `ITSAppUsesNonExemptEncryption=false`. |

Verified current requirements: Google Play target API 36 for new apps/updates from 31 Aug 2026 (the project targets 36 via React Native 0.81); Play account-deletion web resource requirement; Play Photo and Video Permissions policy; App Store guideline 1.2 (filter, report, block, contact info); Cloudflare Workers limits (Free: 50 subrequests per request and 10 ms cron CPU; Paid: 10,000 subrequests).

### Verified results (this phase)

- `npm run test:release`: 13 queue/session checks + 34/34 account-deletion checks (in-memory) — pass.
- `npm run test:rules` (Firestore + Storage emulators): 68/68 rules checks + 29/29 account-deletion checks through the real REST adapter and the Worker entry point — pass. Includes interrupted group creation (hidden, resumed), interrupted rollback (hidden, rolled back on resume), cron resumption of failed and lease-lapsed deletions, operator deletion through the entry point, and the deletion web page.
- Typecheck: all three workspaces and the Worker. Lint: 0 errors (81 pre-existing warnings, none new). iOS and Android JS exports: pass.
- Not performed (no access): native iOS/Android runs, staging two-account tests, real R2 / Cloud Storage / Identity Toolkit / OAuth calls, deployed cron. Emulator and JS-export results do not substitute for these.

### Rollout order

1. **Workers Paid plan.** Free allows 50 subrequests per request; a deletion needs far more. Without Paid, deletion requests fail every time (cron would resume them but each run is also capped). *Superseded: deletion now runs in bounded slices within Workers Free; see "Workers Free media and bounded deletion".*
2. **Staging Firebase project** (separate from `solotravelsoul-57a9e`) with the same rules/indexes; back up production; repair legacy counters (see above); run `scripts/backfillEmailLookup.ts` dry-run then `--apply` on staging.
3. **Credentials**: dedicated service account (Cloud Datastore User, Storage Object Admin on the Firebase bucket, Firebase Authentication Admin) → `wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON`; `wrangler secret put ADMIN_DELETION_TOKEN` (random, stored in a password manager); confirm `FIREBASE_STORAGE_BUCKET`. Uploads return 503 until the service-account secret is set.
4. **Storage-to-Firestore access** for cross-service rules (Firebase console prompt on first `storage.rules` deploy / grant the Storage service agent the Firestore reader role). Without it the Storage barrier denies every write.
5. **Deploy to staging**: indexes and field overrides (wait until ready) → Worker with cron trigger → rules (`firestore.rules`, `storage.rules`).
6. **EAS environment variables** for `preview` and `production`: all `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_STORAGE_PROVIDER=r2`, `EXPO_PUBLIC_R2_UPLOAD_WORKER_URL`, Mapbox/Foursquare keys, `MAPBOX_DOWNLOADS_TOKEN` secret. `.env` is gitignored and is not uploaded to EAS builds. (Local `.env` currently defines `EXPO_PUBLIC_STORAGE_PROVIDER` and the Worker URL twice; the later value wins.)
7. **Native staging test pass** (checklist below), then production in the same order, coordinated with the app release (old clients are rejected by the new rules).
8. **Store consoles**: Play Data safety form + account-deletion URL `https://<worker-host>/account-deletion`; App Store privacy labels; replace `REPLACE_WITH_*` placeholders in `eas.json` submit config and add `google-play-key.json` locally (gitignored).

### Native / staging test checklist (not yet run)

Run on a physical iPhone and an Android 14+ device (preview builds against staging), two accounts A and B:

- Sign up (terms link), log in/out, account switch A↔B: no data from the other account; biometric button absent when signed out.
- Trips: create, edit itinerary/checklist offline on two trips, reconnect from a non-trip screen; reminders schedule and fire (inexact on Android without exact-alarm permission).
- Photos: profile photo, post photos and trip cover via library picker (no permission prompt on Android 13+/iOS 14+) and camera; uploads reach R2.
- Social: post, comment, reply, like/save, follow; A blocks B → B's posts/journals/comments disappear for A, B cannot message A; report a post, journal, comment, chat, profile, trip and group → documents appear in `reports`.
- Chats: DM send/receive offline and online; create a group with 1 and with >8 members; kill the app between chunks on creation → group hidden, then completes on reopen.
- Deletion: wrong password; stale login (>5 min) handled by reauth; delete A with posts/comments/follows/chats/photos; verify on B that counters, comments (tombstones), chats ("Deleted User") are correct and A cannot be followed/messaged/added; force a failure (e.g. revoke Storage access temporarily) → message, then cron completes it; check R2/Storage prefixes empty and Auth user gone; check late upload during deletion is removed.
- Web: open `/account-deletion` on a phone browser; operator endpoint with the admin token on a test UID.
- Release builds: signing, version/build numbers increment, Play pre-launch report, TestFlight review notes (demo account, UGC moderation contact).

### Remaining blockers

- **No native or staging verification** — no Android SDK/emulator or device on this machine, iOS requires macOS, Wrangler is not logged in, and there is no authorized staging Firebase project. All items in the checklist above are unverified.
- **Moderation operations** (App Store 1.2): tooling and enforcement now exist (see Gap closure → Moderation), but at least two moderators must be appointed, the response targets confirmed, and the process staffed before submission. The term filter is a short list and there is no automated image analysis; reported media is hidden at 3 reports and removed by moderators.
- **Operator fulfilment of web requests** requires verifying the requester owns the account email before calling the admin endpoint; the processing time promised on the web page should be confirmed by the owner.
- **Credentials/config** listed in the rollout order (Workers Paid, service account, admin token, Storage-to-Firestore grant, EAS env vars, store submit config) are not set up by this change.
- Public photo URLs remain bearer-link accessible until deleted; legacy data repair and coordinated old-client rollout as described above.
- `SYSTEM_ALERT_WINDOW` and `USE_FINGERPRINT` still appear in the merged Android manifest (template / local-authentication defaults); review in the Play Console permissions report.

## Gap closure (from 1cee3fc)

### Fixed

| Gap | Reproduced failure | Fix |
|---|---|---|
| Recovery identity loss | Verified Auth email differed from the stale emails in `users/` and `userLookup/`; the first attempt failed before the directory step; cron resumed with no token email and completed, leaving the verified-email alias. | The directory step also queries `userLookupByEmail` for every alias whose `uid` is the deleting UID (Admin query; no email stored in the job). Aliases now owned by another UID are never removed. |
| Pending group identity | Another user's group listed the deleting UID in `pendingMembers` (plus `memberInfo`/`unreadCounts`); deletion completed without touching it. | New `pendingGroups` step removes the UID from `pendingMembers` and its `memberInfo`/`unreadCounts` entries, conditional on the group's `updateTime` (a concurrent resume by the creator is re-read, never lost). The creator's resume now drops a refused member (and its identity fields) instead of deleting the whole group, so everyone else is kept. |
| Recovery promises | App, Worker and privacy text promised completion "within a few hours". | Text now says deletion is retried automatically and stuck deletions are flagged to the team. Each cron run reports deletions older than 6 h that are not complete as a structured warning `account_deletion_stalled` (UIDs and step names only) and `GET /admin/deletion-status` (admin token) lists them. Runbook below. |
| Moderation readiness | Report buttons and terms only; no filter, no review workflow, no enforcement. | See "Moderation" below. |

### Moderation

Enforced by `firestore.rules` / `storage.rules` and the Worker, not by the app UI:

- **Text filter** (`packages/shared/src/moderation.ts`): public posts, journals, comments, public profiles (name, bio, city), community groups and public trips are rejected server-side when they contain a blocked term (`clean()` in the rules; the app shows "This contains language that is not allowed"). A release test fails if the rules pattern and the shared list diverge. The list is deliberately short (slurs, explicit sexual and self-harm terms) to avoid false positives; it does not cover hashtags, images or private messages.
- **Media and everything the filter misses — community flagging**: reports are one per reporter and item (`reports/{type}___{id}___{reporter}`). Reports on posts and journals increment `reportCount` in the same write; at 3 distinct reports a public item is switched to `under_review` and disappears from feeds, explore and direct reads for everyone except its author and moderators. Authors cannot restore, edit, delete or recreate it (moderated content is frozen; archiving is still allowed). There is no automated image analysis (no paid AI dependency); photos are covered by this flag-and-hide path plus moderator review.
- **Restricted review workflow**: moderators are listed in `moderators/{uid}` (created only by the project owner in the Firebase console / Admin SDK). Only moderators can list or review reports (`status`: pending → reviewing/actioned/dismissed, with `reviewedBy`, `reviewedAt`). In the app, moderators see **Profile → Safety → Moderation queue** (oldest first) with: dismiss; hide/restore/remove a post or journal; remove a comment (shown as "Removed by a moderator"); suspend the author.
- **Removal deletes media**: removing a post/journal sets `visibility: 'removed'` and calls `POST /moderation/remove-media`, which re-checks the moderator role and the removed state and deletes the R2 objects under the author's own prefix (public R2 URLs are bearer links, so hiding the document alone is not enough). See "Moderation corrections" for its coordination with restores.
- **Suspension**: `accountSuspensions/{uid}` (moderators only) blocks every Firestore write, Storage upload and Worker upload for that account — the same barrier as deletion. Lifting it (delete the document) restores access.

#### Responsibilities, response targets and escalation (owner to confirm before submission)

| Role | Responsibility |
|---|---|
| Project owner | Appoints/removes moderators (`moderators/{uid}`), owns the blocked-term list, approves suspensions longer than 30 days, handles legal requests. |
| Moderators (at least two, so the queue is covered every day) | Work the queue oldest-first, record a resolution on every report, remove violating content and its media, suspend repeat or severe offenders. |

| Report type | Target first action |
|---|---|
| Child safety, credible threats, self-harm (`safety`) | Within 4 hours: hide/remove, suspend, escalate. |
| Harassment, hate, sexual content (`harassment`, `inappropriate`) | Within 24 hours (App Review expects objectionable content to be acted on promptly). |
| Spam, fake profiles, other | Within 72 hours. |

Escalation: child sexual abuse material is never reviewed further or forwarded internally — remove it, suspend the account, preserve the report record, and report to NCMEC (CyberTipline) or the national authority; imminent danger goes to local emergency services; legal/law-enforcement requests go to the project owner (privacy@ / safety@solotravelsoul.app). Review the queue age daily; anything older than its target is escalated to the owner.

### Stalled deletion runbook

1. Alert source: Workers Logs / Logpush on `"event":"account_deletion_stalled"`, or `curl -H "Authorization: Bearer $ADMIN_DELETION_TOKEN" https://<worker-host>/admin/deletion-status`.
2. For each UID, read `accountDeletions/{uid}` in the Firebase console: `lastError.step`, `attempts`, `status`, `leaseUntil`.
3. Fix the cause by step: `r2Media` → R2 binding/bucket; `firebaseMedia` / `auth` / any Firestore step → service-account roles, `GOOGLE_SERVICE_ACCOUNT_JSON`, quota or indexes (a `FAILED_PRECONDITION` index error means the field overrides are not deployed); repeated subrequest errors → Workers plan.
4. Re-run: wait for the next hourly cron, or `POST /admin/account-deletion {"uid": "..."}` with the admin token (same fenced plan; refuses while another attempt holds a live lease).
5. Confirm `status: completed`, the Auth user is gone, and R2/Storage prefixes are empty. If the user contacted support, reply when complete. Never edit or delete `accountDeletions/{uid}` by hand — it is the deletion barrier.

### Verified results (gap closure)

- Reproductions written first: verified-alias test and both pending-group tests failed (34/37) before the fix and pass after.
- `npm run test:release`: 13 queue/session checks + 38/38 account-deletion checks — pass.
- `npm run test:rules` (Firestore + Storage emulators): 73/73 rules checks (incl. filter on posts/comments/profiles/groups/trips, rules↔shared list sync, one-report-per-user, auto-hide at 3 reports, author cannot unhide, moderator restore/remove/comment removal/review, suspension blocks writes and uploads, dropped refused pending member, concurrent resume) + 34/34 account-deletion checks (incl. moderator media removal and suspended upload through the Worker entry point) — pass.
- Typecheck: 3 workspaces + Worker pass. Lint: 0 errors (81 pre-existing warnings, none new). iOS and Android JS exports: pass.
- Not performed: native UI, staging two-account runs, real external services (same access limits as above).

### Rollout additions (gap closure)

- Deploy the new `reports (status, createdAt)` composite index before moderators use the queue.
- Create `moderators/{uid}` documents for the appointed moderators in the Firebase console (clients cannot write them).
- `storage.rules` now reads two Firestore documents per upload (deletion barrier and suspension); the Storage-to-Firestore grant from the rollout order is required for both.
- Add a Workers Logs / Logpush alert on `account_deletion_stalled` and assign an owner for the stalled-deletion runbook.

## Moderation corrections (from a79e0c4)

| Gap | Reproduced failure | Fix |
|---|---|---|
| Delete/recreate bypass | An author deleted an `under_review`/`removed` post or journal and recreated it at the same ID as public with `reportCount: 0`. | Authors cannot delete moderated items; while moderated, author updates are limited to `isArchived`/`updatedAt`, so recreation at the same ID (an update) is refused too. Account deletion (Admin) still removes moderated items. |
| Inactive moderators | A suspended or deleting moderator still got 200 and deleted media. | `remove-media` checks `accountDeletions/{uid}` and `accountSuspensions/{uid}` after the role check; inactive callers get 403 and any read failure returns 503 before anything is deleted. |
| Removal vs restore race | While objects were being deleted, a restore with new images was overwritten by an unconditional cleanup commit. | Claim → delete → finalize. A conditional claim on fresh state records the exact URLs (`mediaRemoval`: token, urls, 2-minute lease) before any object is deleted; rules refuse moderator visibility changes while the removal is `in_progress` (see the lease-expiry correction below); only claimed objects are deleted; finalization runs only while the claim token is still held and removes only the claimed URLs (later images are kept). A restore committed before the claim aborts the run (409, nothing deleted); an interrupted run is retried after the lease (object deletion is idempotent); repeats are no-ops. |
| Photo review | The queue showed only a photo count. | Moderators see thumbnails of every reported photo and journal cover (loading spinner, "Could not load" fallback, tap to enlarge). Access is unchanged: the screen requires `moderators/{uid}`, and the report and hidden-content reads are moderator-only in the rules. |

Verified: reproductions written first (5 route tests failed 38/43; the rules delete/recreate check failed) and pass after the fix. `npm run test:release`: 13 + 44/44 pass. `npm run test:rules`: 79/79 rules checks (delete/recreate/edit refused for both states of posts and journals, archiving allowed, normal delete allowed, restore refused under an active removal lease and allowed after) + 41/41 deletion checks (incl. the endpoint with the real rules: a moderator restore during object deletion is refused, then succeeds once finalized). Typecheck 3 workspaces + Worker, lint 0 errors, iOS/Android exports pass. Native verification of photo review and moderation actions: **blocked** (no device/emulator/macOS).

## Removal lease expiry correction (from 57a7665)

Reproduced: a claim's lease expired while `bucket.delete` was still running; the rules then allowed a moderator restore, and the original run kept deleting and finalized, leaving the restored item public without its photos (real-rules emulator test failed for posts and journals; rules check with an expired in-progress claim failed).

Fix (`firestore.rules`, `mediaRemovalActive()`): moderator visibility changes are refused while `mediaRemoval.state == 'in_progress'`, regardless of the lease. Lease expiry now only permits another `remove-media` run to take over (re-claim the same URLs, delete idempotently, finalize to `done`); restores become possible only after that terminal state. Expired or superseded runs cannot affect restored content: restore requires `done`, and their finalize is fenced to their claim token (superseded runs return `superseded: true` without writing). A removal stuck `in_progress` (worker crashed) is recovered by calling `remove-media` again after the 2-minute lease; until then the item stays removed. Account deletion (Admin) is unaffected.

Tests: real-rules emulator tests for posts and journals (deletion outlasting its lease: restore refused during deletion, allowed once `done`) fail against the previous rule and pass now; takeover after expiry with a stalled original run, stale completion after restore + new photo (photo and visibility preserved), retry/no-op repeat for posts and journals; rules check that an expired in-progress claim blocks restores. `npm run test:release` 13 + 46/46, `npm run test:rules` 79/79 + 45/45 pass. Native verification: **blocked** (no device/emulator/macOS).

## Staging validation (from 8816dcf)

### Prepared locally (this phase)

- `workers/r2-upload-worker/wrangler.toml` → `[env.staging]`: Worker `solotravelsoul-r2-upload-staging`, R2 bucket `solotravelsoul-images-staging`, own vars and hourly cron; secrets are per environment (`--env staging`). `wrangler deploy --dry-run --env staging` bundles and binds only the staging bucket (verified).
- `.firebaserc` → `staging` alias (placeholder until the project exists). The `default` alias is still production, so every staging command below passes `--project staging` explicitly.
- `apps/mobile/eas.json` → preview builds set `EXPO_PUBLIC_APP_ENV=staging` (production builds `production`) and read the `preview` EAS environment.
- App guard (`packages/firebase/src/config.ts` + `packages/shared/src/environment.ts`): a build with `EXPO_PUBLIC_APP_ENV=staging` gets a blank Firebase config and the setup screen unless all six Firebase values are present and belong to one non-production project (Auth domain `<project>.firebaseapp.com`/`.web.app`, Storage bucket `<project>.…`, app ID `1:<number>:…` matching the sender ID, neither the production project number) and the Worker URL is not production. This is a configuration check; it cannot prove the API key belongs to staging.
- `npm run check:staging` (`scripts/checkStagingIsolation.cjs`), two levels — prints PASS/FAIL/BLOCKED only, never values:
  - **Configuration checks** (always; `-- --eas-env <file>` adds the pulled EAS preview variables): alias, Worker name/bucket/vars/cron, preview profile, all six Firebase values present and single-project, staging Worker URL. Passing these does **not** prove isolation.
  - **Verified resource ownership** (`-- --eas-env <file> --firebase-metadata <file>`): every EAS Firebase value, including the API key and app ID, must equal the SDK config Firebase returns for the staging project (`firebase apps:sdkconfig WEB <appId> --project staging --json`, fetched by the operator), whose `projectId` must be the staging alias. Without metadata the checker reports `BLOCKED` and exits 2 — isolation is not claimed.
  - Exit codes: 0 verified, 1 failed, 2 configuration passed but ownership blocked. Currently fails on exactly two items: the staging project ID is not set (alias and Worker vars).
- `scripts/grantModerator.ts`: grants/revokes `moderators/{uid}` with operator credentials; dry-run by default; refuses production unless `--production`.
- Read-only findings: no staging Firebase project exists in the account; the EAS `preview` and `production` environments contain only `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICE_INFO_PLIST` — none of the `EXPO_PUBLIC_*` variables, so current preview/production builds would have no Firebase or Worker configuration; Wrangler is not logged in.

### Staging runbook (run only when explicitly authorized)

1. Create the staging Firebase project (Auth email/password, Firestore, Storage); put its ID in `.firebaserc` (`staging`) and `[env.staging.vars]` (`FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`).
2. `wrangler r2 bucket create solotravelsoul-images-staging`; enable its public URL.
3. Staging service account in the staging project only (Cloud Datastore User, Storage Object Admin, Firebase Authentication Admin): `wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON --env staging`, `wrangler secret put ADMIN_DELETION_TOKEN --env staging`, `wrangler secret put PUBLIC_R2_BASE_URL --env staging`.
4. EAS `preview` environment: all `EXPO_PUBLIC_FIREBASE_*` (staging web app), `EXPO_PUBLIC_STORAGE_PROVIDER=r2`, `EXPO_PUBLIC_R2_UPLOAD_WORKER_URL` (staging Worker), Mapbox/Foursquare keys, `MAPBOX_DOWNLOADS_TOKEN` (secret), staging `GOOGLE_SERVICES_JSON`/`GOOGLE_SERVICE_INFO_PLIST`.
5. Configuration checks: `npm run check:staging`, then `eas env:pull --environment preview --path <tmp>` and `npm run check:staging -- --eas-env <tmp>` (exit 2 = configuration OK, ownership not yet verified).
   Ownership: `firebase apps:sdkconfig WEB <staging appId> --project staging --json > <tmp-meta>` and `npm run check:staging -- --eas-env <tmp> --firebase-metadata <tmp-meta>` must exit 0. Delete both temporary files afterwards; never commit or paste them.
6. `firebase deploy --project staging --only firestore:indexes` (wait until built) → `wrangler deploy --env staging` → `firebase deploy --project staging --only firestore:rules,storage` (approve the Storage→Firestore cross-service prompt).
7. Isolation proof before testing: production `travelPosts`/`users` unchanged; staging Worker `GET /account-deletion` OK and `GET /admin/deletion-status` returns 0 with the staging token and 403 with any other; staging service account has no role in the production project (IAM page); a staging-built app shows staging data only.
8. `eas build --profile preview --platform all` (requires build approval), install on the test devices, create accounts A and B in-app, `npx tsx scripts/grantModerator.ts --project <staging> --uid <A> --apply`.
9. Run the native two-account checklist (consolidated store-release review) plus: moderation queue with photo previews (load, error, enlarge), report threshold auto-hide, suspend/unsuspend (writes and uploads), offline edits on two trips, uploads, deletion during a forced outage (temporarily remove the staging Storage role) and cron recovery, `remove-media` interrupted then taken over after the lease, restore refused while in progress and allowed after `done`. Record each item as PASS/FAIL with evidence (screenshots, document paths, Worker logs).

### Results

| Check | Result |
|---|---|
| Staging configuration checks (local: names, buckets, guard, checker logic) | PASS — `npm run test:release` staging checks 6/6; Wrangler staging dry run binds staging bucket only |
| Staging resource ownership (API key/app belong to the staging project) | BLOCKED — needs the staging project and its Firebase metadata |
| Staging project ID / real isolation against live services | BLOCKED — no staging project, no Wrangler login |
| Deploys (indexes, Worker + cron, rules) | BLOCKED — not authorized; no staging project |
| EAS preview build | BLOCKED — EAS env vars missing; paid/free build approval not given |
| Native two-account checklist, moderation/photo review, suspension, offline sync, uploads, deletion outage/recovery, removal takeover/restore, real cron | BLOCKED — no staging, no devices (no Android SDK/emulator, iOS needs macOS) |

No staging defects could be observed, so none were fixed in this phase.

### Consolidated access needed

1. **Firebase**: create (or authorize creating) a staging project; Firebase CLI re-login (`firebase login --reauth`; deploy credentials expired); billing plan for that project if Storage/Functions quotas require it.
2. **Google Cloud IAM**: staging service account + JSON key handed to the operator who runs `wrangler secret put` (never committed); Storage→Firestore cross-service grant in staging.
3. **Cloudflare**: `wrangler login` for the account owning the Worker; create staging R2 bucket + public URL. (Superseded: deletion now runs in bounded slices on Workers Free; see below.)
4. **EAS**: values for every `EXPO_PUBLIC_*` variable in the `preview` environment (and later `production`); approval to run preview builds (build credits).
5. **Devices**: one physical iPhone (TestFlight/ad-hoc provisioning, Apple Developer membership and team ID) and one Android 14+ device, or a Mac with Xcode + an Android emulator host.
6. **People/process**: two test accounts' owners, at least one staging moderator, sign-off on response targets.
7. **Explicit authorization** to deploy indexes, the staging Worker and rules to the staging project.

## Workers Free media and bounded deletion (from d328573)

Firebase Auth and Firestore stay on Spark. Cloud Storage for Firebase needs Blaze (since 2026-02-03), so new media moves to the Worker on Workers Free + KV + D1. No paid plan, billing change or deployment is part of this change; the production section of `wrangler.toml` and the app configuration are unchanged.

### Media (KV bytes behind a D1 index)

- `POST /media/upload` (multipart `file` + `purpose` = `profile|post|journal`): verified ID token; 2 MB cap (declared length and actual size); images only; deletion barrier / suspension checked **before** (unreadable → 503, nothing stored) and **after** the bytes are written (unreadable counts as blocked → row `removed`, bytes deleted or queued, 403). Order: D1 row `pending` → KV put → barrier re-check → `active`. A failed D1 write stores nothing; a failed KV write leaves a `failed` row queued for cleanup; a failed activation leaves a `pending` row that is never served.
- `GET /media/<32-hex id>`: requires `Authorization: Bearer <ID token>` (401 without, 403 invalid). Authorization reads primary sources on every request: the D1 row must be `active`, and Firestore (`accountDeletions/{owner}`, `moderators/{viewer}`, the current parent document) decides. Owner always (until deletion starts — then nobody); `owner_only` rows only owner/moderator; post/journal media only while attached to a document whose `authorId` is the owner, with `visibility == 'public'` and not archived; profile media only while it is the owner's current `photoURL`/`coverPhotoURL`; moderators can review hidden items. The D1 `parent_id` is only a hint: it is re-checked, and rebound if the image moved. Any D1/Firestore/KV read error → 503 with no bytes; D1 query cap reached → 503.
- Caching: no edge or Cache API caching. Shared media: `Cache-Control: private, max-age=300`; owner/moderator/denied: `private, no-store`; always `Vary: Authorization` and `nosniff`. The app sends the token as an image header with `cache: 'default'` (iOS follows these headers; Android's image pipeline keeps its own memory/disk cache). Hiding or removing media stops the Worker from serving it again; **copies already downloaded to a device cannot be recalled**.
- The app (`apps/mobile/utils/storageUpload.ts`) uploads only to `/media/upload`; image views use `useMediaSource()`. `packages/firebase/src/storage.ts` (Firebase Storage uploads) is removed. The legacy `/upload/*` R2 endpoints remain for earlier app versions only.

**Logical revocation vs physical deletion.** Revocation is the authorization gate above: a Firestore privacy change, report auto-hide (`under_review`), moderator removal or the account-deletion barrier takes effect on the next request, including changes written directly by clients (tested through the emulator with real rules). Physical deletion is separate: rows are marked `removed` with `kv_delete_pending = 1`, and bytes are deleted by bounded, retryable cleanup (account deletion step, `remove-media`, cron). A KV delete that KV accepted clears the flag; because KV is eventually consistent this is not a guarantee that every location stopped holding the value within a fixed time (no 60-second claim). When KV refuses deletes (daily limit or outage) the rows stay queued and the deletion step stays pending — never reported as deleted.

Cron maintenance: uploads not activated after 1 h → removed and queued; active media unreferenced for 24 h (post never created, photo replaced, image detached) → re-checked against Firestore, revoked and queued; queued KV deletes purged in batches.

### Account deletion in bounded slices

- Workers Free allows 50 subrequests per invocation and D1 Free 50 queries per invocation. Every outbound call (JWKS, service-account token, Firestore REST, Cloud Storage, Identity Toolkit) is charged to one hard-capped budget, D1 queries to a second one (`meteredD1`). Steps stop voluntarily while 10 calls are still reserved (cold-start auth, retries, lease renewal and the progress write), save the completed-step cursor on the job, release the lease and return **202** `{status: 'in_progress', completedSteps, totalSteps}`. The next call (app continuation or hourly cron) acquires the fenced lease and skips completed steps. Auth removal runs only after every step is complete and only if the Auth phase fits in the remaining budget.
- Starting a deletion requires a recent sign-in (5 minutes). A continuation needs only a verified token for a UID whose own job exists; the UID always comes from the verified token (request bodies are ignored). An unreadable job document → 503.
- Skipping completed steps is safe because the barrier prevents re-creation. The rule gap that let a deleting UID be re-added to `pendingMembers`, or as `memberInfo`/`unreadCounts` keys, is closed (`groupIdentityGuard`, emulator-tested). To stay within Firestore's 10 document reads per rule evaluation, group creation now writes the creator plus at most 7 pending invitees, then appends further invitees in chunks of 8 (refused invitees are skipped) before moving them into `members`; the group stays hidden until complete. An interruption while appending completes the group with the invitees listed so far.
- App: `requestAccountDeletion` continues on 202 with the same token (up to 30 slices, with progress shown), then tells the user that deletion continues automatically.

Measured in the in-memory model with a metered store (each store call = one REST fetch, plus 2 for cold-start auth): the two-user fixture plus 45 KV media rows completes in 6 slices, max 42 subrequests and 23 D1 queries per invocation; cron recovery of a paused deletion, a failed job and a pending finalization completes in 5 runs, max 42 / 23. Through the real adapters against the Firestore emulator (Google endpoints faked), every `/account/delete`, `/admin/account-deletion` and cron invocation stayed at or below 50 outbound fetches. **Workers CPU time (10 ms on Free) has not been measured**; that needs a deployed staging Worker.

### Legacy media

- `profile_images/{uid}.jpg` (earlier app) is now covered by deletion and the late-media sweep.
- Legacy Firebase Storage deletion is recorded in `legacyMediaCleanup/{uid}` as `verified_absent` only after a fresh listing and object lookup prove absence; objects still listed fail the step. If Storage is inaccessible (401/403, as on Spark) the record is `unresolved` and the job carries `legacyMediaUnresolved`; `GET /admin/deletion-status` lists them. An `unresolved` record is an open item, not evidence of deletion.
- `scripts/migrateLegacyMedia.ts` (not run): dry run by default (`--apply` to write); token only from `ADMIN_DELETION_TOKEN` in the environment; owner derived from the path and required to exist in Auth; refuses objects referenced by another account; imports through `POST /admin/media/import`; verifies SHA-256, status and owner through the digest endpoint; swaps references transactionally only if they still hold the old URL; records each stage in a resumable state file; never deletes sources.

### Rollout (only when explicitly authorized; none of this was run)

1. Staging: `wrangler kv namespace create MEDIA_KV --env staging`, `wrangler d1 create solotravelsoul-media-staging`; put the IDs and `MEDIA_PUBLIC_ORIGIN` (staging Worker origin) into `[env.staging]`; `wrangler d1 migrations apply solotravelsoul-media-staging --env staging --remote`; `npm run check:staging` must pass the media checks (it currently fails exactly these three: KV ID, D1 ID, media origin).
2. Deploy the rules (`groupIdentityGuard`) **before** the Worker that skips completed deletion steps, then the staging Worker.
3. Staging native checks (below) and CPU measurement (`wrangler tail` / analytics); then production: create production KV/D1, add the bindings and `MEDIA_PUBLIC_ORIGIN` to the production section, apply migrations, deploy rules, then the Worker, then release the app. App builds that upload to `/media/upload` must not ship before the production bindings exist (uploads would answer 503).
4. Legacy inventory/migration dry run with operator credentials; review; `--apply` only with approval; deleting sources is a separate authorized step.

### Verified results (this phase)

| Check | Result |
|---|---|
| `npm run test:release` | PASS — queues 13, account deletion 53/53, media 15/15, app 6/6, staging 6/6 |
| `npm run test:rules` (Firestore + Storage emulators) | PASS — rules 82, account deletion 48/48 (real REST adapter), media 11/11 (direct client writes through rules) |
| Type checks | PASS — `turbo type-check`, Worker `tsc`, migration script `tsc` |
| Lint | PASS — 0 errors (74 pre-existing warnings) |
| `expo export` iOS + Android | PASS — bundles contain `/media/upload` and no Firebase Storage upload code |

### Remaining live-service / native blockers

1. Cloudflare: no Wrangler login; staging KV namespace, D1 database, migration apply and staging Worker deploy not done; production bindings absent (the new app upload path must not ship before they exist).
2. Workers CPU time (10 ms Free limit) and real subrequest counts unmeasured on a deployed Worker. Cloudflare does not document D1 behaviour past the free daily limits; it is handled as a fail-closed error but not verified live.
3. Firebase: staging project resources, staging rules deploy, Firebase CLI re-login. Legacy Firebase Storage is inaccessible on Spark, so the 2 known `profile_images/*.jpg` objects stay **unresolved** unless Storage access is restored; the legacy R2 inventory was not taken (no credentials).
4. Native: device verification of header-authorized image loading, iOS/Android image-cache behaviour, the deletion progress UI and continuation, group creation with more than 8 invitees, and the two-account checklist (no devices/macOS available).
5. EAS preview environment variables and build approval; store submission review.
