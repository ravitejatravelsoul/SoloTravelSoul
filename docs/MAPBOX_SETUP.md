# Mapbox Native Setup

Mapbox provides real interactive street maps for the Discover and Trip views.
It requires a native EAS build — it does **not** work in Expo Go.
When tokens are absent or the build is Expo Go, the app falls back to `NativeMapCanvas`.

---

## Tokens you need

| Token | What it is | Where to get it |
|---|---|---|
| **Public token** (`pk.*`) | Read-only, embedded in the JS bundle | Mapbox dashboard → Access Tokens |
| **Downloads token** (`sk.*`) | Secret, used at build time to download the SDK | Mapbox dashboard → Access Tokens → Secret tokens |

The public token is safe to ship in the app.
The downloads token is a build-time secret — it never ships to users.

---

## Step 1 — Get your tokens

1. Sign up at **https://account.mapbox.com**
2. Go to **Access Tokens**
3. Your default public token is shown — copy it (`pk.eyJ1...`)
4. Click **Create a token**, select type **Secret**, grant scope `DOWNLOADS:READ`
5. Copy the secret token (`sk.eyJ1...`) — you only see it once

---

## Step 2 — Local development `.env`

In `apps/mobile/.env`:
```
EXPO_PUBLIC_MAPBOX_ENABLED=true
EXPO_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...YOUR_PUBLIC_TOKEN
```

`MAPBOX_DOWNLOADS_TOKEN` is only needed for EAS Build — do NOT put it in `.env`.

---

## Step 3 — Add EAS environment variables

Run once per environment (development, preview, production):

```bash
cd apps/mobile

# Public token — safe to store as non-secret env var
eas env:create --environment preview    --name EXPO_PUBLIC_MAPBOX_ENABLED --value "true"
eas env:create --environment preview    --name EXPO_PUBLIC_MAPBOX_TOKEN   --value "pk.eyJ1...YOUR_TOKEN"

eas env:create --environment production --name EXPO_PUBLIC_MAPBOX_ENABLED --value "true"
eas env:create --environment production --name EXPO_PUBLIC_MAPBOX_TOKEN   --value "pk.eyJ1...YOUR_TOKEN"

eas env:create --environment development --name EXPO_PUBLIC_MAPBOX_ENABLED --value "true"
eas env:create --environment development --name EXPO_PUBLIC_MAPBOX_TOKEN   --value "pk.eyJ1...YOUR_TOKEN"
```

---

## Step 4 — Add `MAPBOX_DOWNLOADS_TOKEN` as an EAS secret

This is a secret — it cannot be viewed after creation:

```bash
# For each environment:
eas env:create --environment preview    --name MAPBOX_DOWNLOADS_TOKEN --value "sk.eyJ1...YOUR_SECRET" --type secret
eas env:create --environment production --name MAPBOX_DOWNLOADS_TOKEN --value "sk.eyJ1...YOUR_SECRET" --type secret
eas env:create --environment development --name MAPBOX_DOWNLOADS_TOKEN --value "sk.eyJ1...YOUR_SECRET" --type secret
```

Verify:
```bash
eas env:list --environment preview
# Should show: MAPBOX_DOWNLOADS_TOKEN = ***** (secret)
```

---

## Step 5 — Build

```bash
cd apps/mobile

# Development build (installable APK on Android, dev IPA on iOS)
eas build --platform android --profile development
eas build --platform ios    --profile development

# Preview build (internal testing)
eas build --platform android --profile preview
eas build --platform ios    --profile preview

# Production (for store submission)
eas build --platform android --profile production
eas build --platform ios    --profile production
```

---

## How the feature flag works

```typescript
// services/mapboxService.ts
export const canUseMapbox = ENABLED && !!TOKEN && !IS_EXPO_GO;
```

| Condition | Result |
|---|---|
| Expo Go | `canUseMapbox = false` → NativeMapCanvas |
| EAS build, no token | `canUseMapbox = false` → NativeMapCanvas |
| EAS build, ENABLED=false | `canUseMapbox = false` → NativeMapCanvas |
| EAS build, ENABLED=true, TOKEN set | `canUseMapbox = true` → Real Mapbox map |

To disable Mapbox at any time: set `EXPO_PUBLIC_MAPBOX_ENABLED=false`.

---

## How to disable Mapbox (rollback)

```bash
eas env:update --environment production --name EXPO_PUBLIC_MAPBOX_ENABLED --value "false"
```

The app will fall back to `NativeMapCanvas` without a new build.

---

## Map styles

The app uses `mapbox://styles/mapbox/streets-v12`.
You can change it in `DiscoverMapView.tsx` (`DiscoverMapNative`) and
`TripMapView.tsx` (`TripMapNative`).

Other free styles:
- `mapbox://styles/mapbox/outdoors-v12` — hiking-friendly
- `mapbox://styles/mapbox/light-v11` — minimal / data overlay
- `mapbox://styles/mapbox/satellite-streets-v12` — satellite

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Build fails at Gradle | `MAPBOX_DOWNLOADS_TOKEN` missing or wrong scope | Add `DOWNLOADS:READ` scope to the secret token |
| Build fails at CocoaPods | Same as above, iOS side | Same fix |
| Map shows but no tiles | Wrong or restricted public token | Check token restrictions in Mapbox dashboard |
| Map not showing (shows NativeMapCanvas) | `canUseMapbox = false` | Check env vars are set in the correct EAS environment |
| "Token must start with pk" error | Wrong token type | Public token must be `pk.*`, not `sk.*` |
