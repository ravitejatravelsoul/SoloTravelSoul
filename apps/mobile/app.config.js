// Evaluated Expo config: app.json, plus a staging variant for EAS `preview` builds.
//
// APP_VARIANT=staging (set only by the `preview` profile in eas.json) gives the
// Android build its own application ID, label and URL scheme, so a staging APK
// installs beside the production app and gets its own EAS signing credentials.
// Without APP_VARIANT (production, development, local tooling) app.json is
// returned unchanged.
const STAGING = {
  name: 'SoloTravelSoul Staging',
  scheme: 'solotravelsoul-staging',
  androidPackage: 'com.solotravelsoul.app.staging',
};

module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'staging') return config;
  return {
    ...config,
    name: STAGING.name,
    scheme: STAGING.scheme,
    android: { ...config.android, package: STAGING.androidPackage },
  };
};

module.exports.STAGING = STAGING;
