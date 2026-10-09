# Release handoff (free tier: Firebase Spark + Workers Free + KV/D1)

Status at commit time: **not store-ready.** Staging is consolidated and live-verified (see below and `docs/release-hardening.md`), but production is untouched and every native, build and owner item in section 9 is still open. Everything marked *draft* must be confirmed by the app owner before it is entered in a console. No owner, staff member or completed operation is assumed here.

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
- **Disposable test accounts** still exist in staging Auth/Firestore (emails `sts-live-<run>-<key>@example.test`). Delete them when staging testing is finished.

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

Checklist: `docs/release-hardening.md` → "Live and native verification checklist". The staging backend is deployed and live-verified (section 0). Every **native** item is still BLOCKED: no native build has run, and no Android device/emulator or macOS is available here. Builds exported with `expo export` and mocked tests are not proof of native UI behaviour. Build and device commands: section 10.

## 9. Consolidated remaining blockers (owner actions)

1. **Native Firebase files: resolved for preview.** The app uses the Firebase JS SDK only (no `googleServicesFile`, no `@react-native-firebase`). `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICE_INFO_PLIST` were single EAS variables shared by production, preview and development. `preview` was unlinked; production and development keep them (values unchanged).
2. **Preview keys (optional):**
   - **Not required for a preview build.** `@rnmapbox/maps` 10.3.1 downloads the Android SDK without a token, and app config no longer passes one (the old option was misspelled and ignored).
   - **Mapbox maps:** without `EXPO_PUBLIC_MAPBOX_ENABLED=true` and a public `EXPO_PUBLIC_MAPBOX_TOKEN`, the app shows its placeholder map. To test Mapbox maps on a device, the owner adds both to EAS `preview`.
   - **Foursquare:** stays off unless `EXPO_PUBLIC_FOURSQUARE_ENABLED=true` (with `EXPO_PUBLIC_FOURSQUARE_API_KEY`); it is not needed.
3. **Build approval:** the Android preview build is prepared but not run.
   - **Cost:** EAS Free plan, 0 of 30 builds used in the cycle ending 2026-11-01, no overage or add-ons, so one build costs nothing.
   - **First build:** it must create the EAS-managed Android keystore, so run it interactively once (section 10).
   - **iOS:** device builds need a paid Apple Developer membership, outside the no-paid-plans constraint.
4. **Device testing:** no Android device/emulator or macOS is available here. The native checklist (authenticated image loading, token refresh/account switching, native caching, uploads, large groups, moderation, suspension, deletion continuation/blocked/recovery) is BLOCKED.
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

## 10. Android preview build and device test (prepared; not run)

**Prerequisites (verified):**
- EAS `preview` holds exactly the eight `EXPO_PUBLIC_*` staging values (Firebase web config from the staging project, Worker URL = media origin).
- `npm run check:staging -- --eas-env <pulled preview> --firebase-metadata <staging SDK config>`: 28/28 PASS.
- **Evaluated Android config:**
  - package `com.solotravelsoul.app`, with no native Firebase file and no Mapbox token in `gradle.properties`;
  - merged-manifest permissions limited to location (coarse, fine), camera, internet, notifications, boot-completed (local reminders), biometrics and vibrate;
  - restricted media, storage, audio, exact-alarm and overlay (`SYSTEM_ALERT_WINDOW`) permissions are removed.
- The preview APK uses the production application ID, so it replaces, rather than sits beside, any production install on the same device.

**Build** (owner approval required; the first run is interactive so EAS can generate and store the Android keystore):

```
cd apps/mobile
npx eas build --profile preview --platform android
```

Answer **Yes** to "Generate a new Android Keystore?". Later runs can add `--non-interactive`. The build runs in the EAS Free queue and ends with an install URL/QR code for the APK.

**Install** on an Android 10+ device: open the URL/QR on the device and allow installing from that source. With a computer and USB debugging: `adb install -r <downloaded.apk>` (Android platform-tools are not installed on this machine).

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

