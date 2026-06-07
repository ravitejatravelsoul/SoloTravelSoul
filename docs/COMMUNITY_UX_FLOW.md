# SoloTravelSoul — Community UX Flow

**Status:** Design / Pre-implementation  
**Date:** May 2026  
**Version:** 1.0

---

## 1. Navigation Architecture

### Current Tab Bar (unchanged in V1.0)
```
[Home/Dashboard]  [Discover]  [Trips]  [Profile]
```

### V1.0 additions (no new tab)
- Discover tab gains: Public Trips section + Browse Travelers (navigated to from within)
- Profile tab gains: Edit Extended Profile, Privacy Settings, My Join Requests

### V1.1 additions (Community tab added)
```
[Home]  [Discover]  [Trips]  [Community]  [Profile]
```
- Community tab: Travel Groups, Browse Travelers, Activity Feed

### Navigation stack overview

```
Discover (tab)
├── List view (existing)
├── Map view (existing)
└── [NEW] Explore tab within Discover
    ├── Public Trips list
    ├── Public Trip Detail
    │   ├── Owner Public Profile
    │   └── Join Request Modal
    └── My Join Requests (navigated from profile shortcut)

Profile (tab)
├── My Profile (existing)
├── Edit Profile (existing → extended)
├── [NEW] Privacy Settings
├── [NEW] My Join Requests
├── [NEW] Safety & Guidelines
└── [NEW] Block/Report flows

Community (tab — V1.1)
├── Travel Groups list
├── Travel Group Detail
│   ├── Members list
│   ├── Join Request Modal
│   └── Group Chat (after approval)
├── Browse Travelers (V1.2)
└── Activity Feed (V1.2)
```

---

## 2. Screen Inventory

### Phase 1 — Traveler Profile

#### 2.1 Edit Extended Profile
**Route:** `profile/edit` (extends existing)

**Sections added:**
1. Bio (multiline text, 500 char counter)
2. Current City (text input with suggestions)
3. Home Country (country picker)
4. Languages (multi-select chip list)
5. Travel Styles (multi-select icon grid, 8 options)
6. Countries Visited (multi-select searchable list, count shown)
7. Dream Destinations (tag input, max 5)
8. Interests (multi-select chip list)

**UX notes:**
- Sections collapsible with "Save" header button
- All sections optional — no blocking validation
- Save = batch write to `users/{uid}` + `publicProfiles/{uid}` (if public)

#### 2.2 Privacy Settings Screen
**Route:** `profile/privacy`

**Contents:**
- Profile visibility toggle: "Public" / "Private" (with explanation of each)
- "Who can see your profile?" explanation card
- "Show me in traveler discovery" toggle (V1.2, greyed out)
- Block/mute list link

**Empty state:** N/A

#### 2.3 Public Profile Screen
**Route:** `community/profile/:uid`

**Contents (if public):**
- Avatar + display name
- Current city + home country flag
- Bio
- Travel styles pills
- Countries visited count + list preview
- Languages
- Interests
- Member since
- Active trips count (if public trips exist)
- Report button (top-right menu)
- Message button (if connected — V1.1)

**Private profile state:**
- Shows: display name + avatar only
- Message: "This profile is private."
- No other content shown

**Blocked state:**
- If viewer blocked: "You have blocked this user."
- If blocked by: Shows private profile state (cannot tell if blocked)

#### 2.4 Safety & Guidelines Screen
**Route:** `profile/safety`

**Contents:**
- "SoloTravelSoul is a community for respectful travelers"
- List of community guidelines (respect, safety, no harassment)
- How to report (tappable link to report flow)
- How to block
- Link to full Privacy Policy
- Contact email for safety issues: `safety@solotravelsoul.app`

---

### Phase 2 — Public Trips

#### 2.5 Public Trips Discovery Screen
**Route:** `discover/trips` (new section within Discover or standalone)

**Header:** "Explore Trips" + destination search bar

**Filter bar:**
- Destination text search
- Date range picker (future trips only by default)
- "Open to members" toggle

**List item card:**
- Cover photo (or destination gradient fallback)
- Destination badge
- Trip title
- Owner avatar + name
- Dates
- Member count (e.g., "3 / 8 members")
- Tag pills (max 3 shown)
- "Join" or "Full" badge

**Loading state:** 3 skeleton cards

**Empty state:**
```
🗺️
No public trips found
Try a different destination or check back later.
[Clear filters]
```

**Error state:**
```
Something went wrong loading trips.
[Try again]
```

**Pagination:** Infinite scroll with `limit(20)`, show spinner at bottom during load.

#### 2.6 Public Trip Detail Screen
**Route:** `discover/trips/:tripId`

**Layout:**
```
[Cover photo or gradient hero — destination name]

[Owner card: avatar | name | city] [View profile →]

ABOUT THIS TRIP
[Description text]

TRIP DETAILS
📅 May 10–20, 2026 (10 days)
👥 3 / 8 members
🏷️ [beach] [budget] [Asia]

[Member avatars row — up to 5, then "+N more"]

━━━━━━━━━━━━━━━━━━━━━
[Request to Join]  or  [Pending Review]  or  [Trip is Full]
━━━━━━━━━━━━━━━━━━━━━

[Save Trip]  [Share]  [Report]
```

**Button states:**
| State | Button label | Action |
|---|---|---|
| Not a member, trip open | "Request to Join" | Opens join request modal |
| Request pending | "Request Pending — Cancel?" | Opens cancel confirmation |
| Already a member | "View Trip" | Navigates to trip detail |
| Trip full | "Trip is Full" | Disabled |
| Own trip | "Manage Requests (N)" | Navigate to request management |

#### 2.7 Trip Visibility Settings (inside Trip Edit)
**Route:** Existing `trips/:tripId/edit` — new section added

**New section:**
```
VISIBILITY

● Private (only you)
○ Public (anyone can discover and request to join)

[When public is selected:]
Description (shown in discover)
[________________]

Max members
[  8  ] (or "No limit")

Tags (up to 5)
[beach] [budget] [x]   + Add tag

[Save visibility settings]
```

---

### Phase 3 — Join Requests

#### 2.8 Join Request Modal
**Triggered from:** Public Trip Detail → "Request to Join"

**Layout:**
```
REQUEST TO JOIN
[Trip title]

Your message to the trip owner (optional)
[_________________________________]
[_________________________________]
max 300 characters

By requesting, you agree to the community guidelines.

[Send Request]  [Cancel]
```

**Validation:**
- Message optional
- Cannot request own trip (button not shown)
- Cannot duplicate pending request (button replaced with "Pending")

**Success state:**
- Modal closes
- Button changes to "Request Pending"
- Local notification scheduled for owner

#### 2.9 My Join Requests Screen
**Route:** `profile/join-requests`

**Tabs:**
- "Sent" (my requests)
- "Received" (requests to my trips)

**Sent request list item:**
```
[Trip cover photo]  [Trip name]
[Destination]       [Status badge]
Sent: 3 days ago
```

**Status badges:**
- 🟡 Pending
- 🟢 Approved → "View Trip" tappable
- 🔴 Rejected
- ⚪ Cancelled

**Empty state (Sent):**
```
No join requests yet.
Explore public trips and request to join one.
[Browse Public Trips]
```

**Empty state (Received):**
```
No requests received.
Make your trips public to receive join requests.
```

#### 2.10 Request Management Screen (Owner)
**Route:** `trips/:tripId/requests`

**Header:** "Join Requests — [Trip Name]"

**Filter tabs:** "Pending" | "Approved" | "Rejected"

**List item:**
```
[Avatar]  [Name]         [Pending]
          [City]
          "Message from requester..."
          [Approve]  [Reject]
```

**Approve action:**
- Confirmation: "Approve Alex's request to join Tokyo Backpack?"
- [Confirm] [Cancel]
- On confirm: status → approved, member document created, notification sent

**Reject action:**
- Quick — no confirmation modal (keeps flow fast)
- Status → rejected, notification sent

**Empty state (pending):**
```
No pending requests.
All caught up! ✓
```

---

### Phase 4 — Travel Groups

#### 2.11 Travel Groups Discovery Screen
**Route:** `community/groups`

**Header:** "Travel Groups" + "Create Group" button (top right)

**Filter bar:** Destination search + "Open to join" toggle

**Card:**
- Group name + destination
- Owner avatar + name
- Dates (if set)
- Capacity: "4 / 10 members"
- Tags
- "Join" / "Full" badge

**Empty state:**
```
🌍
No travel groups found.
Be the first to create a group for your destination!
[Create a Group]
```

#### 2.12 Travel Group Detail Screen
**Route:** `community/groups/:groupId`

Similar to trip detail but adds:
- Rules section
- Members list section
- If member: "Open Chat" button
- If not member + open: "Request to Join" button

#### 2.13 Create Group Screen
**Route:** `community/groups/create`

**Fields:**
1. Group name (required, 60 char)
2. Destination (required)
3. Dates (optional — start/end picker)
4. Description (required, 1000 char)
5. Capacity (slider: 2–50)
6. Rules (optional, 500 char)
7. Tags (multi-select)
8. Visibility (public default)

**Flow:**
- Validation on each required field
- Create → navigates to group detail
- Group owner is automatically the first member
- Chat group is created only after first member is approved (V1 simplification: create chat on group creation)

---

### Phase 5 — Nearby Travelers (V1.2)

#### 2.14 Discover Travelers Screen
**Route:** `community/travelers`

**Header:** "Travelers Near You" or "Travelers Going To [Destination]"

**Opt-in prompt (first visit):**
```
🌏 Find fellow solo travelers

Show your profile to other travelers
visiting the same places.

[Enable Discovery]  [Maybe Later]
```

**Filter bar:**
- Destination input
- Travel style chips
- Language filter

**Card:**
- Avatar + name
- Current city or destination
- Travel styles
- Languages
- "Connect" button (sends message request — V1.2)

---

### Phase 6 — Activity Feed (V1.2)

#### 2.15 Activity Feed Screen
**Route:** `community/feed`

**No filter for V1 — just global public activity**

**Feed item types:**
```
[Avatar] Name created a public trip to [Destination]  3h
[Avatar] Name joined the [Group Name] group            1d
[Avatar] Name added a memory from [Place]              2d
```

**Empty state:**
```
Nothing in your feed yet.
Join groups and connect with travelers to see activity here.
```

---

## 3. Safety & Report Flows

#### 3.1 Report Flow (Universal)

**Access:** 3-dot menu on any public profile, trip, group, or message

**Steps:**
```
Step 1: What are you reporting?
● This user's profile
● This trip
● A message in this chat

Step 2: What's the issue?
● Spam or fake content
● Inappropriate or offensive
● Harassment or bullying
● Safety concern
● Other

Step 3 (optional): Add details
[Tell us more — optional]

[Submit Report]
```

**Confirmation:**
```
✓ Report submitted
We review all reports carefully.
Thank you for keeping SoloTravelSoul safe.
[Done]
```

#### 3.2 Block Flow

**Access:** 3-dot menu on any public profile

**Steps:**
```
Block [Name]?
[Name] will not be able to see your profile,
send you messages, or find you in discovery.

[Block User]  [Cancel]
```

**Post-block:**
- Profile replaced with "User not found" for blocker's views
- All existing chats remain but are muted
- Block is invisible to the blocked user

#### 3.3 Remove from Group (Owner only)

**Access:** Members list → swipe or long-press → Remove

**Confirmation:**
```
Remove [Name] from [Group Name]?
They will lose access to the group chat.

[Remove]  [Cancel]
```

---

## 4. Empty and Error States Summary

| Screen | Empty state | Error state |
|---|---|---|
| Public trips list | "No trips found for this destination" + clear filter | "Couldn't load trips — try again" |
| My join requests (sent) | "No requests yet — explore public trips" | "Couldn't load requests" |
| My join requests (received) | "No requests — make a trip public" | "Couldn't load requests" |
| Groups list | "No groups yet — create one" | "Couldn't load groups" |
| Public profile | "Profile is private" (not an error) | "Couldn't load profile" |
| Activity feed | "Nothing here yet — join groups" | "Couldn't load feed" |
| Nearby travelers | "No travelers found in [city]" | "Couldn't load travelers" |

---

## 5. Key Design Decisions

### Decision 1: No swiping / matching UI
The app is not a dating or matching app. Public trip lists and group lists use card-based browsing. No swipe gestures for accept/reject.

### Decision 2: Join request approval required — no instant join
Even for public trips/groups, a join request is required. The owner approves. This is non-negotiable for safety and matches Apple's requirements for user-generated content apps.

### Decision 3: Community tab added at V1.1, not V1.0
Adding a 5th tab at launch adds UX complexity and scope risk. For V1.0, community features live within existing Discover and Profile tabs. Tab added at V1.1 when groups launch.

### Decision 4: City-based discovery, not GPS
Nearby travelers are found by matching current city or trip destination text — not GPS coordinates. This is safer, App Store-friendly, and much simpler to implement securely.

### Decision 5: Public profile is opt-in, private by default
Default is `profileVisibility: 'private'`. User must explicitly set to public. This is required for GDPR alignment and reduces early friction.
