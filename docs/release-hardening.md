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

- Account deletion remains incomplete: the client does not purge all Phase 2 posts/journals, relationship documents, uploaded Firebase Storage/R2 objects, or all embedded identities. Cleanup failures now propagate, preventing Auth removal after a reported cleanup failure, but successful legacy cleanup can still leave those other records. Do not claim complete erasure or submit to stores until a trusted, retry-safe deletion flow covers them and has failure/retry tests.
- Photos delivered through public R2 URLs or Firebase download links are bearer-link accessible. Private Firestore records do not revoke those links. Fully authenticated private media requires a separate access-control change if that is the intended promise.
- Native iOS/Android runtime checks, release signing, live configuration and store privacy declarations still need validation. No device test or signed store build was performed here.
- Legacy profiles missing counters/parent documents require migration or repair before strict social transactions can succeed. Changing profile visibility now preserves the profile record and counters.

## Next Claude phase

Inspect the repo and existing docs/code for prior context. Continue only the remaining account-deletion phase on this branch. Reuse Firebase and the existing R2 worker; avoid unrelated redesign. Implement trusted, authenticated, recent-reauth deletion covering owned Firestore subcollections, Phase 2 content/relationships and counter cleanup, Firebase Storage/R2 objects, and embedded participant identity. Preserve other users' content and retire Auth only after durable cleanup succeeds; make failure/retry safe. Keep private credentials server-side. Match the privacy text to verified retention behavior. Test two-user ownership, wrong password/stale auth, partial failures and retries in emulators and a native staging build. Run release tests, rules tests, typecheck, lint and both exports. Commit + push the branch; do not merge or deploy. Report only SHA, changed files, fixes, test results and blockers. Stop after this phase.
