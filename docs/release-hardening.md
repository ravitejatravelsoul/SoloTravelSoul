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
- Barrier: `accountDeletions/{uid}` is created before any step and never removed. Every client write rule in `firestore.rules` and every write in `storage.rules` (cross-service `firestore.exists`) refuses that UID while it exists, and the Worker upload endpoints check it before storing and again after (removing an object whose upload was in flight when deletion began). Other devices and still-valid ID tokens therefore cannot recreate data during or after deletion. Rules also refuse new inbound relationships to a deleting account or its content (likes, saves, follows, comments, replies, trip/group memberships, join requests) and new chat links: creating or adding to a chat group with a deleting member, creating a direct chat with one, or sending a direct message to one (the message, and the preview update). Existing chat history stays readable and can be marked read. Because rules cannot iterate a member list, each group create/update may add at most 8 members, each checked against the barrier; `createGroup` adds larger groups in chunks of 8 and deletes the group if a chunk is refused. Unrelated users' writes are unaffected. Uploads fail closed with 503 `uploads/unavailable` when the Worker has no usable service-account secret to read the barrier.
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
| Groups | Creation interrupted between chunks left a partly populated group visible; an interrupted rollback left it behind. | Members beyond the first chunk are stored in `pendingMembers`; groups with pending members are hidden from every member's list. The creator's client resumes creation (or rolls it back if a member is refused) whenever it sees the group again. |
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

1. **Workers Paid plan.** Free allows 50 subrequests per request; a deletion needs far more. Without Paid, deletion requests fail every time (cron would resume them but each run is also capped).
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
- **Moderation operations** (App Store 1.2): reports are stored but there is no review tooling or documented response process; a human process to review `reports` and remove content/users promptly (Apple reviewers expect ~24 h) must exist before submission. No automated objectionable-content filter exists; reporting, blocking and moderation are the mitigation.
- **Operator fulfilment of web requests** requires verifying the requester owns the account email before calling the admin endpoint; the processing time promised on the web page should be confirmed by the owner.
- **Credentials/config** listed in the rollout order (Workers Paid, service account, admin token, Storage-to-Firestore grant, EAS env vars, store submit config) are not set up by this change.
- Public photo URLs remain bearer-link accessible until deleted; legacy data repair and coordinated old-client rollout as described above.
- `SYSTEM_ALERT_WINDOW` and `USE_FINGERPRINT` still appear in the merged Android manifest (template / local-authentication defaults); review in the Play Console permissions report.
