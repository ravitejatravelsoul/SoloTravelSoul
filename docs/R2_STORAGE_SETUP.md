# Cloudflare R2 Storage Setup

Profile photos are stored in Cloudflare R2 via a Cloudflare Worker. R2 has no egress fees and does not require Firebase Blaze.

---

## Architecture

```
Expo app
  └─ FileSystem.uploadAsync (multipart, Firebase ID token in header)
       └─ Cloudflare Worker  (workers/r2-upload-worker)
            ├─ Verifies Firebase ID token (JWT via Google JWK endpoint)
            ├─ Validates file size ≤ 5 MB and content-type is image/*
            ├─ Writes to R2:  profile_photos/{uid}/avatar.jpg
            └─ Returns JSON:  { photoURL: "https://pub-xxx.r2.dev/profile_photos/..." }
  └─ Saves photoURL to Firestore (users/{uid}, userLookup/{uid}, publicProfiles/{uid})
```

**Security:** R2 keys never leave Cloudflare — the Worker uses a native R2 bucket binding, not S3 API keys. The mobile app only sends a Firebase ID token.

---

## Step 1 — Cloudflare R2 bucket

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com) → select your account
2. Left sidebar → **R2 Object Storage** → **Create bucket**
3. Bucket name: `solotravelsoul-images`
4. Location: leave as default (closest to users)
5. Click **Create bucket**

### Enable public access (r2.dev URL)

1. Open the `solotravelsoul-images` bucket → **Settings** tab
2. Under **Public Access** → click **Allow Access**
3. Copy the **Public R2.dev URL** — it looks like:
   `https://pub-<32-char-hash>.r2.dev`
   Save this — you'll need it as `PUBLIC_R2_BASE_URL`.

---

## Step 2 — Install Wrangler

```bash
npm install -g wrangler
# or inside the workers directory:
cd workers/r2-upload-worker
npm install
```

Authenticate with Cloudflare:

```bash
wrangler login
```

---

## Step 3 — Configure the Worker

### Set the public R2 URL as a secret

```bash
cd workers/r2-upload-worker
wrangler secret put PUBLIC_R2_BASE_URL
# Paste: https://pub-<hash>.r2.dev
```

### Verify wrangler.toml

Open [workers/r2-upload-worker/wrangler.toml](../workers/r2-upload-worker/wrangler.toml) and confirm:
- `bucket_name = "solotravelsoul-images"` matches your R2 bucket
- `FIREBASE_PROJECT_ID = "solotravelsoul-57a9e"` is correct

---

## Step 4 — Local development

```bash
cd workers/r2-upload-worker
npm run dev
```

Wrangler starts the Worker at `http://localhost:8787`. Use this URL temporarily for testing before deploying.

Update `apps/mobile/.env`:
```
EXPO_PUBLIC_STORAGE_PROVIDER=r2
EXPO_PUBLIC_R2_UPLOAD_WORKER_URL=http://localhost:8787
```

> **Note:** Expo Go on a physical device cannot reach `localhost`. Use your machine's local IP:
> ```
> EXPO_PUBLIC_R2_UPLOAD_WORKER_URL=http://192.168.x.x:8787
> ```

---

## Step 5 — Deploy to production

```bash
cd workers/r2-upload-worker
npm run deploy
```

Wrangler outputs the deployed URL:
```
Published solotravelsoul-r2-upload (1.23 sec)
  https://solotravelsoul-r2-upload.<your-subdomain>.workers.dev
```

Update `apps/mobile/.env`:
```
EXPO_PUBLIC_STORAGE_PROVIDER=r2
EXPO_PUBLIC_R2_UPLOAD_WORKER_URL=https://solotravelsoul-r2-upload.<your-subdomain>.workers.dev
```

Restart Metro after changing `.env`:
```bash
# In the Metro terminal, press r to reload
```

---

## Step 6 — Test upload

In Expo Go on iOS/Android:
1. Go to **Profile** → **Edit Profile**
2. The camera badge should be visible and hint should read "Tap to change photo"
3. Tap the avatar → pick a photo
4. Watch Metro logs — expected:

```
[StorageUpload] provider: r2
[StorageUpload] got Firebase ID token
[StorageUpload] calling uploadAsync (MULTIPART → Worker)...
[StorageUpload] Worker response status: 200
[StorageUpload] upload succeeded, photoURL received
[useUpload] upload succeeded
```

5. The avatar updates immediately
6. After tapping **Save**, the photoURL is written to Firestore

---

## Worker environment variables reference

| Variable | Where set | Description |
|---|---|---|
| `R2_BUCKET` | `wrangler.toml` binding | Native R2 bucket — no keys needed |
| `FIREBASE_PROJECT_ID` | `wrangler.toml` vars | Firebase project ID for token verification |
| `PUBLIC_R2_BASE_URL` | `wrangler secret put` | Public r2.dev URL (or custom domain) |

---

## Mobile env vars reference

| Variable | Values | Effect |
|---|---|---|
| `EXPO_PUBLIC_STORAGE_PROVIDER` | `r2` / `firebase` / (empty) | Selects upload backend |
| `EXPO_PUBLIC_R2_UPLOAD_WORKER_URL` | Worker URL | Required when provider=r2 |

---

## Storage provider behavior matrix

| `STORAGE_PROVIDER` | `R2_UPLOAD_WORKER_URL` | Result |
|---|---|---|
| `r2` | set | ✅ R2 upload via Worker |
| `r2` | empty | ⚠️ Disabled ("coming soon") |
| `firebase` | (any) | Firebase Storage (Blaze plan required) |
| (empty) | (any) | Disabled ("coming soon") |

---

## Cost notes

### Cloudflare R2 pricing (as of 2025)
| Resource | Free tier | Beyond free |
|---|---|---|
| Storage | 10 GB/month | $0.015/GB |
| Class A operations (PUT, upload) | 1M/month | $0.0045 per 1,000 |
| Class B operations (GET, read) | 10M/month | $0.0036 per 1,000 |
| Egress (downloads) | **Free** | Free |

For a small app with a few hundred users uploading JPEG avatars (≈300 KB):
- 1,000 uploads/month = ~300 MB storage = **well within the free tier**

### Worker pricing
| Resource | Free tier |
|---|---|
| Requests | 100,000/day |
| CPU time | 10ms/request |

Photo uploads are well within the free tier for thousands of daily users.

---

## Rollback to disabled mode

To disable photo uploads without removing code:

```
# apps/mobile/.env
EXPO_PUBLIC_STORAGE_PROVIDER=
EXPO_PUBLIC_R2_UPLOAD_WORKER_URL=
```

Users will see "Photo uploads coming soon" and the camera badge is hidden. All existing `photoURL` values in Firestore remain visible.

---

## Security notes

- R2 access keys are never sent to or stored in the mobile app
- The Worker uses a native R2 binding (no S3 API keys)
- Every upload requires a valid Firebase ID token (JWT RS256, verified against Google's JWK endpoint)
- Upload path is scoped by `uid` extracted from the verified token — users cannot overwrite each other's photos
- File size is capped at 5 MB server-side in the Worker
- Content-type is validated server-side (must be `image/*`)
- Never commit `wrangler.toml` secrets or Cloudflare API tokens to git

---

## Wrangler commands reference

```bash
# Start local dev server
cd workers/r2-upload-worker && npm run dev

# Deploy to Cloudflare
cd workers/r2-upload-worker && npm run deploy

# Set/update a secret
wrangler secret put PUBLIC_R2_BASE_URL

# List deployed secrets
wrangler secret list

# View live Worker logs
wrangler tail

# Check TypeScript (Worker)
cd workers/r2-upload-worker && npm run type-check
```
