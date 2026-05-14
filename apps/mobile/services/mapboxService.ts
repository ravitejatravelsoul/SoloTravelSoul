import Constants from 'expo-constants';

const ENABLED = process.env.EXPO_PUBLIC_MAPBOX_ENABLED === 'true';
const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// Triple guard: feature flag + token present + not Expo Go.
// In Expo Go this is always false — MapPlaceholder / TripMapFallback render instead.
export const canUseMapbox = ENABLED && !!TOKEN && !IS_EXPO_GO;

let _loaded = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mod: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMapboxGL(): any {
  if (_loaded) return _mod;
  _loaded = true;
  if (!canUseMapbox) return null;

  // ── EAS dev / production build only ──────────────────────────────────
  // @rnmapbox/maps is NOT installed for Expo Go development.
  // Metro's static bundler would fail to resolve the require if the
  // package is not in node_modules, so it stays commented out here.
  //
  // To enable the real Mapbox map:
  //   1. In apps/mobile:  npm install @rnmapbox/maps@^10.1.0
  //   2. In app.json plugins array: add "@rnmapbox/maps"
  //      (for Android also add MAPBOX_DOWNLOADS_TOKEN to eas.json env)
  //   3. Uncomment the three lines below
  //   4. Set in .env: EXPO_PUBLIC_MAPBOX_ENABLED=true
  //                   EXPO_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...
  //   5. eas build --profile development --platform ios   (or android)
  //   6. Install the dev build on device — do NOT open in Expo Go
  // ─────────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // _mod = require('@rnmapbox/maps');
  // (_mod.default ?? _mod).setAccessToken(TOKEN);

  return _mod; // null until the EAS build steps above are complete
}
