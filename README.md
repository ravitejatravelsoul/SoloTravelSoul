# SoloTravelSoul

A solo and group travel planning app — iOS + Android — built with Expo React Native.

> **Platform:** Windows | **Stack:** Expo · Firebase · TypeScript · Zustand  
> **Cost:** $0/month on free tiers for the entire MVP

---

## Quick Start (Windows)

### 1. Prerequisites (install once)

| Tool | Version | Download |
|------|---------|---------|
| Node.js | 20 LTS | https://nodejs.org |
| Android Studio | Latest | https://developer.android.com/studio |
| Java 17 (JDK) | 17 | https://adoptium.net |

After installing Android Studio, open AVD Manager and create one emulator.

Set environment variables (PowerShell):
```powershell
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
```

### 2. Install EAS CLI and login

```powershell
npm install -g eas-cli
eas login
```

Create a free Expo account at https://expo.dev first.

### 3. Install all dependencies

```powershell
cd C:\Users\ravit\Desktop\SoloTravelSoul
npm install
```

### 4. Set up Firebase environment

```powershell
Copy-Item .env.example apps\mobile\.env.local
```

Edit `apps\mobile\.env.local` with your Firebase values from Firebase Console → Project Settings:

```
EXPO_PUBLIC_FIREBASE_API_KEY=your_value
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_value
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_value
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_value
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_value
EXPO_PUBLIC_FIREBASE_APP_ID=your_value
```

### 5. Deploy Firestore security rules

```powershell
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

### 6. Run on Android

```powershell
cd apps\mobile
npx expo start
# Press 'a' for Android emulator
```

### 7. Build iOS from Windows (no Mac needed — EAS cloud build)

```powershell
cd apps\mobile
eas build --platform ios --profile preview
```

### 8. Build Android APK

```powershell
eas build --platform android --profile preview
```

---

## Project Structure

```
SoloTravelSoul/
├── apps/mobile/                 Expo React Native (iOS + Android)
│   ├── app/(auth)/              Login, signup, onboarding
│   ├── app/(app)/               Tabs: home, trips, discover, groups, profile
│   ├── components/ui/           Button, Card, Input, Screen, Text, Chip, Badge, Toast
│   ├── hooks/                   useAuth, useTrips, useItinerary, useJournal, useProfile
│   ├── stores/                  Zustand: authStore, tripStore, uiStore
│   ├── constants/theme.ts       Colors (from original AppTheme.swift)
│   └── assets/attractions.json  Bundled places (zero API cost)
├── packages/shared/             TypeScript types (ported from Swift models)
├── packages/firebase/           Firebase service layer
├── firestore.rules              Deny-by-default security rules
└── .env.example                 Environment variable template
```

---

## MVP Features (Zero paid API calls)

- Email/password auth + biometric (Face ID / fingerprint)
- User profile with travel preferences, destinations, languages
- Create / edit / delete trips
- Day-by-day itinerary with manual place entry
- Travel journal per day
- In-app notification center
- Bundled attractions browse (local JSON)

## Phase 2

- Foursquare place search (Firestore-cached, 7-day TTL)
- Mapbox map view (50K free loads/month)
- Group trips + real-time group chat
- FCM push notifications

---

## Cost Summary

| Service | Free Limit | Pay after |
|---------|-----------|-----------|
| Firebase Auth | Unlimited | Never |
| Firestore | 50K reads/day | ~500 active users |
| Firebase Storage | 5 GB | ~1000 profile photos |
| EAS Build | 30 builds/month | After 30 builds |

**MVP monthly cost: $0**

---

## Security

- Never commit `.env.local` (already in `.gitignore`)
- All API keys from `process.env.EXPO_PUBLIC_*` only
- Firestore rules deny everything by default
- **Action required:** Rotate the old Google Places API key from the Swift codebase — it was hardcoded and may still be active
