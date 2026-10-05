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

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} app checks passed`);
})();
