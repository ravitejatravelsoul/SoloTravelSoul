# Demo Community Data Seeding

> **Safety:** Demo scripts use Firebase Admin SDK (bypasses security rules). Never commit a service account key. Never run against production without reading this first.

## Why Admin SDK?

Firestore security rules require `ownerUid == request.auth.uid` for writes to `publicTrips`, `publicProfiles`, and `activityFeed`. A client-side script can only write docs owned by the currently signed-in user — it cannot create profiles or trips for 10 different fake users. The Admin SDK bypasses all rules, so it can write any document. This is the only safe way to seed realistic multi-user demo data without weakening production security rules.

---

## Prerequisites

### 1. Install script dependencies (one-time)

From the repo root:

```bash
npm install --save-dev tsx firebase-admin
```

### 2. Get a service account key

1. Go to [Firebase Console](https://console.firebase.google.com) → your project
2. Project Settings → Service Accounts
3. Click **Generate new private key**
4. Save as `serviceAccountKey.json` — anywhere **outside** the repo, or in the repo root if (and only if) it is in `.gitignore`
5. Verify `.gitignore` contains `serviceAccountKey.json` before proceeding

> **Never commit serviceAccountKey.json.** It grants full admin access to your Firebase project.

---

## Seed demo data

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccountKey.json

npx tsx scripts/seedCommunityDemo.ts
```

On Windows (PowerShell):

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\absolute\path\to\serviceAccountKey.json"
npx tsx scripts/seedCommunityDemo.ts
```

Expected output:

```
[seed] Starting community demo seed...

[seed] ✓ 10 public profiles created
[seed] ✓ 9 public trips created
[seed] ✓ 7 travel groups created
[seed] ✓ 20 feed items created
[seed] ✓ 3 nearby travelers created

[seed] ✅ Demo seed complete!
```

---

## Clean up demo data

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccountKey.json

npx tsx scripts/cleanupCommunityDemo.ts
```

The cleanup script queries each collection for `demo == true` and batch-deletes all matching documents. It will not touch any real user data.

---

## Collections written

| Collection | Documents | Purpose |
|---|---|---|
| `publicProfiles` | 10 traveler profiles | Discover Travelers screen, profile cards |
| `publicTrips` | 9 public trips | Discover Trips screen, join request flow |
| `travelGroups` | 7 community groups | Groups tab |
| `activityFeed` | 20 feed items | Community Feed tab |
| `nearbyTravelers` | 3 entries | Nearby/Destination travelers tab |

All documents include `demo: true` — the cleanup script uses this field to identify and delete them.

---

## Demo content created

### Traveler profiles
- Priya Sharma (India → Japan) — cultural, food
- Marco Russo (Italy → Bali) — digital nomad
- Yuki Tanaka (Japan → Iceland) — adventure, photography
- Sofia Mendes (Brazil → Peru) — budget backpacker
- Ahmed Hassan (Egypt → Morocco) — cultural, history
- Emma Wilson (UK → Thailand) — budget, beach
- Liam Chen (USA → Europe) — luxury, food
- Fatima Al-Rashid (UAE → Spain) — cultural, art
- Diego Martinez (Mexico → New Zealand) — adventure, eco
- Anna Kowalski (Poland → SE Asia) — solo female travel writer

### Public trips
- Iceland Ring Road Adventure (14 days, accepting members)
- Japan Cherry Blossom Solo Trip (closed)
- Utah National Parks Road Trip (accepting 1 more)
- Bali Remote Work Month (accepting up to 5)
- New York Weekend Food Walk (accepting members)
- Swiss Alps Hiking Week (accepting members)
- Thailand Island Hopping (accepting members)
- Peru Machu Picchu Trek (accepting members)
- Morocco Desert Adventure (full)

### Travel groups
- Iceland Photography Collective
- Bali Digital Nomads
- South America Backpackers
- New Zealand Adventure Seekers
- Luxury Travel Collective
- Solo Female Travelers Asia
- UNESCO World Heritage Chasers

### Activity feed
20 recent items spanning trip_created, group_created, joined_group, memory_added, place_saved events — spread across the last 15 days.

---

## What screens will look populated after seeding

| Screen | What appears |
|---|---|
| Community Feed | 20 activity items from demo travelers |
| Discover Travelers | 10 traveler profile cards |
| Discover Trips | 9 public trip cards with photos and tags |
| Groups | 7 travel groups with member counts |
| Nearby Travelers | 3 travelers in nearby/destination tabs |

---

## Profile photos & trip cover photos

Demo data uses:
- **Avatar photos:** `https://i.pravatar.cc/150?u=demo_user_XX` — free placeholder avatars, reliable
- **Trip covers:** `https://picsum.photos/seed/keyword/600/400` — Lorem Picsum, free photo placeholders

No files are written to Firebase Storage. These are public image URLs only.

---

## Safety checklist

- [ ] `serviceAccountKey.json` is NOT committed to git
- [ ] Script is never imported or called from the mobile app
- [ ] Demo docs have `demo: true` for safe cleanup
- [ ] Security rules are unchanged — no weakening for seeding
- [ ] Cleanup script tested before seeding production-adjacent data
