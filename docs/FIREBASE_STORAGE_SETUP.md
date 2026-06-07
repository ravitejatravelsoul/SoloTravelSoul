# Firebase Storage Setup

## Why photo uploads fail on Spark plan

Firebase Storage (Cloud Storage for Firebase) was free on the Spark (no-cost) plan until mid-2024. Google then changed this policy:

> **Cloud Storage for Firebase no longer supports Firebase projects on the Spark pricing plan. You must upgrade to the pay-as-you-go Blaze plan to use Firebase Storage.**

When the app tries to upload a profile photo, Firebase Storage returns **HTTP 402 Payment Required** with this message body, which is why uploads fail even though the upload code and security rules are correct.

---

## What works without Blaze

Everything else in SoloTravelSoul runs fine on the Spark plan:

| Feature | Spark | Blaze |
|---|---|---|
| Firebase Auth | ✓ | ✓ |
| Firestore (read/write) | ✓ | ✓ |
| Community profiles, trips, groups | ✓ | ✓ |
| Activity feed | ✓ | ✓ |
| Direct messages | ✓ | ✓ |
| Maps (Leaflet/Mapbox) | ✓ | ✓ |
| **Profile photo upload** | ✗ (402) | ✓ |
| **Trip cover photo upload** | ✗ (402) | ✓ |
| **Journal photo upload** | ✗ (402) | ✓ |

Photo uploads are the only blocked feature.

---

## Cost warning before upgrading

Blaze is pay-as-you-go. Firebase Storage costs:

| Resource | Free tier (Blaze) | Beyond free |
|---|---|---|
| Storage used | 5 GB/month | $0.026/GB |
| Download bandwidth | 1 GB/day | $0.12/GB |
| Upload operations | 50,000/month | $0.05 per 10,000 |

For a small app with a few hundred users and small JPEG avatars (≈300 KB each), the monthly bill is typically **under $1**. Firebase also provides a [spend limit / budget alert](https://console.firebase.google.com/project/_/usage/details) so you are never surprised.

**Recommendation:** Upgrade to Blaze, set a $5 spend alert, and enable Storage.

---

## How to upgrade to Blaze

1. Go to [Firebase Console](https://console.firebase.google.com) → select project `solotravelsoul-57a9e`
2. In the left sidebar, click **Spark** (the plan badge at the bottom)
3. Click **Upgrade** → select **Blaze**
4. Add a billing account (Google Cloud billing, requires a credit card)
5. Set a **budget alert**: Firebase Console → `...` menu → Budget & billing → Set alert at $5/month

---

## How to enable photo uploads in the app

Once your project is on the Blaze plan:

1. Open `apps/mobile/.env`
2. Change:
   ```
   EXPO_PUBLIC_STORAGE_UPLOADS_ENABLED=false
   ```
   to:
   ```
   EXPO_PUBLIC_STORAGE_UPLOADS_ENABLED=true
   ```
3. Restart Expo (`r` to reload in Metro, or restart `npx expo start`)
4. The avatar edit badge and "Tap to change photo" hint will reappear
5. Test a photo upload — you should see these Metro logs:
   ```
   [ImageUtils] resizeImage started...
   [StorageUpload] calling uploadAsync...
   [StorageUpload] uploadAsync status: 200
   [StorageUpload] uploadAsync succeeded
   [StorageUpload] getDownloadURL succeeded
   [useUpload] upload succeeded
   ```

---

## What users see in each mode

### `EXPO_PUBLIC_STORAGE_UPLOADS_ENABLED=false` (default)

- Profile photo circle shows initials or existing photo — unchanged
- Camera edit badge is **hidden**
- "Tap to change photo" hint becomes **"Photo uploads coming soon"**
- Tapping the avatar shows: *"Photo uploads are temporarily disabled."*
- No upload attempt is made at all

### `EXPO_PUBLIC_STORAGE_UPLOADS_ENABLED=true`

- Camera edit badge visible
- "Tap to change photo" hint shown
- Upload proceeds normally
- If Firebase still returns 402 (e.g. Blaze downgraded): shows *"Photo uploads require Firebase Storage to be enabled. This feature will be available soon."*
- Dev console logs: `[StorageUpload] Firebase Storage blocked: project is on Spark/no-cost plan. Upgrade to Blaze to enable photo uploads.`

---

## Demo data and community UI

Demo community profiles (seeded via `scripts/seedCommunityDemo.ts`) use external placeholder photo URLs:
- Avatars: `https://i.pravatar.cc/150?u=demo_user_XX`
- Trip covers: `https://picsum.photos/seed/keyword/600/400`

No Firebase Storage writes are needed for demo data — the community screens look fully populated on Spark plan.

---

## Test checklist

- [ ] Upgraded to Blaze and set $5 budget alert
- [ ] `EXPO_PUBLIC_STORAGE_UPLOADS_ENABLED=true` in `.env`
- [ ] Metro server restarted after `.env` change
- [ ] Avatar upload on iOS Expo Go succeeds (status 200 in logs)
- [ ] Avatar upload on Android Expo Go succeeds
- [ ] Uploaded photo appears in profile screen immediately
- [ ] Photo persists after app restart (Firestore `photoURL` updated)
- [ ] Setting flag back to `false` hides the edit badge and upload flow

---

## Storage security rules

Storage rules are in `storage.rules`. Profile photos are owner-only write:

```
match /profile_photos/{uid}/{fileName} {
  allow read:  if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == uid;
}
```

These rules are correct and do not need to change for photo uploads to work. The 402 error is a billing issue, not a rules issue.
