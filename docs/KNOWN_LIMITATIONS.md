# Known limitations — SoloTravelSoul 1.0.0 (refreshed 2026-10-20)

This replaces an older version that described a private-only, no-social app. It lists what is true of the code and staging today. It is not a claim of store readiness or legal compliance; the owner and legal decisions are in `docs/qa-report-2026-10-19.md` section 11.8.

## What the app is now

Trips are private by default and can be published as **public trips** that others discover and ask to join. There is a feed (posts, journals, follows), public profiles, community groups, direct messages and group chats, reporting, blocking, moderation and account deletion. The older "no social features" statements no longer apply.

## Notifications

- There is **no in-app notification screen and no bell**: clients cannot create notifications under the security rules, so the empty screen was removed. Nothing in the app promises likes, comments or follows alerts.
- **No push notifications** are sent (no push token is collected). Only local reminders (trip reminders, join-request alerts while the app runs) are scheduled on the device.

## Messages and groups

- Group chats start with only their creator; other people join by accepting an invitation sent to their e-mail address. The inviter is not told whether an address has an account. The invited person must have a **verified** e-mail (Chats shows a banner with Send e-mail and I have verified); the server checks the ID token's `email_verified` claim, and the inviter needs no verification. Verification is not required for anything else in the app. Delivery of the verification e-mail depends on Firebase's sender and the recipient's spam filtering; the app never claims delivery.
- A refused send (suspended account, restricted chat) keeps its text in the message box. A message queued while offline that the server then refuses is never delivered; its text returns to the box if that chat is opened in the same app session (it is held in memory, so closing the app first loses it).
- A chat nobody has written in is not listed for either person (the empty document exists until its participants are deleted).
- Direct chats anonymized before 2026-10-20 are not removed when their last participant deletes their account (there was no record to detect it).

## Moderation

- Hidden and removed public trips and community groups are left out of discovery by the app; they remain readable by direct id to signed-in users, because list queries cannot filter on a field older documents lack. New requests, approvals and edits are refused by the server.
- Moderators have no web console; the queue, the hidden list and suspensions are in the app. The `moderators/{uid}` role is granted only by the project owner. Nobody has been appointed for production.
- Content creation requires the current accepted Terms version on the server; profile text and edits to existing content are not gated. A client-side gate covers the rest.

## Media and storage

- Media is uploaded through the Cloudflare Worker (bytes in KV, index in D1) on staging; there is no R2 bucket or Firebase Storage bucket for staging. Production is prepared but not rolled out.
- Large photos upload as they are (a size limit is enforced by the Worker, not compression).

## Offline

- The Firestore client uses an in-memory cache, so reads are limited to the current session. Trip and chat writes made offline are queued and replayed when the connection returns.

## Search, maps and sign-in

- Live place search (Foursquare) is off by default; Discover uses the curated local dataset.
- Maps use an OpenStreetMap web map; Mapbox needs a native build and is not enabled.
- Only e-mail/password sign-in exists (no Apple or Google sign-in).

## Itinerary

- Items reorder within a day only; moving an item to another day means delete and re-add.

## Account deletion

- Deleting an account runs through the Worker (`POST /account/delete`), in resumable steps, and finishes by deleting the sign-in. It removes the person's data and media, anonymizes their messages in chats others still use, and deletes chats and groups nobody remains in. Safety reports are kept. There is no Cloud Function and no 30-day cleanup cycle.

## Build files

- `apps/mobile/google-services.json` and `GoogleService-Info.plist` are not in the repository and must be supplied for native production builds (see `docs/release-handoff.md`).
- An installed preview build older than 2026-10-20 cannot create content against the new staging rules until an updated build is installed and the Terms accepted.

## Device verification gaps (2026-10-20)

Not verified on the physical phone because its USB connection was lost after 2026-10-20: the trip summary and join form at 2.0x text, the gesture-navigation layouts, the Saved Posts text-only tile, and account deletion in the UI. All four were verified on the emulator (section 12 of the QA report) and remain BLOCKED on the phone.
