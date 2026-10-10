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

> Superseded: the authoritative remaining-blocker list is `docs/release-handoff.md` section 9 (2026-10-10).

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
2. ~~`wrangler r2 bucket create solotravelsoul-images-staging`; enable its public URL.~~ *Superseded: free-only staging uses no R2 bucket (see "Free-only staging and release preparation").*
3. Staging service account in the staging project only (Cloud Datastore User, Storage Object Admin, Firebase Authentication Admin): `wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON --env staging`, `wrangler secret put ADMIN_DELETION_TOKEN --env staging`. (*`PUBLIC_R2_BASE_URL` is no longer needed for free-only staging.*)
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
- Legacy Firebase Storage deletion is recorded in `legacyMediaCleanup/{uid}` as `verified_absent` only after a fresh listing and object lookup prove absence; objects still listed fail the step. If Storage is inaccessible (401/403, as on Spark) the record is `unresolved` and the job carries `legacyMediaUnresolved`; `GET /admin/deletion-status` lists them. An `unresolved` record is an open item, not evidence of deletion, and (since the fixes below) it keeps the deletion blocked with Auth intact.
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

> Superseded: the authoritative remaining-blocker list is `docs/release-handoff.md` section 9 (2026-10-10).

1. Cloudflare: no Wrangler login; staging KV namespace, D1 database, migration apply and staging Worker deploy not done; production bindings absent (the new app upload path must not ship before they exist).
2. Workers CPU time (10 ms Free limit) and real subrequest counts unmeasured on a deployed Worker. When a D1 Free daily limit is reached, queries return errors until 00:00 UTC (documented by Cloudflare); the Worker fails closed on them, not verified live.
3. Firebase: staging project resources, staging rules deploy, Firebase CLI re-login. Legacy Firebase Storage is inaccessible on Spark, so the 2 known `profile_images/*.jpg` objects stay **unresolved** unless Storage access is restored; the legacy R2 inventory was not taken (no credentials).
4. Native: device verification of header-authorized image loading, iOS/Android image-cache behaviour, the deletion progress UI and continuation, group creation with more than 8 invitees, and the two-account checklist (no devices/macOS available).
5. EAS preview environment variables and build approval; store submission review.

## Deletion correctness fixes (from a912b86)

### Inaccessible legacy Storage no longer completes a deletion

Reproduced: with Cloud Storage answering 403, `deleteFirebaseMedia` recorded `unresolved` and returned, so the step counted as complete, Auth was deleted and the API answered `deleted` while `profile_images/{uid}.jpg` remained.

Fix: the step now completes only after a fresh listing and object lookup prove absence (`legacyMediaCleanup/{uid}` = `verified_absent`). When Storage is inaccessible it records `unresolved` (operator record kept, listed by `GET /admin/deletion-status`), sets `legacyMediaUnresolved` and `blockedOn: 'firebaseMedia'` on the job, keeps the step out of `completedSteps`, releases the lease and returns **202** `{status: 'blocked', step: 'firebaseMedia', reason: 'legacy-media-inaccessible'}`. Auth is not removed. The app stops continuing and tells the user that the account stays locked until the remaining photos are deleted. Every later user continuation and every hourly cron run retries the step. Once access returns and absence is verified, the flag is cleared and the deletion finishes (Auth removal, completion). Finalization refuses jobs with `legacyMediaUnresolved`. A job left by the previous version (all steps marked done, unresolved, pending finalization) is not finalized: its legacy step is re-run first.

**Consequence on Spark:** if Cloud Storage stays inaccessible, deletions of accounts with legacy Storage media cannot complete. They stay locked, blocked and reported (stalled after 6 hours) until Storage access is restored (Blaze) or an operator resolves the objects by another verified means. No override exists in code.

### Pagination can no longer exhaust a slice before any progress

Reproduced: `FirestoreRest.query/listDocumentIds/listCollectionIds` fetched every page inside one call. A 6,000-document query needs 61 fetches, so it hit the 50-subrequest cap (`BudgetExceeded`) before deleting anything. Each retry repeated this, and the slice could neither save progress nor release its lease. Cron discovery had the same problem with many jobs.

Fix:
- The store takes `limit` (one page, one subrequest) and `startAfter` (resume after a document) on queries, and `limit` on listings.
- Every deletion step processes one page at a time through `eachPage`/`eachMatch`. The position (last fully handled document) is kept per step in `cursors` on the job and saved when a slice pauses or fails, so documents a step changes but does not remove (tombstoned comments, anonymized notifications and messages) are not re-read from the start. Cursors for a step are cleared when it completes.
- Subtrees are deleted one listing page at a time. Documents whose subtrees are already empty are deleted in one commit per page. If the slice ends mid-page, that partial commit is made from the reserve.
- Cron discovery (finalization, paused/failed jobs, late-media sweep) reads one page per query. Rotating cursors are kept in `deletionMaintenance/cron` (rules deny clients by default), so long lists cannot exhaust a run. Jobs held by live attempts, or blocked, do not starve the ones behind them, and paused jobs are continued before new failed ones. Operator status reads the first page per status.
- The 10-call reserve still covers the partial commit, the progress write and the lease release.

### D1 quota correction

The earlier statement that Cloudflare does not document D1 behaviour past the free daily limits was wrong. Cloudflare documents that once a Free-plan daily limit (rows read, rows written) is reached, queries return errors until the limits reset at 00:00 UTC. The Worker treats those errors as failures and fails closed: uploads and views answer 503 and cleanup stays queued. This was not observed against a live D1 database.

### Verified results (this phase)

| Check | Result |
|---|---|
| New regressions written first | Before the fix: 4 failed (blocked deletion returned `deleted`; finalization removed Auth; 6,000-document slice stopped making progress at slice 29; cron discovery over 5,100 jobs threw `BudgetExceeded`) |
| `npm run test:release` | PASS: queues 13, account deletion 57/57, media 15/15, app 6/6, staging 6/6 |
| `npm run test:rules` | PASS: rules 82, account deletion 49/49 (incl. a 1,430-document dataset through the real REST adapter under a hard 50-fetch cap), media 11/11 |
| Type checks | PASS: Worker `tsc`, `turbo type-check` |

In the in-memory model, a user with 6,000 notifications, a 1,500-document subtree, 300 likes, 300 comments and 251 sent notifications finished in 122 user slices. Each slice stayed at or below 43 subrequests and released its lease, made durable progress, and released each counter exactly once. 80 consecutive cron runs over 5,250 jobs each stayed within budget and made durable progress; all 150 pending finalizations completed and jobs behind 100 held ones were reached. Workers CPU time remains unmeasured.

## Free-only staging and release preparation (from 9e731df)

Consolidated owner handoff (privacy drafts, deletion URL, placeholders, old clients, legacy media, counters): `docs/release-handoff.md`.

### Changes

- **Staging without R2:** `[env.staging]` no longer binds an R2 bucket and no longer needs a `PUBLIC_R2_BASE_URL` secret. The production `[[r2_buckets]]` binding (legacy cleanup) is unchanged. `check:staging` now requires that staging binds no *production* bucket (a separate staging bucket is still allowed). Without a bucket it requires `LEGACY_MEDIA_MODE = "none"`, and it rejects unknown values or that variable in the production config. Legacy uploads now fail closed (503) when the R2 public URL is missing.
- **Staging no-legacy mode** (`LEGACY_MEDIA_MODE = "none"`, staging only):
  - The Worker refuses this mode for the production project (`legacyModeFor`; deletion answers 503 and nothing runs). It also refuses unknown values.
  - In this mode an unbound R2 store is accepted.
  - Firebase Storage counts as empty **only** when an authenticated lookup of the configured bucket returns 404 (never provisioned). The proof is recorded as `legacyMediaCleanup/{uid}` = `verified_absent`, `proof: 'bucket-not-provisioned'`.
  - If the bucket exists, its objects are deleted and verified normally (`proof: 'listing-and-lookup'`). A 401/403 still blocks.
- **Binding guards (all modes):**
  - Missing KV/D1 media bindings now block deletion (`media-bindings-missing`) instead of counting as "no media".
  - Without no-legacy mode, an unbound R2 store blocks deletion (`legacy-r2-unbound`), and a Storage bucket answering 404 blocks it as unresolved (`inaccessible (404)`).
  - Production Storage 403s still block.
  - **Production consequence:** this Worker must not be deployed to production before production KV/D1 bindings exist; deletions would block until they do.
- **Late-media sweep:** one page per run, resumed from the saved `(mediaClearedAtMs, path)` cursor. Equal timestamps are ordered by path. A job whose cleanup fails is skipped, logged (`deletion_sweep_failed`) and retried on the next pass; the cursor wraps within the 24-hour window. Budget exhaustion stops the pass at the last finished job.
- **Counter audit:** `scripts/auditCounters.ts`, read-only (see handoff §7).

### Live read-only evidence (this phase)

| Check | Result |
|---|---|
| Firebase CLI | logged in; projects `solotravelsoul-57a9e` (#1027722856345) and `solotravelsoul-staging` (#927322372618) visible |
| Staging project | Firestore `(default)` database exists (native mode); one web app `1:927322372618:web:9947970efca34c09ccbdf3`; **no Android/iOS apps registered** |
| Staging Storage | `solotravelsoul-staging.firebasestorage.app` and `.appspot.com`: 404 (never provisioned) |
| Production Storage | `solotravelsoul-57a9e.firebasestorage.app` readable by the owner account; 2 objects, both `profile_images/`; `.appspot.com` 404 |
| EAS | logged in (`ravitejatravelsoul`); `preview` environment holds only `GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICE_INFO_PLIST` (file variables, project not verified) and **no `EXPO_PUBLIC_*` variables** |
| Proposed EAS preview values | built from `firebase apps:sdkconfig WEB … --project staging` into a temporary file (deleted). `check:staging -- --eas-env … --firebase-metadata …`: all six Firebase values match the staging project's SDK metadata (PASS). Overall still FAIL on exactly three items: KV ID, D1 ID, media origin (need Wrangler). |
| Cloudflare | **Wrangler not logged in**: KV/D1/Worker state, workers.dev subdomain and legacy R2 inventory not visible |
| Native tooling on this machine | no Android SDK/emulator/adb, no macOS/Xcode |

### Staging approval packet (nothing below has been run)

Targets are staging only: Firebase project `solotravelsoul-staging`, Worker `solotravelsoul-r2-upload-staging`, KV `MEDIA_KV` (staging), D1 `solotravelsoul-media-staging`, EAS environment `preview`.

**Cost:** $0. Workers Free, KV Free, D1 Free, Firebase Spark and EAS Free build allowance only. No Blaze, no R2, no Workers Paid. If a free quota is exceeded, the services return errors and the Worker fails closed; nothing is billed.

**Prerequisites from the owner:**
- `wrangler login` (Cloudflare account owning the Worker).
- Email/Password sign-in enabled in the staging project's Authentication settings (console).
- A way to create a staging service account key. `gcloud` is not installed here; the Cloud Console works. Note that an organisation policy may forbid key creation.
- Mapbox/Foursquare keys for the preview build.

**Order** (rules before the cursor-skipping Worker):

| # | Step | Command (run from the repo root unless noted) |
|---|---|---|
| A1 | Cloudflare login | `cd workers/r2-upload-worker && npx wrangler login` |
| A2 | KV namespace | `npx wrangler kv namespace create MEDIA_KV --env staging` → put the id in `[[env.staging.kv_namespaces]]` |
| A3 | D1 database | `npx wrangler d1 create solotravelsoul-media-staging` → put `database_id` in `[[env.staging.d1_databases]]` |
| A4 | D1 schema | `npx wrangler d1 migrations apply solotravelsoul-media-staging --env staging --remote` |
| A5 | Media origin | set `MEDIA_PUBLIC_ORIGIN = "https://solotravelsoul-r2-upload-staging.<subdomain>.workers.dev"` (subdomain from the Cloudflare dashboard); `npm run check:staging` must then pass every configuration item |
| B1 | Staging service account (Cloud Console, project `solotravelsoul-staging` only) | create `sts-staging-deleter`; grant Cloud Datastore User, Firebase Authentication Admin and a custom role `stsStagingBucketLookup` with only `storage.buckets.get` (needed by the no-legacy bucket lookup; no Owner/Editor, no object permissions: if a bucket ever appears, listing is refused and deletion blocks); create a JSON key into a temporary file |
| B2 | Worker secrets | `npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON --env staging < <tmp-key.json>`, then delete the file; `npx wrangler secret put ADMIN_DELETION_TOKEN --env staging` (a random 32-byte value kept in a password manager) |
| C1 | Indexes | `npx firebase deploy --project staging --only firestore:indexes` (wait until built) |
| C2 | Rules (closes the deletion barriers) | `npx firebase deploy --project staging --only firestore:rules`. Do **not** deploy `storage` (no bucket exists) |
| C3 | Worker + cron | `cd workers/r2-upload-worker && npx wrangler deploy --env staging` (after C2) |
| C4 | Smoke | `GET /account-deletion` 200; `GET /admin/deletion-status` 200 with the staging token, 403 otherwise; `POST /media/upload` without a token 401 |
| D1 | EAS preview variables | `cd apps/mobile`; `npx eas env:create --environment preview --name <NAME> --value <value> --visibility plaintext` for `EXPO_PUBLIC_APP_ENV=staging`, the six `EXPO_PUBLIC_FIREBASE_*` values from `firebase apps:sdkconfig WEB 1:927322372618:web:9947970efca34c09ccbdf3 --project staging`, `EXPO_PUBLIC_R2_UPLOAD_WORKER_URL` (staging origin), Mapbox/Foursquare keys; `MAPBOX_DOWNLOADS_TOKEN` as a secret |
| D2 | Native Firebase files | register staging Android/iOS apps (`npx firebase apps:create ANDROID|IOS … --project staging`) if push notifications are to be tested, and replace the `preview` `GOOGLE_SERVICES_JSON`/`GOOGLE_SERVICE_INFO_PLIST`, whose project is unverified |
| D3 | Verify | `npx eas env:pull --environment preview --path <tmp>`; `firebase apps:sdkconfig … --json > <tmp-meta>`; `npm run check:staging -- --eas-env <tmp> --firebase-metadata <tmp-meta>` must exit 0; delete both files |
| E1 | Build (separate approval) | `npx eas build --profile preview --platform android` (EAS Free allowance). An iOS device build needs a paid Apple Developer membership: blocked under the no-paid-plans constraint |

**Rollback (staging only):**
- `npx wrangler delete --env staging`
- `npx wrangler kv namespace delete --namespace-id <id>`
- `npx wrangler d1 delete solotravelsoul-media-staging`
- Restore the previous staging rules from the console's rules history, or redeploy from the prior commit.
- `npx eas env:delete --environment preview --variable-name <NAME>`
- Delete the service-account key and the account.

Production is not touched by any step.

### Live and native verification checklist

Run on two staging accounts (A, B) after the packet is executed. The table below is the status from an earlier phase. Android native results (2026-10-09, staging APK on an Android 15 emulator) are in `docs/release-handoff.md` section 10, "Native Android verification". Status at commit time:

| Check | Status |
|---|---|
| Authenticated image loading (own/public/private/under review/removed; profile photo replaced) | BLOCKED (no staging Worker, no device) |
| Token refresh after 1 h and account switching (A → sign out → B: no cached private images shown) | BLOCKED |
| Native caching: iOS URL cache honours `private, max-age=300` / `no-store`; Android image cache behaviour after revocation | BLOCKED |
| Uploads (2 MB cap, type check, upload during deletion) | BLOCKED |
| Group creation with more than 8 invitees; refused invitee dropped | BLOCKED (rules emulator only) |
| Moderation queue, report auto-hide at 3 reports, moderator removal and media revocation | BLOCKED |
| Suspension blocks writes and uploads; unsuspend | BLOCKED |
| Deletion continuation (progress UI, 202 loop), blocked deletion message, recovery after access returns | BLOCKED |
| Removal takeover after lease expiry; restore refused while in progress | BLOCKED (emulator only) |
| Cron: finalization, recovery, late-media sweep on the deployed Worker | BLOCKED |
| Workers Free CPU (10 ms) and subrequest/D1 counts per request and per cron run (`wrangler tail`, Workers analytics) | BLOCKED (not deployed) |
| Quota failures | Simulated in tests (KV put/delete limits, D1 write limits, Firestore unavailable); never exhaust shared quotas live |

### Verified results (this phase)

| Check | Result |
|---|---|
| New regressions first | Against the previous Worker code the 4 new in-memory regressions failed (missing media bindings, unbound R2 / 404 bucket, no-legacy proof, production refusal). The emulator regressions (staging end to end, blocked 404/403 through the entry point, REST sweep) were written alongside and pass now. |
| `npm run test:release` | PASS: queues 13, account deletion 62/62, media 15/15, app 6/6, staging 6/6 |
| `npm run test:rules` | PASS: rules 82, account deletion 52/52 (incl. staging end to end through the Worker entry point and the REST sweep: 130 jobs, equal timestamps, budget-limited runs, restarts, one injected failure retried), media 11/11 |
| Type checks | PASS: `turbo type-check`, Worker `tsc`, `scripts/auditCounters.ts` and `scripts/migrateLegacyMedia.ts` |
| Lint | PASS: 0 errors (warnings unchanged: mobile 74, firebase 7) |
| `expo export` iOS + Android | PASS (bundles only; not native UI proof) |

### Staging rollout log (authorized phase, from d04a9d5)

Authorization covered staging-only KV/D1, migrations, service-account setup, Worker secrets, Firebase indexes/rules, Worker/cron deployment and EAS `preview` variables (no builds).

| Step | Result |
|---|---|
| Billing check before writes | `solotravelsoul-staging` and `solotravelsoul-57a9e`: no billing account linked (`billingEnabled=false`), i.e. Spark. Workers plan could not be read: **Cloudflare not logged in** |
| Cloudflare login (`wrangler login`) | **BLOCKED**: two browser authorizations timed out without approval |
| A2–A5 KV, D1, schema, media origin | not run (needs Cloudflare) |
| IAM API on staging | enabled (`iam.googleapis.com`; no billing required) |
| B1 service account | `sts-staging-deleter@solotravelsoul-staging.iam.gserviceaccount.com` created. Roles: `roles/datastore.user`, `roles/firebaseauth.admin`, custom `projects/solotravelsoul-staging/roles/stsStagingBucketLookup` (`storage.buckets.get` only). Project has no organization. |
| SA verification through the Worker's own `google.ts` / `objectStores.ts` | staging bucket lookup → `bucketExists = false` (404, never provisioned); production bucket lookup refused (403); staging Firestore read 404 (allowed, document absent); production Firestore 403; staging Identity Toolkit lookup works |
| SA key | a test key was created, used for the verification above, then deleted in IAM and locally (no user-managed keys remain); a fresh key is created when the Worker secret can be set |
| B2 Worker secrets | not run (needs Cloudflare) |
| C1–C4 indexes, rules, Worker/cron | not run: the required order puts them after KV/D1 and secrets |
| Staging Auth | Email/Password sign-in already enabled |
| D1 EAS `preview` variables | set from live `firebase apps:sdkconfig` metadata: `EXPO_PUBLIC_APP_ENV`, all six `EXPO_PUBLIC_FIREBASE_*`. Verified as stored (pulled back, checked against metadata; file deleted): all Firebase items PASS. Full check still fails on the Worker URL, KV ID, D1 ID and media origin (Cloudflare) |
| Native Firebase files in `preview` | `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICE_INFO_PLIST` **cannot belong to staging**: the staging project has no Android/iOS apps. Do not build with them; register staging native apps and replace both first (owner action, not in this authorization) |
| Staging integration tests, CPU/operation counts, cron execution | completed in the next phase (see below) |

### Staging rollout completion and live verification (from d21fecf)

| Step | Result |
|---|---|
| Wrangler login | done by the owner; Workers plan **Free**: a probe deploy with `limits.cpu_ms` was rejected by Cloudflare ("CPU limits are not supported for the Free plan", code 100328), so nothing changed |
| KV / D1 | `staging-MEDIA_KV` and `solotravelsoul-media-staging` created; IDs in `[env.staging]` |
| Schema | `0001_media.sql` applied remotely (`media` table and its 3 indexes) |
| Secrets | fresh staging service-account key piped into `GOOGLE_SERVICE_ACCOUNT_JSON` (local copy deleted; the active IAM key stays while the Worker uses it); random `ADMIN_DELETION_TOKEN` (the owner should rotate it and keep it in a password manager) |
| Indexes | deployed to `solotravelsoul-staging`; all 37 composite indexes READY before the rules |
| Rules | Firestore rules released to staging (no Storage rules: no bucket) |
| Worker / cron | `solotravelsoul-r2-upload-staging` deployed after the rules (`workers_dev` on, preview URLs off); cron now `*/5 * * * *` (one maintenance phase per run) |
| Preview Worker URL | `EXPO_PUBLIC_R2_UPLOAD_WORKER_URL` set |
| Full isolation check | `check:staging -- --eas-env <pulled preview> --firebase-metadata <live staging metadata>`: **26/26 PASS, exit 0** |
| Smoke | `/account-deletion` 200; `/admin/deletion-status` 200 with the token, 403 otherwise; unauthenticated upload and view 401; legacy `/upload/*` 503 (no R2) |
| Native Firebase files | not needed: the app uses the Firebase JS SDK only (no `googleServicesFile`, no `@react-native-firebase`, no push tokens). The local and `preview` `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICE_INFO_PLIST` belong to production (`solotravelsoul-57a9e`) and are not referenced by the build; removing the two unused `preview` file variables is part of the build approval |

**Live integration results** (`tests/staging/live.cjs`, disposable accounts, app modules + client SDK + real rules):
- **Upload and view:** no token 401; 2 MB + 1 byte 413; non-image 415; owner view 200 `private, no-store`; another user 404 while unattached; public post 200 `private, max-age=300`.
- **Direct privacy change:** an update made through the client SDK revokes access on the next request (404), and restoring it brings access back (200).
- **Report auto-hide:** 3 reports through the client hide the post (`under_review`): other users get 404; the moderator gets 200 `no-store`.
- **Moderator removal:** `remove-media` revokes the media; the D1 row goes to `removed` with bytes deleted; the owner gets 404.
- **Profile photo:** a replaced photo is revoked; the new one is shared.
- **Account A:** deleted across slices. Auth is gone and 9 documents are absent. All 4 of A's media rows were removed and purged. Legacy Storage absence was proven by `bucket-not-provisioned`.
- **What B retains:** B's post (likeCount 0, commentCount 1), A's comment as a tombstone, B's reply unchanged, the DM anonymized, and a group containing only B. No non-anonymized content from A remains.
- **Large accounts L and L2:** each had 20 photo posts, 15 likes, 25 comments, follows, a 10-message DM and a group. They were deleted in 82 and 97 invocations, with 0 errors and exact counters on all 15 posts; all 20 media rows were purged.
- **Missing media bindings:** a temporary deploy without KV/D1 left D's deletion `blocked` at step `media` (Auth kept). After restoring the deploy, D's own continuation finished.
- **Permission failure:** with Firebase Authentication Admin removed from the service account, E's deletion failed at `auth` (500, retryable; data cleaned, Auth kept). After the role was restored, the **real cron** run at 03:06:01 UTC (finalize slot) reported `finalized: 1` (8 ms CPU, 7 subrequests). The job is completed, Auth is gone and the media purged. The first verification at 03:07:18 reported a failure whose detail was truncated; an immediate re-check passed.
- **Bucket-lookup role removed:** C's deletion still completed. Cloud Storage answers 404 for a non-existent bucket to any authenticated caller, so the proof does not depend on that permission. The role only matters if a bucket appears, and is kept.

### Workers Free CPU (10 ms per invocation): measured, **not met**

Method: CPU comes from Cloudflare's `wrangler tail` `cpuTime` (CPU, not wall time; wall times were 0.3–4 s), and analytics `cpuTime` agrees (max 65,747 µs before the changes). Subrequest and D1 counts come from the Worker's own `LOG_BUDGET` line. Tail samples bursts, so sample counts are below the invocation counts. Every invocation's outcome was `ok` with 0 errors, but this does not show compliance.

Per-operation CPU, profiled with a temporary admin-gated build that repeats one operation N times (never committed; removed):

| Operation | CPU each |
|---|---|
| Firestore REST fetch, body not parsed | ≈ 0.5 ms |
| Firestore get / query | ≈ 0.4–0.65 ms |
| Firestore commit | ≈ 1.25 ms |
| RSA sign (service-account token, cold isolate) | ≈ 1.15 ms |
| D1 query | ≈ 0.4 ms |
| KV get | ≈ 0.15 ms |

**Bottleneck:** the number of outbound calls, plus a fixed cost for every authenticated, fenced slice. That fixed cost is ID-token verification, the job read, the lease commit and the progress commit, about 5–6 ms. Several ms of jitter and the cold-isolate cost (key import, token mint, startup) come on top.

Changes made (staging-deployed, regression-tested):
- **Cost-weighted work units** (`SLICE_WORK_UNITS = 3`, `CRON_WORK_UNITS = 10`; a read is 1, a commit 2, D1/KV charged separately). They are enforced only after a slice has made durable progress (a commit, an advanced page cursor or a completed step), so every slice completes at least one atomic unit and can never live-lock.
- **No redundant bookkeeping calls:**
  - The route's job read is reused by the lease.
  - Lease and progress writes use the `updateTime` of the attempt's own last write as the precondition. A conflict falls back to the read-and-check path, so fencing is unchanged.
  - Finalization claims with the listed document's `updateTime`.
- **One atomic unit per comment tombstone** (the duplicate post read was removed). A public trip's two root deletes go in one commit, and the private-data roots in one commit.
- **Cron** runs every 5 minutes with one phase per run (resume, finalize, resume, sweep, resume, media).
- **Imported verification keys** are cached per key ID.
- The app now sends up to 200 continuation requests.

| Build | Route | Samples | Median | p95 | Max | ≥ 10 ms |
|---|---|---|---|---|---|---|
| before | deletion slice | 5 | 42 ms | 65 ms | 65 ms | 5 |
| before | upload | 8 | 7 ms | 15 ms | 15 ms | 2 |
| before | view | 12 | 4 ms | 9 ms | 9 ms | 0 |
| before | remove-media | 1 | 16 ms | – | 16 ms | 1 |
| 6 units | deletion slice (account L, cold first slice) | 43 | 9 ms | 12 ms | 26 ms | 15 |
| 6 units | upload / view | 17 / 12 | 3 / 4 ms | 8 / 14 ms | 8 / 14 ms | 0 / 1 |
| 3 units | deletion slice (account L2, cold first slice) | 89 | 7 ms | 12 ms | 19 ms | 15 |
| 3 units | upload / view | 16 / 26 | 6 / 3 ms | 24 / 9 ms | 24 / 16 ms | 1 / 1 |
| 3 units | cron run (hourly build + `*/5` rotation) | 6 | 6 ms | 13 ms | 13 ms | 1 |

**Conclusion:** the changes cut deletion CPU from 42–65 ms to a median of 7 ms, but about 17% of slices still reach 10–19 ms. Even slices doing almost no work sit at 7–12 ms. Cold first invocations of uploads and views reach 16–24 ms. The existing free architecture (Firestore REST over `fetch`, fenced leases, ID-token checks) **cannot reliably stay under Workers Free's 10 ms with headroom**. This is a release blocker for relying on Workers Free; no readiness is claimed. The CPU allowance values, the cron rotation and the client continuation count are not the remaining problem; the per-call and fixed-slice costs are.

## Durable Object host feasibility proof (from 9204fdc, staging only)

Question: can SQLite-backed Durable Objects on Workers Free run the existing handlers, so the public Worker stays far below its 10 ms CPU limit?

### What was built (isolated; the existing staging Worker is unchanged for rollback)

- `wrangler.do-staging.toml` sets up a separate Worker, `solotravelsoul-api-do-staging` (`src/edge.ts`). It has an `ApiShard` SQLite-backed Durable Object class (migration `v1`) and uses the same staging Firebase project, KV and D1. Media URLs keep the staging origin as their canonical form. It has its own secrets (a separate staging service-account key and admin token) and a `*/5` cron. Remove it with `npx wrangler delete -c wrangler.do-staging.toml`.
- **Thin front:**
  - Serves the static deletion page itself and answers 404 for anything outside an allowlist of public API routes.
  - Forwards allowed requests unread: no body parsing, no token verification.
  - If the object is unavailable (overload, reset, daily limit) it fails closed with 503 `no-store`.
- **Object (`ApiShard`):** runs the existing `handleFetch()` (authentication, media, moderation, admin, deletion) and `runScheduled()`. These are the same functions the plain Worker now calls, so barriers, authorization, leases, counters, KV/D1 gates and cleanup are unchanged. There is no second job system: the Firestore job documents and cursors are reused.
- **Routing:**
  - Server-chosen names only: `api-0` … `api-7`, plus `maintenance`.
  - Views shard on the media ID; other routes on the token's unverified `sub` (routing only; the object verifies the token), so one account's requests share an object; admin routes share one.
  - Hostile tokens never create new names, and the shard count is capped at 64.
- **Cron:** the front calls the fixed `maintenance` object through an RPC method that no HTTP request can reach. Inside the object every phase runs per cron run (`CRON_ALL_PHASES`); work allowances are sized to the 50-subrequest cap (`SLICE_WORK_UNITS = CRON_WORK_UNITS = 40`) rather than to 10 ms.

### Platform facts

- **Plan:** the account is on Workers Free and deployed the SQLite-backed class without error.
- **Cloudflare documentation (Durable Objects limits and pricing):**
  - CPU per request is 30 s by default (configurable to 5 minutes) on Free and Paid alike, reset by each incoming request.
  - Free plan daily limits: 100,000 requests, 13,000 GB-s duration, 5 M rows read, 100,000 rows written, 5 GB storage in total. Beyond any of them, operations fail with an error.
  - Duration is charged at 128 MB while an object is running *or waiting on I/O*; idle objects eligible for hibernation are not charged.
  - Each front Worker request also counts toward Workers Free's 100,000 requests/day.
- **CPU-burn probe** (scratch build only, never committed): the same pure-JavaScript loop ran 2.8–2.9 s of CPU per request inside the object with outcome `ok` (3/3). In the plain front Worker it also ran 0.76–1.15 s with `ok`. The Free 10 ms limit is not observably enforced at that size, so `ok` outcomes are not evidence of compliance. The basis for the object is the documented 30 s limit.

### Measurements (Cloudflare tail `cpuTime`/`wallTime`; front and object reported separately)

| Host | Route | Samples | CPU median | CPU p95 | CPU max | Wall median |
|---|---|---|---|---|---|---|
| front | view | 24–29 per run | 1 ms | 1–2 ms | 2 ms | 0.25–0.28 s |
| front | upload | 17–18 per run | 0–1 ms | 1–2 ms | 2 ms | 0.44–0.52 s |
| front | deletion | 11 | 0 ms | 1 ms | 1 ms | 2.5 s |
| front | cron | 2 | 0 ms | 0 ms | 0 ms | 12–14 s |
| front | first 8 after a redeploy (cold) | 8 | 1 ms | 1 ms | 1 ms | – |
| object | view | 37–39 per run | 3–4 ms | 16–19 ms | 21 ms | 0.18–0.22 s |
| object | upload | 17–18 per run | 2–6 ms | 8–16 ms | 16 ms | 0.43–0.49 s |
| object | deletion slice (38 subrequests, ≤ 14 D1 queries) | 11 | 40 ms | 50 ms | 50 ms | 2.5 s |
| object | cron, all phases (37 subrequests) | 2 | 29 ms | 32 ms | 32 ms | 12–14 s |
| object | first 8 after a redeploy (cold) | 8 | 3 ms | 8 ms | 8 ms | – |

Cloudflare analytics for the proof window (00:31–01:10 UTC): 350 object requests with 0 errors, 0 exceeded-CPU and 0 exceeded-memory, 234 s active time (≈ 30 GB-s); front Worker 348 requests with 0 errors, CPU p50 1.03 ms and p99 2.44 ms.

### Live checks through the object host (disposable staging accounts)

- **Two-account checks:** all 21 pass (setup; media 8/8 including the direct client privacy change, report auto-hide and moderator removal; linked content; A's deletion in 4 invocations, with B's retained data verified).
- **Large account L:** 20 photo posts, 15 likes, 25 comments, DM and group, deleted in **11 invocations** (82–97 on the 10 ms-sized Worker) with exact counters, all 20 media rows purged.
- **Concurrency:** 10 parallel uploads (distinct IDs); 40 parallel view decisions correct; two simultaneous deletion starts for one account gave 202 + 409, and the deletion then completed once.
- **Restart:** redeploying the proof Worker in the middle of a large deletion; the run continued (11 invocations, no failed request) and verification passed.
- **Unauthorized:** missing token 401; invalid token 403; wrong admin token 403; internal (`/maintenance`) and diagnostic paths 404 at the front.
- **Cron:** the proof's maintenance object ran all four phases per run (29–32 ms CPU). An abandoned deletion (account CR: one slice, then left) was finished by cron alone. Both staging crons share the project, and the job completed after 15 attempts, about 44 minutes later. Auth is gone and the data and all 20 media rows are removed. Most of that time was one slice per job per run, plus media purging in small batches by the 10 ms-sized staging Worker's cron.
- **Quota errors:** an unavailable object (daily limit, overload, reset) gives 503 `no-store` at the front (unit-tested; shared quotas were not exhausted live). KV/D1/Firestore quota failures are handled by the unchanged handlers (existing tests).

### Daily capacity on Free (upper bounds from the measured wall times; concurrent requests on one object share active time)

| Operation | Object wall time | GB-s each | Limited by |
|---|---|---|---|
| view | ≈ 0.2 s | ≈ 0.026 | 100,000 Worker + 100,000 object requests/day (duration would allow ≈ 500,000) |
| upload | ≈ 0.45 s | ≈ 0.058 | requests (duration ≈ 225,000) |
| deletion slice | ≈ 2.5 s | ≈ 0.32 | duration ≈ 40,000 slices/day (a large account ≈ 11) |
| cron run (`*/5`) | ≈ 13 s | ≈ 1.7 | 288 runs/day ≈ 480 GB-s (≈ 3.7% of the allowance) + 288 requests |
| proof mix (measured) | – | 0.086 per request | requests (duration ≈ 150,000/day) |

**Trade-offs:**
- Every API call costs one Worker request and one object request, so the host does not raise the 100,000-requests/day ceiling.
- It adds a duration ceiling (13,000 GB-s) that the measured mix does not reach.
- Firestore on Spark (50,000 reads/day; a view reads 2–3 documents) remains the tighter limit for views, at roughly 17,000–25,000 per day.
- Cron recovery still advances one slice per job per run, because the 50-subrequest cap applies inside the object too.

### Verdict: **PASS** (feasibility), with the trade-offs above

The front Worker stays at 0–2 ms CPU (p99 2.44 ms in analytics, cold invocations 1 ms) on every route, including cron. The handlers run unchanged inside a SQLite-backed Durable Object on Workers Free, under the documented 30 s per-request CPU limit, with 0 errors across 350 object requests. Deleting a large account drops from 82–97 invocations to 11.

### Exact remaining migration scope (not started)

1. **Production config:** add the Durable Object binding, the `v1` `new_sqlite_classes` migration and `main = "src/edge.ts"` to production. This is a production change and needs its own approval, together with the production KV/D1 bindings that already block this code. The existing `[env.staging]` Worker becomes the rollback.
2. **One staging host:** retire either the plain staging Worker or the proof Worker so only one cron maintains the shared staging project; point `EXPO_PUBLIC_R2_UPLOAD_WORKER_URL` (EAS `preview`) at the chosen host, and keep `MEDIA_PUBLIC_ORIGIN` as the canonical media origin or migrate the stored URLs.
3. **Work allowances inside the object:** keep `SLICE_WORK_UNITS`/`CRON_WORK_UNITS` sized to the 50-subrequest cap (40 here). Cron recovery is still one slice per job per run. If faster unattended recovery is needed, add object alarms to schedule extra maintenance invocations; each alarm is an object request and costs duration.
4. **Monitoring:** alert on the Free daily limits (100,000 Worker requests, 100,000 object requests, 13,000 GB-s) and on 503 `service/unavailable` from the front. Turn `LOG_BUDGET` off outside staging.
5. **Tests:** add an emulator-level end-to-end test through the front and object entry. Today the front is unit-tested (`tests/release/edge.cjs`) and the shared handlers by the existing suites.
6. **Unchanged blockers:** the Firestore Spark read quota (≈ 17,000–25,000 views/day), native/device checks, EAS build approval, and the owner decisions in `docs/release-handoff.md`.

## Consolidated staging on the Durable Object host (from b42a2d7)

### Final staging topology

- **One canonical staging API/media host:** `https://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev` (Worker `solotravelsoul-r2-upload-staging`, `wrangler.toml` `[env.staging]`, `main = "src/edge.ts"`). It keeps the existing hostname, so every stored media URL stays valid. `MEDIA_PUBLIC_ORIGIN`, the EAS `preview` `EXPO_PUBLIC_R2_UPLOAD_WORKER_URL` and generated media URLs are all this one origin. The app attaches the Firebase ID token only to `<that origin>/media/…`; tests cover look-alike hosts, a downgraded scheme, userinfo tricks, the retired proof host and the production host.
- **Front:**
  - Serves the static deletion page.
  - Answers 404 for anything outside the public-route allowlist (including `/maintenance` and other internal paths).
  - Forwards allowed requests unread to SQLite-backed Durable Objects `api-0` … `api-7` (names chosen by the server).
  - If an object is unavailable it fails closed with 503 `no-store` and logs `service_unavailable`.
- **Objects (`ApiShard`):** authenticate and run the existing handlers. Firestore barriers, authorization, fenced leases, counters, KV/D1 gates and cleanup guarantees are the same code as before.
- **Maintenance:** cron `*/5 * * * *` calls the fixed `maintenance` object by RPC only and runs all phases each run (`CRON_ALL_PHASES`). This is now the **only** staging maintenance schedule: the proof Worker and its cron are deleted. The production section of `wrangler.toml` is unchanged (plain Worker, hourly cron, R2 binding, no Durable Object) and was not deployed.
- **Workers Logs** are enabled for staging (`[env.staging.observability]`).
- **Bindings:** KV `staging-MEDIA_KV`, D1 `solotravelsoul-media-staging`, Firebase project `solotravelsoul-staging`, Durable Object class `ApiShard` (migration `v1`, env-scoped).
- **Active credentials:**
  - **One** staging service-account key (`sts-staging-deleter…`, key ID ending `615e6b`), used only by this Worker's `GOOGLE_SERVICE_ACCOUNT_JSON`. The proof Worker's key (ending `0b4253`) was revoked after that Worker was deleted.
  - The staging `ADMIN_DELETION_TOKEN` was rotated in this phase for the live checks. **The owner must rotate it again and keep it in a password manager.**

### Rollback (verified live before the proof Worker was retired)

- **Switch:** `cd workers/r2-upload-worker && npx wrangler deploy --env staging --var API_HOST_MODE:worker` makes the same Worker run the handlers directly. That is the pre-consolidation behaviour, one maintenance phase per cron run.
- **Why a switch:** the `ApiShard` class stays exported, so rollback never changes Durable Object migrations. Cloudflare does not allow version rollback across a migration, so `wrangler rollback` to the pre-consolidation version is not the path.
- **Return:** `npx wrangler deploy --env staging` (without the `--var`).
- **Verified:**
  - Worker mode (version `052b8221…`): smoke checks and 8/8 live media checks passed.
  - Object mode restored (`c3c4d59a…`).
  - The end-to-end test also covers worker mode.
- **Current version:** `b228b58f…` (redeployed during the restart test).

### Verification (this phase)

| Check | Result |
|---|---|
| `npm run test:release` | PASS: queues 13, deletion 65/65, media 15/15, edge 6/6, app 7/7, staging 6/6 |
| `npm run test:rules` (Firestore, Storage, Auth emulators) | PASS: rules 82, deletion 52/52, media 11/11, **end-to-end 7/7** |
| End-to-end (`tests/release/e2e.cjs`) | The real front Worker and SQLite Durable Objects in workerd (Miniflare), local KV/D1, Firestore/Auth/Storage emulators: internal-route denial, unauthorized requests, authenticated upload/view, deletion across many slices, concurrent deletion attempts, maintenance recovery through the cron entry (RPC), rollback mode |
| Type checks / lint | PASS / 0 errors (warnings unchanged) |
| Staging isolation | `check:staging` all PASS; full EAS + metadata check passed earlier (26/26) and the EAS values are unchanged |
| Live, canonical host (disposable accounts) | 22/22: 12 stored pre-consolidation media URLs authorize correctly; media (8/8 incl. direct client privacy change, report auto-hide, moderator removal, profile replacement); two-account deletion with B's retained data verified; large account (11 invocations, exact counters); concurrency (10 parallel uploads, 40 parallel views, simultaneous deletion starts → 202 + 409, completed once) |
| Live restart | redeploy during a large deletion: the run continued (11 invocations, no failed request), verified |
| Live unattended recovery | account CR2 abandoned after one slice at 02:21:20 UTC and finished by the single `*/5` schedule alone: completed after 12 attempts, about 55 minutes (data, Auth and 21 media rows removed). The first verification attempt failed on a transient `wrangler d1 execute` subprocess error; the re-check passed |

**Measured on the final host** (Cloudflare tail; front and object separately):

| Host | Route | Samples | CPU median | CPU max | Wall median |
|---|---|---|---|---|---|
| front | view | 28 | 1 ms | 2 ms | 0.27 s |
| front | upload | 17 | 1 ms | 1 ms | 0.48 s |
| front | deletion | 11 | 1 ms | 1 ms | 2.5 s |
| front | cron | 12 | 0 ms | 0 ms | 12.9 s |
| object | view | 39 | 2 ms | 5 ms | 0.18 s |
| object | upload | 17 | 2 ms | 4 ms | 0.42 s |
| object | deletion slice (≤ 38 subrequests, ≤ 14 D1 queries) | 11 | 19 ms | 26 ms | 2.5 s |
| object | cron, all phases (≤ 40 subrequests, ≤ 28 D1 queries) | 12 | 20 ms | 25 ms | 12.9 s |

All outcomes were `ok`. Cloudflare analytics for the 1.3 h after consolidation (`scripts/stagingUsage.cjs --hours 1.3`): 434 Worker requests, 390 object requests, ≈ 40 GB-s; 0 Worker errors, 0 object errors, 0 exceeded-CPU or exceeded-memory, 0 stalled deletions. Front CPU p99 was 7.17 ms; that window includes the rollback-mode test traffic, when the handlers ran in the Worker. KV: 98 writes and 105 deletes in that burst of tests. Over the last 24 h, KV writes were 192 (19% of the daily 1,000).

### Free-plan ceilings and expected delays

Daily limits (Cloudflare and Firebase documentation) and what each operation uses (measured):

| Resource (Free/Spark per day) | Limit | Upload | View | Deletion |
|---|---|---|---|---|
| Worker requests | 100,000 | 1 | 1 | 1 per slice |
| Durable Object requests | 100,000 | 1 | 1 | 1 per slice (+ 288 cron runs/day) |
| Durable Object duration | 13,000 GB-s (128 MB × active time incl. I/O waits) | ≈ 0.05 GB-s | ≈ 0.02 GB-s | ≈ 0.32 GB-s per slice; cron ≈ 1.7 GB-s per run (≈ 480/day) |
| KV writes / deletes | **1,000 / 1,000** | 1 write | – | 1 delete per media object |
| KV reads | 100,000 | – | 1 | – |
| D1 rows read / written | 5,000,000 / 100,000 | ≈ 2 written | ≈ 2 read | a few per media object |
| Firestore (Spark) reads / writes / deletes | **50,000** / 20,000 / 20,000 | ≈ 4 reads | ≈ 2–3 reads | tens to hundreds per account |

**Binding ceilings** (estimates from the table, not load-tested):
- **Uploads:** about **1,000/day** (KV writes).
- **Media cleanup:** about 1,000 objects/day (KV deletes). Beyond that, deletions stay queued (`kv_delete_pending`) and complete the next UTC day; they are never reported as deleted.
- **Views:** about 17,000–25,000/day (Firestore reads).
- **Request ceilings:** 100,000 API calls/day.

**Expected delays:**
- **User-driven deletion** finishes in seconds to about a minute (a large test account took 11 requests).
- **Unattended deletion** (the user leaves) advances one slice per job per 5-minute cron run. A large account needs about an hour, and resume-cursor rotation can add one run.
- **Stalled reporting:** deletions are reported as stalled after 6 hours.
- **Late-media sweeps** run each cron for 24 hours after a deletion.

### Monitoring available on Free

- **Workers Logs** (enabled for staging). Query the structured events: `service_unavailable` (front 503), `maintenance_unavailable`, `account_deletion_stalled`, `deletion_sweep_failed`, and the `budget` lines.
- **`scripts/stagingUsage.cjs`** (read-only):
  - Worker and Durable Object requests and errors, front CPU p99, object exceeded-CPU/memory, duration GB-s, D1 rows and KV operations, each against the Free daily limits.
  - Stalled deletions and unresolved legacy media (with the admin token).
  - Exits non-zero at ≥ 80% of a limit, on errors or on stalled deletions. Run it daily by hand or from any scheduler the owner already has.
- **Not available here:**
  - Push alerting on log queries or usage thresholds was not set up; whether it is available on the Free plan was not verified.
  - Firestore usage is visible only in the Firebase console's Usage tab.
  - Nothing exhausted a shared quota; quota failures were simulated in tests.

## Android preview preflight (from 8080f07)

- **Native Firebase files:**
  - Confirmed unused: no `googleServicesFile` in the evaluated config, and no `@react-native-firebase` dependency.
  - `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICE_INFO_PLIST` were each one EAS variable linked to production, preview and development. Deleting them would have removed production's copy, so `preview` was **unlinked** instead (`eas env:update … --environment production --environment development`). Production and development keep them with their values unchanged; the variables' update timestamps changed with the environment list.
- **Mapbox:**
  - `app.json` passed `{"RNMapboxMapsDownloadsToken": "$MAPBOX_DOWNLOADS_TOKEN"}`. The key is misspelled, so the installed plugin (`@rnmapbox/maps` 10.3.1) ignored it. JSON does not interpolate it either, so a corrected spelling would have written the literal string into `gradle.properties`. The plugin is now listed without options.
  - The plugin's Maven repository needs no token (credentials are added only if `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` is set).
  - Runtime Mapbox use is optional (`EXPO_PUBLIC_MAPBOX_ENABLED` plus a public `EXPO_PUBLIC_MAPBOX_TOKEN`; otherwise a placeholder map). Foursquare is optional (`EXPO_PUBLIC_FOURSQUARE_ENABLED`).
- **Permissions:** `SYSTEM_ALERT_WINDOW` (from Expo's default template; unused; special permission) is now blocked. Expo prebuild introspection shows the merged manifest's active permissions: coarse/fine location, camera, internet, post-notifications, receive-boot-completed, use-biometric, use-fingerprint, vibrate.
- **Staging checker:**
  - Now requires the EAS preview Worker URL to equal the staging `MEDIA_PUBLIC_ORIGIN`, the only origin the app attaches tokens to.
  - Now requires that preview carries no native Google service files.
  - Full run with current EAS preview values and live staging SDK metadata: **28/28 PASS, exit 0**.
- **EAS Free:** 0 of 30 builds used this cycle, $0 estimated. No Android build has ever run, so the first build creates the keystore (interactive once). Build and device-test commands: `docs/release-handoff.md` section 10.
- **Not done:** no build, no device test. Nothing native is claimed from exports or tests.

