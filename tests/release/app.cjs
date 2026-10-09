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

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} app checks passed`);
})();
