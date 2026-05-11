const REQUIRED_VARS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

// Shows first 4 + last 3 chars so you can verify the right value loaded
// without printing the full secret into Metro logs.
function maskValue(val: string): string {
  if (val.length <= 8) return '***';
  return `${val.slice(0, 4)}...${val.slice(-3)}`;
}

// Called once at app startup. Warns in dev, silently skips in production
// (EAS Build enforces presence of vars at bundle time).
export function validateEnv(): void {
  if (process.env.NODE_ENV !== 'development') return;

  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.warn(
      '\n[SoloTravelSoul] Firebase is not configured — app will boot to login but sign-in will fail.\n' +
      'Missing:\n' +
      missing.map((k) => `  ✗ ${k}`).join('\n') +
      '\n\nFix:\n' +
      '  1. Copy apps/mobile/.env.example → apps/mobile/.env\n' +
      '  2. Firebase Console → Project Settings → Your Apps → Web App → SDK setup → Config\n' +
      '  3. Paste the 6 firebaseConfig values into your .env\n' +
      '  4. Stop Metro and run: npx expo start --clear\n' +
      '\nNote: EXPO_PUBLIC_FIREBASE_API_KEY is the Firebase Web API key,\n' +
      'NOT the Google Places API key.\n'
    );
  } else {
    // All present — log masked values so you can confirm the right .env was loaded.
    console.log(
      '[SoloTravelSoul] Firebase env vars detected:\n' +
      REQUIRED_VARS.map((k) => `  ✓ ${k}: ${maskValue(process.env[k]!)}`).join('\n')
    );
  }

  // Feature flag status — helps confirm which Phase 2 APIs are active.
  const fsqEnabled = process.env.EXPO_PUBLIC_FOURSQUARE_ENABLED === 'true';
  const fsqKeySet = Boolean(process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY);
  console.log(
    '[SoloTravelSoul] Feature flags:\n' +
    `  EXPO_PUBLIC_FOURSQUARE_ENABLED: ${fsqEnabled}\n` +
    `  EXPO_PUBLIC_FOURSQUARE_API_KEY: ${fsqKeySet ? maskValue(process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY!) : '[not set]'}`
  );
}
