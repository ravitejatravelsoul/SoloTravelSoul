import Constants from 'expo-constants';

const ENABLED = process.env.EXPO_PUBLIC_MAPBOX_ENABLED === 'true';
const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// Triple guard: feature flag + public token + not Expo Go.
// In Expo Go this is always false — NativeMapCanvas renders instead.
// In EAS dev/production builds with tokens set, this is true.
export const canUseMapbox = ENABLED && !!TOKEN && !IS_EXPO_GO;

let _loaded = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mod: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMapboxGL(): any {
  if (_loaded) return _mod;
  _loaded = true;
  if (!canUseMapbox) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _mod = require('@rnmapbox/maps');
    (_mod.default ?? _mod).setAccessToken(TOKEN);
  } catch {
    _mod = null;
  }

  return _mod;
}
