// App-side media and deletion client checks (no device needed).
//   node tests/release/app.cjs
// Native image-cache behaviour itself (iOS NSURLCache / Android Fresco) is not
// exercised here: that needs a device build and is listed as a native blocker.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const { root, transpile } = require('./lib/fakes.cjs');

const WORKER = 'https://worker.test';
function mobile(file, deps, env = { EXPO_PUBLIC_R2_UPLOAD_WORKER_URL: `${WORKER}/` }) {
  const m = { exports: {} };
  vm.runInNewContext(transpile(path.join(root, file)), {
    module: m, exports: m.exports, console: { error() {}, log() {} },
    process: { env }, Promise, Error, Object, JSON, Set, Map, Array, String, Number, __DEV__: false,
    fetch: (...a) => global.fetch(...a),
    require: (n) => { if (n in deps) return deps[n]; throw Error('Unexpected ' + n); },
  }, { filename: file });
  return m.exports;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const authStore = (token) => ({ useAuthStore: (sel) => sel({ idToken: token }) });
const react = { useCallback: (fn) => fn };

test('media sources: worker media carries the ID token and the default (header-driven) cache policy; others pass through', () => {
  const m = mobile('apps/mobile/hooks/useMediaSource.ts', { react, 'react-native': {}, '@/stores/authStore': authStore('tok') });
  assert.equal(m.MEDIA_CACHE_POLICY, 'default', "iOS follows the Worker's Cache-Control (private, max-age=300 | no-store)");
  const id = 'a'.repeat(32);
  assert.deepEqual(JSON.parse(JSON.stringify(m.mediaSource(`${WORKER}/media/${id}`, 'tok', `${WORKER}/`))),
    { uri: `${WORKER}/media/${id}`, headers: { Authorization: 'Bearer tok' }, cache: 'default' });
  assert.deepEqual(JSON.parse(JSON.stringify(m.mediaSource(`${WORKER}/media/${id}`, null, WORKER))), { uri: `${WORKER}/media/${id}`, cache: 'default' }, 'signed out: no header, Worker answers 401');
  for (const other of ['file:///tmp/x.jpg', 'https://pub.r2.dev/post_photos/u/x.jpg', 'https://evil.test/media/' + id, `${WORKER}/upload/x`]) {
    assert.deepEqual(JSON.parse(JSON.stringify(m.mediaSource(other, 'tok', WORKER))), { uri: other }, `token never sent to ${other}`);
  }
  assert.equal(m.isWorkerMediaUrl(`${WORKER}/media/${id}`, ''), false, 'no worker configured: nothing is treated as worker media');
  const hook = m.useMediaSource();
  assert.equal(hook(`${WORKER}/media/${id}`).headers.Authorization, 'Bearer tok');
});

test('stored staging media URLs keep authenticating; the Firebase token is never attached to any other URL', () => {
  const STAGING = 'https://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev';
  const m = mobile('apps/mobile/hooks/useMediaSource.ts', { react, 'react-native': {}, '@/stores/authStore': authStore('tok') }, { EXPO_PUBLIC_R2_UPLOAD_WORKER_URL: STAGING });
  const id = '0123456789abcdef0123456789abcdef';
  // URLs already stored in Firestore by the staging Worker (same canonical origin after consolidation).
  for (const base of [STAGING, `${STAGING}/`]) {
    const src = JSON.parse(JSON.stringify(m.mediaSource(`${STAGING}/media/${id}`, 'tok', base)));
    assert.deepEqual(src, { uri: `${STAGING}/media/${id}`, headers: { Authorization: 'Bearer tok' }, cache: 'default' }, base);
  }
  const hook = m.useMediaSource();
  assert.equal(hook(`${STAGING}/media/${id}`).headers.Authorization, 'Bearer tok');
  for (const other of [
    `http://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev/media/${id}`, // downgraded scheme
    `https://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev.evil.test/media/${id}`, // look-alike host
    `https://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev@evil.test/media/${id}`, // userinfo trick
    `https://solotravelsoul-api-do-staging.ravitejatravelsoul.workers.dev/media/${id}`, // retired proof host
    `https://solotravelsoul-r2-upload.ravitejatravelsoul.workers.dev/media/${id}`, // production host
    `${STAGING}/upload/post-photo`, `${STAGING}/mediafoo/${id}`, 'https://pub-abc.r2.dev/post_photos/u/x.jpg',
    'https://firebasestorage.googleapis.com/v0/b/x/o/y', 'file:///data/x.jpg', '',
  ]) {
    assert.deepEqual(JSON.parse(JSON.stringify(m.mediaSource(other, 'tok', STAGING))), { uri: other }, `no token for ${other}`);
  }
  // The Worker accepts only its own canonical origin and 32-hex IDs.
  const { worker } = require('./lib/fakes.cjs');
  const media = worker('media');
  assert.equal(media.mediaIdFromUrl(STAGING, `${STAGING}/media/${id}`), id);
  assert.equal(media.mediaIdFromUrl(`${STAGING}/`, `${STAGING}/media/${id}`), id);
  assert.equal(media.mediaIdFromUrl(STAGING, `https://evil.test/media/${id}`), null);
  assert.equal(media.mediaIdFromUrl(STAGING, `${STAGING}/media/../admin`), null);
  // The repo's staging config: one canonical origin for media URLs and the Worker host.
  const toml = fs.readFileSync(path.join(root, 'workers/r2-upload-worker/wrangler.toml'), 'utf8');
  assert.match(toml, new RegExp(`MEDIA_PUBLIC_ORIGIN = "${STAGING.replace(/[.]/g, '\\.')}"`));
});

test('Android preview configuration: staging profile, no native Firebase files, Mapbox/Foursquare optional, restricted permissions blocked', () => {
  const { spawnSync } = require('child_process');
  const app = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/app.json'), 'utf8')).expo;
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/eas.json'), 'utf8'));
  const preview = eas.build.preview;
  assert.deepEqual([preview.distribution, preview.android.buildType, preview.environment, preview.env.EXPO_PUBLIC_APP_ENV], ['internal', 'apk', 'preview', 'staging']);
  assert.ok(!app.android.googleServicesFile && !app.ios.googleServicesFile, 'no native Firebase files are consumed');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/package.json'), 'utf8'));
  assert.ok(!Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => d.startsWith('@react-native-firebase/')), 'no native Firebase SDK');
  // @rnmapbox/maps: no token option in app config (the Maven repo needs none; a token, if ever
  // needed, comes from the RNMAPBOX_MAPS_DOWNLOAD_TOKEN build secret, never from app.json).
  const mapbox = app.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === '@rnmapbox/maps');
  assert.equal(mapbox, '@rnmapbox/maps');
  assert.ok(!/MAPBOX_DOWNLOADS_TOKEN|DownloadsToken|DownloadToken/.test(fs.readFileSync(path.join(root, 'apps/mobile/app.json'), 'utf8')));
  for (const p of ['SYSTEM_ALERT_WINDOW', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM', 'RECORD_AUDIO']) {
    assert.ok(app.android.blockedPermissions.includes(`android.permission.${p}`), `${p} blocked`);
  }
  // Optional features stay off without their keys.
  for (const [file, flag] of [['apps/mobile/services/mapProvider.ts', "EXPO_PUBLIC_MAPBOX_ENABLED === 'true'"], ['apps/mobile/services/foursquareService.ts', "EXPO_PUBLIC_FOURSQUARE_ENABLED === 'true'"]]) {
    assert.ok(fs.readFileSync(path.join(root, file), 'utf8').includes(flag), `${file} gated by ${flag}`);
  }
  // Preview builds use the staging variant; Mapbox and Foursquare stay disabled.
  assert.deepEqual([preview.env.APP_VARIANT, preview.env.EXPO_PUBLIC_MAPBOX_ENABLED, preview.env.EXPO_PUBLIC_FOURSQUARE_ENABLED], ['staging', 'false', 'false']);
  assert.ok(!eas.build.production.env || !eas.build.production.env.APP_VARIANT, 'production profile has no variant');
  // Evaluated configs (app.config.js over app.json): staging variant vs production.
  const evaluate = (type, variant) => {
    const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['expo', 'config', '--type', type, '--json'], {
      cwd: path.join(root, 'apps/mobile'), encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, APP_VARIANT: variant ?? '' },
    });
    assert.equal(r.status, 0, `expo config --type ${type}`);
    return JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  };
  const prod = evaluate('public');
  assert.deepEqual([prod.name, prod.scheme, prod.android.package, prod.ios.bundleIdentifier], ['SoloTravelSoul', 'solotravelsoul', 'com.solotravelsoul.app', 'com.solotravelsoul.app'], 'production identifiers unchanged');
  const stg = evaluate('public', 'staging');
  assert.deepEqual([stg.name, stg.scheme, stg.android.package, stg.ios.bundleIdentifier], ['SoloTravelSoul Staging', 'solotravelsoul-staging', 'com.solotravelsoul.app.staging', 'com.solotravelsoul.app']);
  assert.equal(stg.extra.eas.projectId, prod.extra.eas.projectId, 'same EAS project');
  // Evaluated native config (Expo prebuild introspection; no SDK needed) for the staging build.
  const c = evaluate('introspect', 'staging');
  const perms = c._internal.modResults.android.manifest.manifest['uses-permission'].map((x) => [x.$['android:name'], x.$['tools:node'] ?? '']);
  const active = perms.filter(([, t]) => t !== 'remove').map(([n]) => n.replace('android.permission.', '')).sort();
  assert.deepEqual(active, ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'INTERNET', 'POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED', 'USE_BIOMETRIC', 'USE_FINGERPRINT', 'VIBRATE'], 'merged manifest permissions');
  assert.ok(!(c._internal.modResults.android.gradleProperties || []).some((x) => x.key === 'MAPBOX_DOWNLOADS_TOKEN'), 'no Mapbox token in gradle.properties');
  assert.equal(c.android.package, 'com.solotravelsoul.app.staging');
});

test('media cache policy is documented truthfully: no recall of already downloaded images', () => {
  const src = fs.readFileSync(path.join(root, 'apps/mobile/hooks/useMediaSource.ts'), 'utf8');
  assert.match(src, /cannot recall copies a device has already downloaded/);
  assert.ok(!/'reload'|'force-cache'|'only-if-cached'/.test(src));
});

test('every remote image in the app goes through the media source helper', () => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.tsx')) files.push(p); } };
  walk(path.join(root, 'apps/mobile/app')); walk(path.join(root, 'apps/mobile/components'));
  const localPreviews = new Set(['journal/create.tsx', 'post/create.tsx']); // just-picked local files
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const line of src.split('\n').filter((l) => /<Image\b|source=\{/.test(l) && /uri/.test(l))) {
      const rel = path.relative(path.join(root, 'apps/mobile/app/(app)'), f).replace(/\\/g, '/');
      if (localPreviews.has(rel)) continue;
      assert.ok(/mediaSrc\(/.test(line), `${path.relative(root, f)}: ${line.trim()}`);
    }
  }
});

test('uploads go to POST <worker>/media/upload with purpose and token; Firebase Storage is not used', async () => {
  const calls = [];
  let status = 200;
  const m = mobile('apps/mobile/utils/storageUpload.ts', {
    'expo-file-system/legacy': { FileSystemUploadType: { MULTIPART: 1 }, uploadAsync: async (url, uri, opts) => { calls.push({ url, uri, opts }); return { status, body: JSON.stringify({ photoURL: `${WORKER}/media/${'b'.repeat(32)}` }) }; } },
    'firebase/auth': { getIdToken: async () => 'id-token' },
    '@solotravelsoul/firebase': { auth: { currentUser: { uid: 'u' } } },
  });
  assert.equal(await m.uploadPostPhotoFromUri('u', 'file:///a.jpg', 'journal'), `${WORKER}/media/${'b'.repeat(32)}`);
  assert.equal(await m.uploadProfilePhotoFromUri('u', 'file:///p.jpg'), `${WORKER}/media/${'b'.repeat(32)}`);
  assert.deepEqual(calls.map((c) => [c.url, c.opts.parameters.purpose, c.opts.headers.Authorization, c.opts.fieldName]),
    [[`${WORKER}/media/upload`, 'journal', 'Bearer id-token', 'file'], [`${WORKER}/media/upload`, 'profile', 'Bearer id-token', 'file']]);
  for (const [s, code] of [[413, 'upload/too-large'], [403, 'auth/expired'], [415, 'upload/unsupported-type'], [503, 'upload/server-error']]) {
    status = s;
    await assert.rejects(m.uploadMediaFromUri('file:///a.jpg', 'post'), (e) => e.code === code);
  }
  const off = mobile('apps/mobile/utils/storageUpload.ts', { 'expo-file-system/legacy': {}, 'firebase/auth': {}, '@solotravelsoul/firebase': {} }, {});
  assert.equal(off.isUploadsEnabled(), false);
  await assert.rejects(off.uploadMediaFromUri('file:///a.jpg', 'post'), (e) => e.code === 'upload/disabled');
  // No active Firebase Storage upload path remains.
  assert.ok(!fs.existsSync(path.join(root, 'packages/firebase/src/storage.ts')));
  const grepRoots = ['apps/mobile/app', 'apps/mobile/components', 'apps/mobile/utils', 'apps/mobile/hooks', 'apps/mobile/stores', 'packages/firebase/src', 'packages/firebase/index.ts'];
  const hits = [];
  const scan = (p) => { const st = fs.statSync(p); if (st.isDirectory()) { for (const e of fs.readdirSync(p)) scan(path.join(p, e)); } else if (/\.(ts|tsx)$/.test(p) && /from ['"]firebase\/storage['"]|require\(['"]firebase\/storage['"]\)|uploadBytes(Resumable)?\(|getDownloadURL\(|getStorage\(/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(root, p)); };
  for (const r of grepRoots) scan(path.join(root, r));
  assert.deepEqual(hits, []);
});

test('deletion client: continues on 202 with the same token, reports progress, stops after the slice cap', async () => {
  const responses = [];
  const seen = [];
  global.fetch = async (url, init) => { seen.push([url, init.headers.Authorization]); return responses.shift(); };
  const reply = (status, body) => new Response(JSON.stringify(body), { status });
  let tokens = 0;
  const m = mobile('apps/mobile/utils/accountDeletion.ts', {
    '@react-native-async-storage/async-storage': {}, 'expo-notifications': {},
    '@solotravelsoul/firebase': { getFreshIdToken: async () => `fresh-${++tokens}` },
  });
  responses.push(reply(202, { status: 'in_progress', completedSteps: 4, totalSteps: 24 }), reply(202, { status: 'in_progress', completedSteps: 20, totalSteps: 24 }), reply(200, { status: 'deleted' }));
  const progress = [];
  assert.equal(await m.requestAccountDeletion((p) => progress.push(p)), 'deleted');
  assert.deepEqual(progress.map((p) => [p.completedSteps, p.totalSteps]), [[4, 24], [20, 24]]);
  assert.equal(tokens, 1, 'one fresh token (recent login) for the whole sequence');
  assert.deepEqual(seen.map((s) => s[1]), Array(3).fill('Bearer fresh-1'));
  assert.ok(seen.every((s) => s[0] === `${WORKER}/account/delete`));

  seen.length = 0;
  for (let i = 0; i < m.MAX_DELETION_SLICES; i++) responses.push(reply(202, { completedSteps: 1, totalSteps: 24 }));
  assert.equal(await m.requestAccountDeletion(), 'in_progress', 'server cron finishes the rest');
  assert.equal(seen.length, m.MAX_DELETION_SLICES);

  // Blocked (legacy media unverifiable): stop continuing at once and report it truthfully.
  seen.length = 0;
  responses.push(reply(202, { status: 'in_progress', completedSteps: 20, totalSteps: 24 }), reply(202, { status: 'blocked', step: 'firebaseMedia', reason: 'legacy-media-inaccessible', completedSteps: 23, totalSteps: 24 }), reply(200, { status: 'deleted' }));
  assert.equal(await m.requestAccountDeletion(), 'blocked');
  assert.equal(seen.length, 2, 'no further continuation requests while blocked');
  responses.length = 0;

  responses.push(reply(401, { code: 'auth/requires-recent-login', error: 'x' }));
  await assert.rejects(m.requestAccountDeletion(), (e) => e.code === 'auth/requires-recent-login');
});

test('in-progress deletion keeps the user informed and the account locked (no local wipe claimed)', () => {
  const src = fs.readFileSync(path.join(root, 'apps/mobile/hooks/useAuth.ts'), 'utf8');
  assert.match(src, /continues automatically/);
  assert.match(src, /outcome === 'blocked'/, 'blocked deletions are reported as such');
  assert.match(src, /stays locked and is removed automatically once they are deleted/);
  assert.ok(!/blocked'[\s\S]{0,40}'Your account has been deleted/.test(src), 'a blocked deletion is never announced as deleted');
});

test('upload refused for a suspended/deleting account says so instead of asking to sign in again', async () => {
  let reply = { status: 403, body: JSON.stringify({ error: 'This account cannot upload.', code: 'account/restricted' }) };
  const m = mobile('apps/mobile/utils/storageUpload.ts', {
    'expo-file-system/legacy': { FileSystemUploadType: { MULTIPART: 1 }, uploadAsync: async () => reply },
    'firebase/auth': { getIdToken: async () => 'id-token' },
    '@solotravelsoul/firebase': { auth: { currentUser: { uid: 'u' } } },
  });
  await assert.rejects(m.uploadMediaFromUri('file:///a.jpg', 'post'), (e) => e.code === 'account/restricted' && !/sign in/i.test(e.message));
  reply = { status: 403, body: JSON.stringify({ error: 'Authentication failed' }) };
  await assert.rejects(m.uploadMediaFromUri('file:///a.jpg', 'post'), (e) => e.code === 'auth/expired');
});

test('tab bar sits above the system navigation: height and padding follow the real bottom inset (SM-S711U, 2026-10-18)', () => {
  const { tabBarInsets } = mobile('apps/mobile/utils/tabBar.ts', {});
  // React Navigation's own height rule (its source, other imports stubbed): a numeric style
  // height replaces the inset-aware height, so ours must include the inset.
  const getTabBarHeight = (() => {
    const ts = require(path.join(root, 'node_modules/typescript'));
    const file = path.join(root, 'node_modules/@react-navigation/bottom-tabs/src/views/BottomTabBar.tsx');
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    const stub = new Proxy(function stub() { return stub; }, { get: (t, k) => (k === '__esModule' ? false : k === Symbol.toPrimitive ? () => '' : stub), apply: () => stub, construct: () => stub });
    const rn = { StyleSheet: { flatten: (st) => (Array.isArray(st) ? Object.assign({}, ...st.flat(Infinity).filter(Boolean)) : st || {}), create: (o) => o, hairlineWidth: 1 }, Platform: { OS: 'android', select: (o) => o.android ?? o.default } };
    const m = { exports: {} };
    new Function('module', 'exports', 'require', code)(m, m.exports, (n) => (n === 'react-native' ? new Proxy(rn, { get: (t, k) => (k in t ? t[k] : stub) }) : stub));
    return m.exports.getTabBarHeight;
  })();
  const state = { index: 0, routes: [{ key: 'a' }] };
  const descriptors = { a: { options: { tabBarPosition: 'bottom' } } };
  const modes = { 'no inset (older Android, web)': 0, 'Android gesture navigation': 24, 'iPhone home indicator': 34, 'Android three-button navigation': 48 };
  const content = [];
  for (const [mode, bottom] of Object.entries(modes)) {
    const style = tabBarInsets(bottom);
    const height = getTabBarHeight({ state, descriptors, dimensions: { width: 412, height: 915 }, insets: { top: 0, bottom, left: 0, right: 0 }, style });
    assert.equal(height, style.height, mode);
    // The system area is fully below the tab content: no overlap.
    assert.ok(style.paddingBottom >= bottom, `${mode}: padding ${style.paddingBottom} < inset ${bottom}`);
    // No double padding: never inset + extra spacing once a system inset exists.
    assert.equal(style.paddingBottom, Math.max(bottom, 8), mode);
    content.push(height - style.paddingTop - style.paddingBottom);
  }
  assert.equal(new Set(content).size, 1, 'icons and labels keep the same usable height in every mode');
  assert.equal(tabBarInsets(0).height, 72, 'unchanged where there is no system inset');
  const layout = fs.readFileSync(path.join(root, 'apps/mobile/app/(app)/_layout.tsx'), 'utf8');
  assert.match(layout, /const insets = useSafeAreaInsets\(\);/);
  assert.match(layout, /\.\.\.tabBarInsets\(insets\.bottom\)/);
  assert.doesNotMatch(layout, /height: 72,|paddingBottom: 8,/, 'no fixed height/padding that hides the inset');
  assert.match(layout, /tabBarHideOnKeyboard: true/);
});

// Renders a .tsx component to a plain element tree (React stubbed; no native layout engine).
function component(file, deps) {
  const ts = require(path.join(root, 'node_modules/typescript'));
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const el = (type, props) => ({ type, props: { ...props, children: [props.children].flat(Infinity).filter((c) => c != null && c !== false) } });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', code)(m, m.exports, (n) => {
    if (n === 'react/jsx-runtime') return { jsx: el, jsxs: el, Fragment: 'Fragment' };
    if (n in deps) return deps[n];
    if (n === 'react') return { memo: (f) => f };
    throw Error('Unexpected ' + n);
  });
  return m.exports;
}
const flat = (st) => (Array.isArray(st) ? Object.assign({}, ...st.flat(Infinity).filter(Boolean).map(flat)) : st || {});
const nodes = (el, out = []) => { if (el && typeof el === 'object' && el.props) { out.push(el); for (const c of el.props.children || []) nodes(c, out); } return out; };
const textOf = (el) => (typeof el === 'string' || typeof el === 'number' ? String(el) : el && el.props ? (el.props.children || []).map(textOf).join('') : '');
const rnStub = { StyleSheet: { create: (o) => o }, Text: 'Text', View: 'View', TouchableOpacity: 'TouchableOpacity', Image: 'Image' };
// Conservative advance for a 600-weight label in a wide system font (SamsungOne): 0.6 em per glyph.
const estWidth = (s, fontSize) => s.length * 0.6 * fontSize;

test('tab labels stay whole and readable at default and enlarged text on a 384 dp phone (SM-S711U "Communi…", 2026-10-18)', () => {
  // Hook state across renders, driven by the label's own layout callbacks.
  const slots = []; let i = 0;
  const react = { useState: (init) => { const k = i++; if (!(k in slots)) slots[k] = init; return [slots[k], (v) => { slots[k] = v; }]; } };
  const mod = component('apps/mobile/components/ui/TabLabel.tsx', { react, 'react-native': rnStub });
  const { TabLabel, fitScale, TAB_LABEL_MIN_SCALE, TAB_LABEL_MAX_FONT_MULTIPLIER, TAB_LABEL_FIT_MARGIN } = mod;
  const render = () => { i = 0; return TabLabel({ color: '#123456', children: 'Community' }); };
  let box = render();
  const [measure, visible] = box.props.children;
  assert.equal(box.props.pointerEvents, 'none', 'the tab button keeps every touch');
  assert.equal(flat(measure.props.style).opacity, 0); assert.equal(measure.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(measure.props.numberOfLines, undefined, 'the measuring copy is unconstrained');
  assert.equal(visible.props.numberOfLines, 1);
  for (const t of [measure, visible]) {
    assert.notEqual(t.props.allowFontScaling, false, 'follows the system text size (no opt-out)');
    assert.equal(t.props.maxFontSizeMultiplier, TAB_LABEL_MAX_FONT_MULTIPLIER, 'same growth cap for both copies');
  }
  assert.ok(TAB_LABEL_MAX_FONT_MULTIPLIER >= 1.3 && TAB_LABEL_MIN_SCALE >= 0.65);
  assert.ok(TAB_LABEL_FIT_MARGIN >= 1, 'slack for whole-pixel font rounding (an exact fit still ellipsised on Android)');
  assert.equal(flat(visible.props.style).color, '#123456');
  assert.equal(textOf(visible), 'Community', 'full title, never a hard-coded abbreviation');
  const base = flat(visible.props.style).fontSize;
  // Measured: natural 57 dp (split over two lines when constrained), tab box 54 dp → scaled to fit with slack.
  box.props.onLayout({ nativeEvent: { layout: { width: 54 } } });
  measure.props.onTextLayout({ nativeEvent: { lines: [{ width: 40 }, { width: 17 }] } });
  box = render();
  assert.equal(flat(box.props.children[1].props.style).fontSize, base * ((54 - TAB_LABEL_FIT_MARGIN) / 57));
  // React Navigation's own inner tab padding (its source), on 360/384/411 dp phones and text ×1–×2.
  const item = fs.readFileSync(path.join(root, 'node_modules/@react-navigation/bottom-tabs/src/views/BottomTabItem.tsx'), 'utf8');
  const pad = Number(item.match(/tabVerticalUiKit: \{[^}]*padding: (\d+)/)[1]);
  const titles = ['Feed', 'Trips', 'Explore', 'Chats', 'Community', 'Profile'];
  for (const width of [360, 384, 411]) {
    const available = width / titles.length - 2 * pad;
    for (const scale of [1, 1.15, 1.3, 1.5, 2]) {
      const size = base * Math.min(scale, TAB_LABEL_MAX_FONT_MULTIPLIER);
      for (const t of titles) {
        const need = (available - TAB_LABEL_FIT_MARGIN) / estWidth(t, size);
        const s = fitScale(estWidth(t, size), available);
        assert.ok(need >= TAB_LABEL_MIN_SCALE, `${t} at ${width} dp, text ×${scale}: needs ${need.toFixed(2)}`);
        assert.ok(estWidth(t, size) * s <= available + 1e-9, `${t} fits at ${width} dp, text ×${scale}`);
      }
    }
  }
  assert.equal(fitScale(0, 54), 1, 'unmeasured: full size');
  const layout = fs.readFileSync(path.join(root, 'apps/mobile/app/(app)/_layout.tsx'), 'utf8');
  assert.match(layout, /tabBarLabel: \(\{ color, children \}\) => <TabLabel color=\{color\}>\{children\}<\/TabLabel>/);
  assert.doesNotMatch(layout, /allowFontScaling=\{false\}|allowFontScaling: false/);
  assert.match(layout, /\.\.\.tabBarInsets\(insets\.bottom\)/, 'safe-area fix kept');
});

test('journal card: like control never overlapped; author and read time shrink/wrap (SM-S711U, 2026-10-18)', () => {
  const like = component('apps/mobile/components/posts/LikeButton.tsx', {
    'react-native': rnStub, '@expo/vector-icons': { Ionicons: 'Ionicons' }, '@/components/ui': { Text: 'Text' },
    '@/constants/theme': { Colors: {}, FontSize: { sm: 14 }, FontWeight: {} },
  });
  const countOf = (n) => textOf(nodes(like.LikeButton({ liked: false, count: n, onToggle() {} })).find((x) => x.type === 'Text') || '');
  assert.deepEqual([0, 7, 999, 1000, 1500, 999_949, 999_950, 2_400_000].map(countOf), ['', '7', '999', '1k', '1.5k', '999.9k', '1M', '2.4M']);
  const card = component('apps/mobile/components/journals/JournalCard.tsx', {
    'react-native': rnStub, 'expo-router': { router: { push() {} } }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@/hooks/useMediaSource': { useMediaSource: () => (u) => ({ uri: u }) },
    '@/components/ui': { Text: 'Text', Avatar: 'Avatar' }, '@/components/posts/LikeButton': { LikeButton: 'LikeButton' },
    '@/hooks/useJournals': { useLikeJournal: () => ({ liked: false, toggling: false, toggle() {} }) },
    '@solotravelsoul/shared': { getUserInitials: () => 'AB' },
    '@/constants/theme': { Colors: {}, Spacing: { xs: 4, sm: 8, md: 12, '2xl': 24 }, Radius: {}, FontSize: { xs: 12, sm: 14, xl: 20 }, FontWeight: {}, Shadow: {} },
  });
  const longName = 'Maximiliana Alexandrovna Featherstonehaugh-Whittingham';
  const tree = card.JournalCard({ journal: { journalId: 'j', title: 'T', authorName: longName, readTimeMinutes: 1, likeCount: 1_234_567 } });
  const all = nodes(tree);
  const footer = all.find((n) => n.props.children.some((c) => nodes(c).some((x) => x.type === 'LikeButton')) && flat(n.props.style).flexDirection === 'row');
  assert.ok(footer, 'footer row');
  const [meta, likeSlot, ...rest] = footer.props.children.filter(Boolean);
  assert.equal(rest.length, 0);
  assert.ok(nodes(likeSlot).some((x) => x.type === 'LikeButton'), 'like control is its own footer slot');
  assert.equal(flat(likeSlot.props.style).flexShrink, 0, 'like control is never compressed or overlapped');
  const m = flat(meta.props.style);
  assert.equal(m.flex, 1); assert.equal(m.minWidth, 0, 'metadata can shrink below its content width');
  assert.equal(m.flexWrap, 'wrap', 'read time wraps under the author instead of running into the like count');
  const name = nodes(meta).find((x) => x.type === 'Text' && textOf(x) === longName);
  assert.ok(name, 'full name rendered (ellipsised visually, readable by screen readers)');
  assert.equal(name.props.numberOfLines, 1);
  assert.equal(flat(name.props.style).flexShrink, 1);
  const author = meta.props.children.find((c) => nodes(c).includes(name));
  assert.ok(flat(author.props.style).flexShrink >= 1 && flat(author.props.style).minWidth === 0, 'author group shrinks');
  const readTime = meta.props.children.find((c) => /min read/.test(textOf(c)));
  assert.ok(readTime && readTime !== author, 'read time is its own wrap unit');
  assert.equal(flat(readTime.props.style).flexShrink, 0, 'read time stays whole ("1 min read")');
});

test('config plugin declares fontScale in MainActivity configChanges (manifest configuration only; runtime behaviour is verified on a device)', () => {
  // Observed on the installed APK (b150243): changing the text size while the app ran relaunched MainActivity
  // (wm_relaunch_resume_activity, config 0x40000000 = fontScale), because the manifest's configChanges lacked fontScale.
  // This test proves ONLY that the build configuration now declares fontScale (plugin output, idempotence, registration).
  // It does NOT prove that navigation, drafts or the session survive a text-size change, that no relaunch happens at
  // runtime, that text is unclipped, or that text adopts the new size: those need a device build (see release-handoff.md).
  const calls = [];
  const mod = mobile('apps/mobile/plugins/withFontScaleConfigChange.js', { 'expo/config-plugins': {
    withAndroidManifest: (config, action) => { calls.push('withAndroidManifest'); return action({ ...config, modResults: config.__manifest }); },
    AndroidConfig: { Manifest: { getMainActivityOrThrow: (m) => m.manifest.application[0].activity.find((a) => a.$['android:name'] === '.MainActivity') } },
  } });
  const { addFontScaleConfigChange } = mod;
  const manifest = (changes) => ({ manifest: { application: [{ activity: [
    { $: { 'android:name': '.MainActivity', ...(changes === undefined ? {} : { 'android:configChanges': changes }) } },
    { $: { 'android:name': '.Other', 'android:configChanges': 'orientation' } },
  ] }] } });
  const flags = (m) => (m.manifest.application[0].activity[0].$['android:configChanges'] || '').split('|').filter(Boolean);
  // Expo's template value (what the installed APK shipped with).
  const template = 'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode';
  const a = manifest(template); addFontScaleConfigChange(a);
  assert.deepEqual(flags(a), [...template.split('|'), 'fontScale'], 'fontScale added, existing flags kept in order');
  addFontScaleConfigChange(a);
  assert.equal(flags(a).filter((f) => f === 'fontScale').length, 1, 'idempotent');
  assert.equal(a.manifest.application[0].activity[1].$['android:configChanges'], 'orientation', 'other activities untouched');
  const b = manifest(undefined); addFontScaleConfigChange(b);
  assert.deepEqual(flags(b), ['fontScale'], 'no existing attribute: fontScale only');
  // The plugin entry point goes through the Expo manifest mod and is registered for every build profile.
  const cfg = mod.default || mod;
  cfg({ __manifest: manifest(template) });
  assert.deepEqual(calls, ['withAndroidManifest']);
  const appJson = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/app.json'), 'utf8'));
  assert.ok(appJson.expo.plugins.includes('./plugins/withFontScaleConfigChange'), 'plugin registered in app.json');
  const appConfig = require(path.join(root, 'apps/mobile/app.config.js'));
  for (const variant of [undefined, 'staging']) {
    if (variant) process.env.APP_VARIANT = variant; else delete process.env.APP_VARIANT;
    assert.ok(appConfig({ config: appJson.expo }).plugins.includes('./plugins/withFontScaleConfigChange'), `plugin present (${variant || 'production'})`);
  }
  delete process.env.APP_VARIANT;
});

test('native Android findings (staging APK, 2026-10-09) stay fixed', () => {
  const read = (f) => fs.readFileSync(path.join(root, 'apps/mobile', f), 'utf8');
  const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.tsx?$/.test(e.name)) out.push(p); } return out; };
  const sources = [...walk(path.join(root, 'apps/mobile/app')), ...walk(path.join(root, 'apps/mobile/components'))].map((p) => [path.relative(root, p), fs.readFileSync(p, 'utf8')]);
  // expo-router: an index route is reached by its folder path; "/x/index" is an unmatched route.
  assert.deepEqual(sources.filter(([, s]) => /(push|replace|navigate)\(\s*['"`][^'"`]*\/index['"`]/.test(s)).map(([p]) => p), []);
  // Android 15 is edge-to-edge: the window no longer resizes for the keyboard, so avoidance must stay on.
  assert.deepEqual(sources.filter(([, s]) => /'padding'\s*:\s*undefined/.test(s)).map(([p]) => p), []);
  // The global offline banner overlays the status bar instead of pushing the tabs down
  // (a shifted parent made keyboard avoidance fall short by the banner's height).
  const layout = read('app/(app)/_layout.tsx');
  assert.match(layout, /<\/Tabs>\s*\{!isConnected && <OfflineBanner overlay \/>\}/);
  assert.ok(!/<OfflineBanner \/>\s*<Tabs/.test(layout));
  assert.match(read('components/ui/OfflineBanner.tsx'), /overlay: \{\s*position: 'absolute',/);
  // Composer: a shared post clears the form (the screen stays mounted); a refused post is reported.
  const create = read('app/(app)/post/create.tsx');
  assert.match(create, /if \(postId\) \{[\s\S]*setImages\(\[\]\);[\s\S]*setCaption\(''\);[\s\S]*router\.replace/);
  assert.match(create, /\} else \{[\s\S]{0,200}Alert\.alert\('Post not shared'/);
  // Report sheet: first tap on Submit submits while the details keyboard is open; posts are labelled as posts.
  const report = read('components/community/ReportModal.tsx');
  assert.match(report, /keyboardShouldPersistTaps="handled"/);
  assert.match(report, /post: 'This post'/);
  // Profile stats: six stats share the row instead of overflowing a phone-width screen.
  assert.match(read('components/profile/ProfileStats.tsx'), /statWrap: \{\s*flex: 1,/);
  // Moderation: one decision resolves every open report on the same item.
  assert.match(read('app/(app)/moderation/index.tsx'), /reports\.filter\(\(x\) => x\.targetType === r\.targetType && x\.targetId === r\.targetId\)/);
  // Chat sends refused by the rules: behaviour tests in tests/release/chatQueue.cjs.
});

test('published contact addresses are the working mailbox; no @solotravelsoul.app address (the domain does not exist)', () => {
  const MAILBOX = 'ravitejatravelsoul@gmail.com';
  const contact = fs.readFileSync(path.join(root, 'apps/mobile/constants/contact.ts'), 'utf8');
  assert.match(contact, new RegExp(`export const CONTACT_EMAIL = '${MAILBOX}';`));
  const page = fs.readFileSync(path.join(root, 'workers/r2-upload-worker/src/deletionPage.ts'), 'utf8');
  assert.match(page, new RegExp(`const CONTACT = '${MAILBOX}';`));
  // Every shipped source file: no address at the unregistered domain, and any literal address is the mailbox.
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'android', 'ios', '.expo'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|js)$/.test(e.name)) files.push(p);
    }
  };
  for (const d of ['apps/mobile/app', 'apps/mobile/components', 'apps/mobile/hooks', 'apps/mobile/constants', 'apps/mobile/utils', 'apps/mobile/stores', 'apps/mobile/services', 'apps/mobile/lib', 'workers/r2-upload-worker/src']) {
    if (fs.existsSync(path.join(root, d))) walk(path.join(root, d));
  }
  assert.ok(files.length > 20);
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/@solotravelsoul\.app/.test(src), `${path.relative(root, f)} publishes an @solotravelsoul.app address`);
    for (const m of src.matchAll(/mailto:([^'"`?$)\s]+)/g)) assert.equal(m[1], MAILBOX, path.relative(root, f));
  }
  // The Safety screen's mailto target and its label are the same constant.
  const safety = fs.readFileSync(path.join(root, 'apps/mobile/app/(app)/profile/safety.tsx'), 'utf8');
  assert.match(safety, /Linking\.openURL\(`mailto:\$\{CONTACT_EMAIL\}`\)[\s\S]{0,400}<Text style=\{styles\.linkLabel\}>\{CONTACT_EMAIL\}<\/Text>/);
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} app checks passed`);
})();
