import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';

// ── Environment variable validation ───────────────────────────────────
// All values come from EXPO_PUBLIC_ vars in apps/mobile/.env
// These are bundled at build time — never hardcode here.
const REQUIRED_ENV_VARS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

if (missing.length > 0) {
  // Print a clear, actionable error in dev so the developer knows exactly what to do.
  console.error(
    '\n🔴 [SoloTravelSoul] Firebase is not configured.\n' +
    'Missing environment variables:\n' +
    missing.map((k) => `  • ${k}`).join('\n') + '\n\n' +
    'Fix:\n' +
    '  1. Go to Firebase Console → Project Settings → Your Apps → Web app\n' +
    '  2. Copy the firebaseConfig values\n' +
    '  3. Create apps/mobile/.env and fill in the values\n' +
    '  4. Stop Metro and run: npx expo start --clear\n' +
    '\nThe EXPO_PUBLIC_FIREBASE_API_KEY is the Firebase Web API key,\n' +
    'NOT the Google Places API key.\n'
  );
}

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            ?? '',
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? '',
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         ?? '',
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             ?? '',
};

// Guard against double-init on fast refresh.
function getFirebaseApp(): FirebaseApp {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

export const app = getFirebaseApp();

// Expose whether the app is misconfigured so auth/firestore can surface
// friendlier errors instead of cryptic Firebase SDK messages.
export const isFirebaseConfigured = missing.length === 0;
