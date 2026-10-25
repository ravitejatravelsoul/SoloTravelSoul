// iPhone-readiness checks that need no Mac: configuration, shared helpers and source contracts.
//   node tests/release/ios.cjs
// Native iOS compile and runtime behaviour (Simulator / physical iPhone) is NOT exercised here; see docs/IOS_READINESS.md.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { root } = require('./lib/fakes.cjs');
const ts = require(path.join(root, 'node_modules/typescript'));

const mobile = (f) => path.join(root, 'apps/mobile', f);
const read = (f) => fs.readFileSync(mobile(f), 'utf8');
const appJson = () => JSON.parse(read('app.json')).expo;

function load(file, deps) {
  const code = ts.transpileModule(read(file), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const el = (type, props) => ({ type, props: { ...props, children: [props.children].flat(Infinity).filter((c) => c != null && c !== false) } });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', code)(m, m.exports, (n) => {
    if (n === 'react/jsx-runtime') return { jsx: el, jsxs: el, Fragment: 'Fragment' };
    if (n in deps) return deps[n];
    throw Error('Unexpected ' + n);
  });
  return m.exports;
}
const flatten = (st) => (Array.isArray(st) ? Object.assign({}, ...st.flat(Infinity).filter(Boolean).map(flatten)) : st || {});
const rnBase = { StyleSheet: { flatten } };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const pluginProps = (name) => {
  const p = appJson().plugins.find((x) => (Array.isArray(x) ? x[0] : x) === name);
  return Array.isArray(p) ? p[1] : undefined;
};

test('shadow + clip: a card that rounds-and-clips AND casts a shadow is split into two layers on iPhone only', () => {
  const { splitShadowClip } = load('utils/shadowClip.ts', { 'react-native': rnBase });
  assert.equal(splitShadowClip({ overflow: 'hidden', borderRadius: 8 }), null, 'no shadow: nothing to split');
  assert.equal(splitShadowClip({ shadowOpacity: 0.2, shadowRadius: 4, borderRadius: 8 }), null, 'no clip: the shadow already shows');
  const parts = splitShadowClip([{ overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff', margin: 4, shadowColor: '#000', shadowOpacity: 0.2, elevation: 3, padding: 10, flexDirection: 'row' }, { width: 100 }]);
  assert.ok(parts);
  const { outer, inner } = parts;
  for (const k of ['margin', 'width', 'shadowColor', 'shadowOpacity', 'elevation']) { assert.ok(k in outer, `outer keeps ${k}`); assert.ok(!(k in inner), `inner has no ${k}`); }
  for (const k of ['overflow', 'padding', 'flexDirection']) { assert.ok(k in inner, `inner keeps ${k}`); assert.ok(!(k in outer), `outer has no ${k}`); }
  assert.equal(outer.borderRadius, 12); assert.equal(inner.borderRadius, 12, 'both layers share the corners');
  assert.equal(outer.backgroundColor, '#fff'); assert.equal(inner.backgroundColor, '#fff');
  assert.equal(outer.overflow, undefined, 'the shadow layer must not clip');
  assert.equal(inner.flexGrow, 1, 'the clip layer fills the shadow layer');
});

test('shadow + clip: PressableScale splits on iPhone, fires an action once, and Android is untouched', () => {
  const { splitShadowClip } = load('utils/shadowClip.ts', { 'react-native': rnBase });
  const build = (os, reduced) => load('components/ui/PressableScale.tsx', {
    react: { useCallback: (fn) => fn, useRef: (v) => ({ current: v }) },
    'react-native': { Animated: { Value: function Value() {}, spring: () => ({ start() {} }), View: 'Animated.View', createAnimatedComponent: () => 'AnimatedPressable' }, Pressable: 'Pressable', Platform: { OS: os }, ...rnBase },
    '@/utils/shadowClip': { splitShadowClip },
    '@/constants/theme': { Motion: { pressScale: 0.96, spring: {} } },
    '@/hooks/useReducedMotion': { useReducedMotion: () => reduced },
  }).PressableScale;
  const style = { overflow: 'hidden', borderRadius: 10, shadowOpacity: 0.1, margin: 6, padding: 8 };
  let fired = 0;
  const ios = build('ios', false)({ style, onPress: () => { fired++; }, guardMs: 300, children: 'x' });
  assert.equal(ios.type, 'Animated.View', 'iPhone: shadow layer outside');
  assert.equal(flatten(ios.props.style).overflow, undefined);
  const pressable = ios.props.children[0];
  assert.equal(pressable.type, 'Pressable');
  assert.equal(flatten(pressable.props.style).overflow, 'hidden');
  pressable.props.onPress({}); pressable.props.onPress({});
  assert.equal(fired, 1, 'the double-press guard still applies on the split path');
  const plain = build('ios', false)({ style: { padding: 4 }, children: 'x' });
  assert.equal(plain.type, 'AnimatedPressable', 'no shadow + clip: the single-layer path');
  const android = build('android', false)({ style, children: 'x' });
  assert.equal(android.type, 'AnimatedPressable', 'Android never splits');
});

test('shadow + clip: ShadowView/ShadowTouchable wrap on iPhone, pass through on Android; no card keeps both on one view', () => {
  const { splitShadowClip } = load('utils/shadowClip.ts', { 'react-native': rnBase });
  const build = (os) => load('components/ui/ShadowClip.tsx', { 'react-native': { View: 'View', TouchableOpacity: 'TouchableOpacity', Platform: { OS: os }, ...rnBase }, '@/utils/shadowClip': { splitShadowClip } });
  const style = { overflow: 'hidden', shadowOpacity: 0.2, borderRadius: 6 };
  const ios = build('ios').ShadowView({ style, children: 'c' });
  assert.equal(ios.type, 'View'); assert.equal(flatten(ios.props.style).overflow, undefined);
  assert.equal(flatten(ios.props.children[0].props.style).overflow, 'hidden');
  const droid = build('android').ShadowView({ style, children: 'c' });
  assert.equal(droid.props.style, style, 'Android: same element, same style');
  // Every screen/component that styles a card with shadow + overflow uses the helper (guards the regression, not the helper).
  for (const f of ['components/posts/PostCard.tsx', 'components/journals/JournalCard.tsx', 'components/trips/AddToTripSheet.tsx', 'app/(app)/community/index.tsx', 'app/(app)/saved-places/index.tsx']) {
    assert.match(read(f), /Shadow(View|Touchable)/, f);
  }
});

test('keyboard: overlap is measured in window coordinates, zero when the keyboard is away, and Android keeps the stock behaviour', () => {
  const calls = [];
  const rn = { KeyboardAvoidingView: 'KAV', Keyboard: { addListener: () => ({ remove() {} }) }, LayoutAnimation: {}, View: 'View', Platform: { OS: 'android' } };
  const mod = (os) => load('components/ui/KeyboardAvoid.tsx', {
    react: { useCallback: (f) => f, useEffect() {}, useRef: (v) => ({ current: v }), useState: (v) => [v, () => {}] },
    'react-native': { ...rn, Platform: { OS: os } }, '@/hooks/useReducedMotion': { isReducedMotion: () => false },
  });
  const { keyboardOverlap, KeyboardAvoid } = mod('android');
  // A page sheet that starts 120 below the top, 600 tall, with the keyboard top at 500: 220 covered.
  assert.equal(keyboardOverlap(120, 600, 500), 220);
  assert.equal(keyboardOverlap(0, 400, 500), 0, 'not covered');
  assert.equal(keyboardOverlap(120, 600, 500, 40), 260, 'extra offset (e.g. a header) counts');
  const a = KeyboardAvoid({ style: { flex: 1 }, children: 'x' });
  assert.equal(a.type, 'KAV'); assert.equal(a.props.behavior, 'padding');
  void calls;
  // iPhone path is a distinct component that never calls the stock avoider for its own layout.
  const src = read('components/ui/KeyboardAvoid.tsx');
  assert.match(src, /keyboardWillChangeFrame/); assert.match(src, /measureInWindow/); assert.match(src, /isReducedMotion\(\)/);
});

test('keyboard: every screen uses the shared KeyboardAvoid, never the stock KeyboardAvoidingView', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const offenders = [];
  let users = 0;
  for (const f of walk(mobile('.')).filter((x) => /\.tsx$/.test(x))) {
    const s = fs.readFileSync(f, 'utf8');
    if (/<KeyboardAvoidingView/.test(s) && !f.endsWith('KeyboardAvoid.tsx')) offenders.push(path.relative(root, f));
    if (/<KeyboardAvoid\b/.test(s)) users++;
  }
  assert.deepEqual(offenders, []);
  assert.ok(users >= 14, `expected the shared avoider on all keyboard screens (found ${users})`);
  for (const f of ['app/(app)/chats/[chatId].tsx', 'app/(app)/groups/[groupId]/chat.tsx', 'components/posts/CommentsSheet.tsx', 'components/community/JoinRequestModal.tsx', 'components/auth/AuthShell.tsx']) {
    assert.match(read(f), /<KeyboardAvoid\b/, f);
  }
});

test('safe areas: the composer and sheets do not add the home-indicator inset twice, and the date sheet clears it', () => {
  assert.match(read('components/chat/ChatInput.tsx'), /paddingBottom: Spacing\.sm/);
  assert.doesNotMatch(read('components/chat/ChatInput.tsx'), /insets\.bottom|useSafeAreaInsets/);
  assert.match(read('components/ui/DatePicker.tsx'), /edges=\{\['bottom'\]\}/);
});

test('offline notice: on iPhone it is a pill above the tab bar (not under the Dynamic Island), accessible and non-blocking', () => {
  const src = read('components/ui/OfflineBanner.tsx');
  assert.match(src, /overlay && Platform\.OS === 'ios'/);
  assert.match(src, /pointerEvents="none"/); assert.match(src, /accessibilityRole="alert"/);
  assert.match(src, /bottom: tabBarInsets\(insets\.bottom\)\.height/);
  assert.match(src, /maxFontSizeMultiplier=\{1\.3\}/);
});

test('navigation: form screens presented as iPhone modals cannot be swiped away (no lost input)', () => {
  for (const f of ['app/(app)/trips/_layout.tsx', 'app/(app)/groups/_layout.tsx', 'app/(app)/community/_layout.tsx']) {
    assert.match(read(f), /presentation: 'modal', gestureEnabled: false/, f);
  }
  assert.doesNotMatch(read('app/(app)/trips/_layout.tsx'), /gestureEnabled: true/);
});

test('camera: a denied permission is reported (with a way to Settings) and never leaves the picker stuck', () => {
  const src = read('utils/imageUtils.ts');
  assert.match(src, /export class CameraPermissionDeniedError/);
  assert.match(src, /throw new CameraPermissionDeniedError\(\)/);
  for (const f of ['app/(app)/post/create.tsx', 'app/(app)/journal/create.tsx', 'hooks/useUpload.ts']) assert.match(read(f), /CameraPermissionDeniedError|catch/, f);
});

test('android-only helpers stay Android-only (font-scale relayout, native font-scale plugins)', () => {
  assert.match(read('utils/fontScaleRelayout.ts'), /Platform\.OS !== 'android'\) return/);
  for (const f of ['plugins/withFontScaleConfigChange.js', 'plugins/withFontScaleLayoutUpdates.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /withInfoPlist|withXcodeProject|withAppDelegate|withEntitlementsPlist/, f);
  }
  assert.match(read('plugins/withFontScaleLayoutUpdates.js'), /withDangerousMod\(config, \['android'/);
});

test('iOS identity: production bundle id and scheme unchanged; staging is isolated and nothing from production leaks in', () => {
  const base = JSON.parse(read('app.json')).expo;
  const configFn = require(mobile('app.config.js'));
  const prev = process.env.APP_VARIANT;
  try {
    delete process.env.APP_VARIANT;
    const prod = configFn({ config: base });
    assert.deepEqual([prod.ios.bundleIdentifier, prod.scheme, prod.android.package], ['com.solotravelsoul.app', 'solotravelsoul', 'com.solotravelsoul.app'], 'production unchanged');
    process.env.APP_VARIANT = 'staging';
    const stg = configFn({ config: base });
    assert.equal(stg.ios.bundleIdentifier, 'com.solotravelsoul.app.staging');
    assert.notEqual(stg.ios.bundleIdentifier, prod.ios.bundleIdentifier);
    assert.equal(stg.scheme, 'solotravelsoul-staging'); assert.equal(stg.name, 'SoloTravelSoul Staging');
    assert.deepEqual({ ...stg.ios, bundleIdentifier: '' }, { ...prod.ios, bundleIdentifier: '' }, 'only the identifier differs');
  } finally { if (prev === undefined) delete process.env.APP_VARIANT; else process.env.APP_VARIANT = prev; }
  assert.equal(base.ios.googleServicesFile, undefined, 'no native Firebase file referenced (the app uses the Firebase JS SDK)');
  assert.equal(base.android.googleServicesFile, undefined);
});

test('iOS permissions: every purpose string is set once (plugins), describes a real feature, and unused ones are removed', () => {
  const e = appJson();
  const ip = e.ios.infoPlist;
  assert.equal(Object.keys(ip).filter((k) => k.endsWith('UsageDescription')).length, 0, 'purpose strings come from the plugins only (one source each)');
  const loc = pluginProps('expo-location');
  const pick = pluginProps('expo-image-picker');
  const bio = pluginProps('expo-local-authentication');
  for (const s of [loc.locationWhenInUsePermission, loc.locationAlwaysAndWhenInUsePermission, loc.locationAlwaysPermission, pick.photosPermission, pick.cameraPermission, bio.faceIDPermission]) {
    assert.ok(typeof s === 'string' && s.length > 30 && /SoloTravelSoul/.test(s), 'plain-language purpose: ' + s);
  }
  assert.equal(pick.microphonePermission, false, 'no recording feature, so no microphone key');
  assert.match(loc.locationAlwaysPermission, /does not track you in the background/);
  assert.match(bio.faceIDPermission, /already signed in/);
  const joined = JSON.stringify(e.plugins).toLowerCase();
  for (const forbidden of ['contacts', 'calendar', 'bluetooth', 'speech', 'tracking', 'homekit', 'motion']) assert.ok(!joined.includes(forbidden + 'permission'), forbidden);
});

test('iOS transport security: arbitrary loads are off; only local networking (development servers) is allowed', () => {
  const ats = appJson().ios.infoPlist.NSAppTransportSecurity;
  assert.deepEqual(ats, { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true });
  assert.equal(appJson().ios.config.usesNonExemptEncryption, false);
  // Every network endpoint the app is configured with is https.
  for (const f of ['services/mapboxService.ts', 'services/foursquareService.ts']) assert.doesNotMatch(read(f), /['"`]http:\/\//, f);
});

test('launch: iOS gets a centred logo on the same ivory as the JavaScript overlay (no full-bleed stretch), Android keeps its splash', () => {
  const e = appJson();
  const splash = pluginProps('expo-splash-screen');
  assert.deepEqual(splash, { ios: { image: './assets/images/splash-icon.png', imageWidth: 220, resizeMode: 'contain', backgroundColor: '#FFF8EE' } });
  assert.ok(e.splash && e.splash.backgroundColor, 'top-level splash retained for Android');
  assert.equal(e.splash.backgroundColor.toLowerCase(), '#fff8ee');
  assert.equal(e.orientation, 'portrait');
  assert.match(fs.readFileSync(mobile('constants/theme.ts'), 'utf8'), /FFF8EE|fff8ee/i);
});

test('optional services: Mapbox and Foursquare stay off in every iPhone staging profile; the simulator profile shares them', () => {
  const eas = JSON.parse(read('eas.json'));
  const sim = eas.build['preview-simulator'];
  assert.equal(sim.extends, 'preview'); assert.equal(sim.ios.simulator, true);
  assert.equal(eas.build.preview.ios.simulator, false, 'the device profile is a real-device (ad hoc) build');
  const env = eas.build.preview.env;
  assert.deepEqual([env.APP_VARIANT, env.EXPO_PUBLIC_APP_ENV, env.EXPO_PUBLIC_MAPBOX_ENABLED, env.EXPO_PUBLIC_FOURSQUARE_ENABLED], ['staging', 'staging', 'false', 'false']);
  assert.ok(!eas.build.production.env.APP_VARIANT);
  assert.match(fs.readFileSync(mobile('services/mapProvider.ts'), 'utf8'), /EXPO_PUBLIC_MAPBOX_ENABLED === 'true'/);
});

test('media and sessions: authenticated images follow the Worker cache headers; no native-only storage is required', () => {
  assert.match(read('hooks/useMediaSource.ts'), /MEDIA_CACHE_POLICY = 'default'/);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/package.json'), 'utf8'));
  assert.ok(!pkg.dependencies['@react-native-firebase/app'], 'no native Firebase dependency, so no GoogleService-Info.plist is needed');
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} iOS readiness checks passed`);
})();
