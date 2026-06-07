# SoloTravelSoul — Community Platform Product Requirements

**Status:** Design / Pre-implementation  
**Date:** May 2026  
**Authors:** Product, Engineering, Design  
**Version:** 1.0

---

## 1. Vision

> "SoloTravelSoul is the planning and social discovery app for solo travelers — where you plan your adventure, find your people, and build memories worth sharing."

The app evolves from a personal trip planner into a **safe, community-first solo travel platform** that helps travelers connect with compatible co-adventurers, discover public trips and groups, and build a trusted social graph of fellow explorers — without sacrificing the solo identity that makes the community unique.

---

## 2. Business Goals

| Goal | Metric Proxy |
|---|---|
| Increase 30-day retention | Users who join or follow ≥ 1 group stay longer |
| Grow organic discovery | Public trip and group views without paid acquisition |
| Enable safe traveler connections | Join request approval model; block/report available |
| Keep cost controlled | No Cloud Functions required for V1 community features |
| App Store safe | No "find strangers by GPS" framing; privacy-first descriptions |
| Realistic V1 launch scope | Only Phases 1–3 required before first store submission |

---

## 3. User Personas

### Primary: The Independent Explorer
- Age 25–38, solo traveler for 1–5 years
- Plans 2–4 trips per year
- Wants structure but also spontaneity
- Values safety above serendipity when meeting strangers
- **Pain point:** Planning is easy; finding compatible travel companions is hard

### Secondary: The Group Organizer
- Creates public trips and travel groups
- Experienced solo traveler who now prefers small curated groups
- Wants tools to vet and approve joiners, not just open invites
- **Pain point:** No good tool that combines trip planning with community discovery

### Tertiary: The New Solo Traveler
- First or second solo trip, anxious about logistics and safety
- Wants to discover what others are doing, not lead
- Reads reviews, joins public groups to observe before participating
- **Pain point:** Feels isolated, overwhelmed by logistics

---

## 4. User Stories

### A. Traveler Profile

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| UP-01 | User | Add bio, travel styles, languages, and countries visited to my profile | Others can understand my travel identity |
| UP-02 | User | Set my profile to public or private | I control who sees my travel identity |
| UP-03 | User | Upload a profile photo | I look real and trustworthy to other travelers |
| UP-04 | User | Mark my email as verified in my profile | Others see a trust indicator |
| UP-05 | User | View another user's public profile | I can decide if they're a compatible travel companion |
| UP-06 | User | Block another user | They cannot see my profile, message me, or find me |
| UP-07 | User | Report another user | Abuse is flagged for admin review |

### B. Public Trips

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| PT-01 | Trip Owner | Set my trip visibility to private / friends / public | I control who can discover it |
| PT-02 | Trip Owner | Make my trip discoverable with tags and a description | Compatible travelers can find and request to join |
| PT-03 | Traveler | Browse a list of public trips filtered by destination or dates | I find trips matching my plans |
| PT-04 | Traveler | View the public details of a trip before requesting to join | I can make an informed decision |
| PT-05 | Traveler | Save a public trip I'm interested in | I can revisit it later |
| PT-06 | Traveler | Share a public trip link | I can tell friends about it |
| PT-07 | Traveler | Report a public trip | Inappropriate content is flagged |

### C. Trip Join Requests

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| JR-01 | Traveler | Request to join a public trip with an optional message | The owner can review my request |
| JR-02 | Traveler | See the status of my join requests (pending/approved/rejected) | I know where I stand |
| JR-03 | Traveler | Cancel a pending request | I change my mind |
| JR-04 | Trip Owner | See all pending join requests for my trip | I can review and act |
| JR-05 | Trip Owner | Approve a request | The requester joins the trip and gets access to the group chat |
| JR-06 | Trip Owner | Reject a request with an optional reason | The requester is notified politely |
| JR-07 | Trip Owner | Remove an approved member | I can maintain the quality of my trip |

### D. Travel Groups

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| TG-01 | User | Create a travel group with name, destination, dates, capacity, rules, and visibility | I can organize a structured group |
| TG-02 | User | Browse public travel groups | I discover groups aligned with my interests |
| TG-03 | User | Request to join a group | The admin reviews my request |
| TG-04 | Group Owner | Approve or reject group join requests | I curate the group |
| TG-05 | Group Member | Access the group chat after approval | I coordinate with members |
| TG-06 | Group Owner | Remove a member from the group | I manage group quality |
| TG-07 | User | Leave a group | I exit when I choose |
| TG-08 | User | Report a group | Inappropriate groups are flagged |

### E. Nearby Travelers (V1.2+)

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| NT-01 | User | Opt in/out of traveler discovery | I control my visibility |
| NT-02 | User | Set my current city or trip destination | Others in the same area can find me |
| NT-03 | User | Browse travelers visiting the same destination | I discover compatible travel companions |
| NT-04 | User | Filter travelers by style, dates, language | I find the most compatible matches |

### F. Activity Feed (V1.2+)

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| AF-01 | User | See a feed of public travel activity | I discover trips, groups, and memories |
| AF-02 | User | Filter the feed by destination | I see relevant content |
| AF-03 | User | Like or save a feed item | I engage with content I find inspiring |

### G. Safety

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| SF-01 | User | Report any user, trip, group, or message | Abuse is surfaced |
| SF-02 | User | Block any user | I remove them from my experience permanently |
| SF-03 | Admin | Review reports and take action | The platform stays safe |
| SF-04 | User | Mute a group chat | I reduce noise without leaving |

---

## 5. Acceptance Criteria

### Profile (Phase 1)
- User can edit and save: bio (500 chars max), bio not required
- Travel styles: multi-select from predefined list (8 options)
- Countries visited: multi-select from ISO country list
- Languages spoken: multi-select
- Dream destinations: free text, up to 5 entries
- Interests: multi-select from predefined list
- Profile visibility toggle: public / private (default: private)
- Public profile viewable by authenticated users only
- Private profile shows only display name and photo to non-friends

### Public Trips (Phase 2)
- Trip visibility options: private (default), public
- Public trips visible in Discover without login NOT required (authenticated only for V1)
- Public trip list paginated (20 per page)
- Public trip list filterable by destination text search
- Public trip detail shows: destination, dates, owner profile, member count, description, tags
- "Save trip" persists to user's saved collection
- Owner-only actions (edit, delete) not visible to non-owners

### Join Requests (Phase 3)
- User cannot request to join their own trip
- User cannot submit duplicate pending request
- Owner receives notification within 5 seconds (local) or next app open
- Approved user appears in trip members list
- Approved user gains access to trip group chat
- Rejected user cannot resubmit for 24 hours (rate limit)

---

## 6. Non-Goals (Explicit Out-of-Scope)

These are intentionally excluded from all versions covered by this document:

- **No real-time GPS tracking** — location features use city-level only
- **No routing or navigation** — maps show pins only, no directions
- **No dating-style swipe UI** — this is not a dating app
- **No paid subscriptions** — V1 is entirely free
- **No in-app payments** — no booking, tickets, or purchasing
- **No AI/ML matching** — manual filters only
- **No public posts without auth** — all community features require login
- **No federated identity** — no Sign in with Google/Apple at this stage (Firebase email auth only)
- **No push notifications via FCM** — local notifications only for V1; FCM marked Phase 9+
- **No admin dashboard** — reports reviewed manually via Firestore console
- **No real-time typing indicators** — existing chat is sufficient

---

## 7. Privacy Requirements

| Requirement | Details |
|---|---|
| No exact GPS storage | City/destination text only; no lat/lng in social collections |
| Profile visibility default | Private by default — user must opt into public |
| Traveler discovery opt-in | Separate explicit toggle; off by default |
| Block propagation | Blocking prevents all cross-profile visibility |
| Data deletion | Deleting account removes all public profile data, posts, join requests |
| GDPR-adjacent | Account deletion removes personal data from all community collections |
| Age | App is 17+ in store (travel planning + chat); no 13+ flows |
| Email not exposed | Email address never shown in public profiles |

---

## 8. Safety Requirements

| Requirement | Priority |
|---|---|
| Report flow on every public profile, trip, group, and message | Must have V1 |
| Block prevents: profile view, messaging, discovery, join requests | Must have V1 |
| Join request approval model — no instant access | Must have V1 |
| Owner can remove any member from their trip/group | Must have V1 |
| Rate limit: 3 join requests per user per day | Must have V1 |
| Reports stored in Firestore, not surfaced to reporter | Must have V1 |
| Safety guidelines screen accessible from profile settings | Must have V1 |
| No minors content — 17+ store rating | Must have V1 |
| No public map of "who is nearby right now" | Nearby is city-list only, not map |
| Mute group chat | V1.1 |
| Admin can promote member to moderator | V1.2 |
| Automated report review | V2 (Cloud Functions needed) |

---

## 9. Feature Scope by Release

| Feature Area | V1.0 (Launch) | V1.1 | V1.2 | V2 |
|---|---|---|---|---|
| Enhanced traveler profile | ✅ Required | | | |
| Public/private profile toggle | ✅ Required | | | |
| Block / Report user | ✅ Required | | | |
| Trip visibility (private/public) | ✅ Required | | | |
| Public trip discovery | ✅ Required | | | |
| Trip join request flow | ✅ Required | | | |
| Trip member management | ✅ Required | | | |
| Safety guidelines screen | ✅ Required | | | |
| Travel groups creation | | ✅ | | |
| Group discovery | | ✅ | | |
| Group join request flow | | ✅ | | |
| Group chat integration | | ✅ | | |
| Activity feed | | | ✅ | |
| Nearby travelers | | | ✅ | |
| Traveler filters/matching | | | | ✅ |
| FCM push notifications | | | | ✅ |
| Admin moderation tools | | | | ✅ |
| AI recommendations | | | | ✅ |
