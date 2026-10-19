// Expo config plugin: let MainActivity handle a system text-size change itself.
//
// Expo's Android template declares configChanges "keyboard|keyboardHidden|orientation|screenSize|
// screenLayout|uiMode", without fontScale. Changing Settings > Display > Font size therefore makes
// Android destroy and recreate MainActivity (logcat: wm_relaunch_resume_activity, config 0x40000000)
// while the process, and React Native's process-wide display metrics, live on. On the SM-S711U that
// returned the app to Feed with its draft and navigation gone, and the new activity drew text at the
// new scale inside boxes measured at the old one ("SoloTravelS", "Commu…", clipped descenders).
// Handling fontScale keeps the activity, the JS tree, navigation, drafts and queues in place; React
// Native's own onConfigurationChanged / Dimensions update path runs instead of a relaunch.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const ATTRIBUTE = 'android:configChanges';
const FLAG = 'fontScale';

function addFontScaleConfigChange(androidManifest) {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
  const flags = (activity.$[ATTRIBUTE] || '').split('|').filter(Boolean);
  if (!flags.includes(FLAG)) flags.push(FLAG);
  activity.$[ATTRIBUTE] = flags.join('|');
  return androidManifest;
}

function withFontScaleConfigChange(config) {
  return withAndroidManifest(config, (c) => {
    c.modResults = addFontScaleConfigChange(c.modResults);
    return c;
  });
}

module.exports = withFontScaleConfigChange;
module.exports.default = withFontScaleConfigChange;
module.exports.addFontScaleConfigChange = addFontScaleConfigChange;
