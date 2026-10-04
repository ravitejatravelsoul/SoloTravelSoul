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

## Remaining release blockers

- Account deletion is implemented server-side (see below) but is not live until the Worker secret, Storage bucket variable and index overrides are deployed and the flow is validated on staging native builds.
- Photos delivered through public R2 URLs or Firebase download links are bearer-link accessible. Private Firestore records do not revoke those links. Fully authenticated private media requires a separate access-control change if that is the intended promise.
- Native iOS/Android runtime checks, release signing, live configuration and store privacy declarations still need validation. No device test or signed store build was performed here.
- Legacy profiles missing counters/parent documents require migration or repair before strict social transactions can succeed. Changing profile visibility now preserves the profile record and counters.

## Account deletion (server-side)

`POST /account/delete` on the R2 worker (`workers/r2-upload-worker/src/accountRoute.ts`, `accountDeletion.ts`) deletes an account with Admin credentials held only as a Worker secret. The app reauthenticates with the password, sends a force-refreshed ID token, and the Worker rejects tokens whose `auth_time` is older than 5 minutes.

- Deleted: `users/{uid}` and every subcollection, saved places, directory entries (exact-email alias only when it still belongs to the user), public profile, nearby/reputation docs, block list, notifications, place reviews, activity feed, posts, journals, stories, owned public trips/groups (with member subcollections), join requests, the user's likes/saves/follows, memberships, R2 `profile_photos/{uid}/` + `post_photos/{uid}/`, Firebase Storage `profile_photos/`, `trip_covers/`, `journals/` for the UID.
- Counters on other users' documents (likes, saves, comments, replies, followers/following, memberCount) are released in the same atomic commit as the relationship, with optimistic preconditions; never below zero.
- Preserved, anonymized as "Deleted User": the user's comments on others' posts (tombstoned, replies kept), sent chat messages, group chat previews, DM participant info, notifications delivered to others. Safety reports are retained.
- Barrier: `accountDeletions/{uid}` is created before any step and never removed. Every client write rule in `firestore.rules` and every write in `storage.rules` (cross-service `firestore.exists`) refuses that UID while it exists, and the Worker upload endpoints check it before storing and again after (removing an object whose upload was in flight when deletion began). Other devices and still-valid ID tokens therefore cannot recreate data during or after deletion. Rules also refuse new inbound relationships to a deleting account or its content (likes, saves, follows, comments, replies, trip/group memberships, join requests); unrelated users' writes are unaffected. Uploads fail closed with 503 `uploads/unavailable` when the Worker has no usable service-account secret to read the barrier.
- Late media and finalization: before Auth removal the job durably records `mediaClearedAtMs` and `pendingFinalization: true`. The hourly cron (1) completes any job still pending finalization — deleting the Auth user if it remains and no attempt holds an active lease — so a lost final bookkeeping write or a failed Auth removal never depends on the user signing in again, and (2) sweeps media for every job whose media was cleared in the last 24 h, regardless of completion status, covering uploads that were authorized before the barrier and finished after the media step.
- Attempts: each request claims the job with a unique `attemptId` and a 5-minute lease, renewed whenever less than half remains while it works (including per media page). Every job update is conditional on owning the job (`attemptId`, `in_progress`, unexpired lease, document `updateTime`). An attempt whose lease expired or was taken over stops at its next operation and cannot mark a newer attempt failed or overwrite a completed job.
- Retry safety: steps are idempotent and rediscover work on every attempt. Firebase Auth is deleted only after every data and media step succeeds. After a failure some data may already be deleted and the account is locked against changes (barrier), but the user can still sign in and retry until it completes.
- Likes and saves by any user that point at the deleted user's own posts/journals are removed together with that content; other users' likes/saves on other content are untouched.
- The client pauses offline sync during deletion and, only after success, clears every AsyncStorage key containing the UID (caches, sync/chat queues, reminder IDs) and cancels scheduled reminders.

### Rollout prerequisites

1. Uploads now require the `GOOGLE_SERVICE_ACCOUNT_JSON` secret (barrier read) and return 503 without it — set the secret before deploying this Worker. Grant the Firebase Storage service agent access to Firestore for cross-service rules (the console prompts on first deploy of `storage.rules`); without it the Storage barrier denies all writes. Then create a dedicated service account with Cloud Datastore User, Storage Object Admin (Firebase bucket) and Firebase Authentication Admin roles; `wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON`. Confirm `FIREBASE_STORAGE_BUCKET` in `wrangler.toml`. Without the secret the endpoint returns 503 and deletes nothing.
2. Deploy `firestore.indexes.json` field overrides (collection-group `members.uid`, `messages.senderId`) and wait for them; production rejects those queries until then.
3. Deploy the Worker (including its hourly cron trigger) to staging, set `EXPO_PUBLIC_R2_UPLOAD_WORKER_URL` for the staging build, and validate with two accounts on native builds: wrong password, stale login, deletion with posts/comments/follows/chats/photos, forced failure + retry, and that the other account's content and counters are intact.

Tests: `npm run test:release` (in-memory store, route gate, client flow) and `npm run test:rules` (same scenario through the real REST adapter on the Firestore emulator). `test:rules` also runs the Storage emulator to verify the cross-service barrier. The R2 / Cloud Storage / Identity Toolkit adapters and the cron trigger are exercised with fakes only; they need staging verification.
