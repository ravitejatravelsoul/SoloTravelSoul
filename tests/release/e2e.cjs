// End to end through the real runtime: the front Worker and SQLite-backed Durable
// Objects (src/edge.ts) run in workerd via Miniflare, with local KV and D1, against
// the Firestore, Auth and Storage emulators (demo project).
//   npm run test:rules   (starts the emulators and runs this file)
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { root, worker } = require('./lib/fakes.cjs');

const WDIR = path.join(root, 'workers/r2-upload-worker');
const req = (m) => require(require.resolve(m, { paths: [WDIR] }));
const { Miniflare } = req('miniflare');
const esbuild = req('esbuild');

const PROJECT = 'demo-sts-release-review';
const FIRESTORE = '127.0.0.1:8188';
const AUTH = '127.0.0.1:9189';
const STORAGE = '127.0.0.1:9188';
const ORIGIN = 'http://sts.test';
const { FirestoreRest } = worker('firestoreRest');
const store = new FirestoreRest({ projectId: PROJECT, token: async () => 'owner', emulatorHost: FIRESTORE });

async function bundle() {
  const out = path.join(require('os').tmpdir(), `sts-edge-${process.pid}.mjs`);
  await esbuild.build({ entryPoints: [path.join(WDIR, 'src/edge.ts')], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
    external: ['cloudflare:workers'], outfile: out, logLevel: 'silent', mainFields: ['module', 'main'] });
  return out;
}

async function runtime(scriptPath, vars = {}) {
  const mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'edge.mjs', contents: fs.readFileSync(scriptPath, 'utf8') }], compatibilityDate: '2025-06-01',
    durableObjects: { API: { className: 'ApiShard', useSQLite: true } },
    kvNamespaces: ['MEDIA_KV'], d1Databases: ['MEDIA_DB'],
    bindings: {
      FIREBASE_PROJECT_ID: PROJECT, FIREBASE_STORAGE_BUCKET: 'never-provisioned-bucket', LEGACY_MEDIA_MODE: 'none',
      FIRESTORE_EMULATOR_HOST: FIRESTORE, FIREBASE_AUTH_EMULATOR_HOST: AUTH, STORAGE_EMULATOR_HOST: STORAGE,
      MEDIA_PUBLIC_ORIGIN: ORIGIN, ADMIN_DELETION_TOKEN: 'ops-e2e', API_SHARDS: '8',
      SLICE_WORK_UNITS: '6', CRON_WORK_UNITS: '40', CRON_ALL_PHASES: '1', ...vars,
    },
  });
  const db = await mf.getD1Database('MEDIA_DB');
  const sql = fs.readFileSync(path.join(WDIR, 'migrations/0001_media.sql'), 'utf8').split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n');
  for (const stmt of sql.split(';').map((x) => x.trim()).filter(Boolean)) {
    await db.prepare(stmt).run();
  }
  return { mf, db, fetch: (p, init) => mf.dispatchFetch(`${ORIGIN}${p}`, init) };
}

// ── Emulator helpers ──────────────────────────────────────────────────────────
async function signUp(tag) {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${tag}-${Date.now()}@example.test`, password: 'e2e-password', returnSecureToken: true }),
  });
  const j = await r.json();
  assert.ok(j.idToken && j.localId, `sign-up ${tag}`);
  return { uid: j.localId, token: j.idToken };
}
async function authUserExists(uid) {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [uid] }),
  });
  return ((await r.json()).users ?? []).length > 0;
}
const seed = async (docs) => { for (const [p, data] of Object.entries(docs)) await store.commit([{ kind: 'update', path: p, set: data, mustExist: false }]); };
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
/** Multipart body serialized to bytes with its boundary, as a device sends it. */
async function uploadInit(token) {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'x.png');
  form.append('purpose', 'post');
  const r = new Request('http://local/', { method: 'POST', body: form });
  return { method: 'POST', headers: { ...(token ? bearer(token) : {}), 'Content-Type': r.headers.get('content-type') }, body: new Uint8Array(await r.arrayBuffer()) };
}
async function deleteUntil(rt, token, max = 200) {
  const statuses = [];
  let r;
  for (let i = 0; i < max; i++) {
    r = await rt.fetch('/account/delete', { method: 'POST', headers: bearer(token) });
    statuses.push(r.status);
    if (r.status !== 202) break;
    const body = await r.json();
    if (body.status === 'blocked') break;
  }
  return { last: r.status, statuses };
}
async function userData(uid, n) {
  const docs = { [`users/${uid}`]: { email: `${uid}@example.test` }, [`publicProfiles/${uid}`]: { uid, followersCount: 0, followingCount: 0 } };
  for (let i = 0; i < n; i++) docs[`notifications/${uid}-n${i}`] = { userId: uid, title: 'x' };
  return docs;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let rt;

test('internal and unknown routes are denied at the front; nothing reaches an object', async () => {
  for (const [m, p] of [['GET', '/maintenance'], ['POST', '/maintenance'], ['GET', '/__internal'], ['POST', '/media/0123'], ['DELETE', '/account/delete']]) {
    const r = await rt.fetch(p, { method: m });
    assert.equal(r.status, 404, `${m} ${p}`);
  }
  assert.equal((await rt.fetch('/account-deletion')).status, 200);
});

test('unauthorized: missing token 401, invalid token 403, wrong admin token 403', async () => {
  assert.equal((await rt.fetch('/media/upload', await uploadInit(null))).status, 401);
  assert.equal((await rt.fetch(`/media/${'a'.repeat(32)}`)).status, 401);
  assert.equal((await rt.fetch('/media/upload', await uploadInit('a.b.c'))).status, 403);
  assert.equal((await rt.fetch('/account/delete', { method: 'POST', headers: bearer('x.eyJzdWIiOiJ4In0.y') })).status, 403);
  assert.equal((await rt.fetch('/admin/deletion-status', { headers: bearer('wrong') })).status, 403);
  assert.equal((await rt.fetch('/admin/deletion-status', { headers: bearer('ops-e2e') })).status, 200);
});

test('authenticated upload and view through the front and an object; shared only when attached to a public post', async () => {
  const a = await signUp('owner');
  const b = await signUp('viewer');
  const up = await rt.fetch('/media/upload', await uploadInit(a.token));
  assert.equal(up.status, 200);
  const { photoURL, id } = await up.json();
  assert.equal(photoURL, `${ORIGIN}/media/${id}`, 'media URL uses the canonical origin');
  const own = await rt.fetch(`/media/${id}`, { headers: bearer(a.token) });
  assert.equal(own.status, 200);
  assert.deepEqual([...new Uint8Array(await own.arrayBuffer())], [...PNG]);
  assert.equal(own.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await rt.fetch(`/media/${id}`, { headers: bearer(b.token) })).status, 404, 'unattached: owner only');
  await seed({ [`travelPosts/e2e-${id}`]: { authorId: a.uid, visibility: 'public', isArchived: false, images: [photoURL] } });
  const shared = await rt.fetch(`/media/${id}`, { headers: bearer(b.token) });
  assert.equal(shared.status, 200);
  assert.equal(shared.headers.get('Cache-Control'), 'private, max-age=300');
  await store.commit([{ kind: 'update', path: `travelPosts/e2e-${id}`, set: { visibility: 'private' } }]);
  assert.equal((await rt.fetch(`/media/${id}`, { headers: bearer(b.token) })).status, 404, 'privacy change revokes');
});

test('deletion continues across many small slices to completion; Auth, data and media removed', async () => {
  const u = await signUp('deleteme');
  await seed(await userData(u.uid, 60));
  const up = await rt.fetch('/media/upload', await uploadInit(u.token));
  assert.equal(up.status, 200);
  const r = await deleteUntil(rt, u.token);
  assert.equal(r.last, 200, JSON.stringify(r.statuses.slice(-3)));
  assert.ok(r.statuses.filter((s) => s === 202).length >= 3, `expected several continuations, got ${r.statuses.length}`);
  assert.equal(await authUserExists(u.uid), false);
  assert.equal(await store.get(`users/${u.uid}`), null);
  assert.equal((await store.query('notifications', [{ field: 'userId', op: 'EQUAL', value: u.uid }])).length, 0);
  const rows = await rt.db.prepare('SELECT status, kv_delete_pending FROM media WHERE owner_uid = ?').bind(u.uid).all();
  assert.ok(rows.results.length === 1 && rows.results.every((x) => x.status === 'removed' && x.kv_delete_pending === 0));
  const rec = await store.get(`legacyMediaCleanup/${u.uid}`);
  assert.deepEqual([rec.data.status, rec.data.proof], ['verified_absent', 'bucket-not-provisioned']);
  assert.equal((await store.get(`accountDeletions/${u.uid}`)).data.status, 'completed');
});

test('concurrent deletion attempts: the lease admits one; the deletion completes once', async () => {
  const u = await signUp('concurrent');
  await seed(await userData(u.uid, 20));
  const call = () => rt.fetch('/account/delete', { method: 'POST', headers: bearer(u.token) }).then((r) => r.status);
  const statuses = (await Promise.all([call(), call(), call()])).sort();
  assert.ok(statuses.includes(409), JSON.stringify(statuses));
  assert.ok(statuses.some((s) => s === 202 || s === 200), JSON.stringify(statuses));
  const r = await deleteUntil(rt, u.token);
  assert.equal(r.last, 200);
  assert.equal(await authUserExists(u.uid), false);
});

test('maintenance recovery: an abandoned deletion is finished by the cron entry (front → maintenance object RPC)', async () => {
  const u = await signUp('abandoned');
  await seed(await userData(u.uid, 40));
  const first = await rt.fetch('/account/delete', { method: 'POST', headers: bearer(u.token) });
  assert.equal(first.status, 202);
  const w = await rt.mf.getWorker();
  let runs = 0;
  for (; runs < 30; runs++) {
    await w.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' });
    if ((await store.get(`accountDeletions/${u.uid}`)).data.status === 'completed') break;
  }
  assert.equal((await store.get(`accountDeletions/${u.uid}`)).data.status, 'completed', `after ${runs + 1} runs`);
  assert.equal(await authUserExists(u.uid), false);
  console.log(`      recovered by ${runs + 1} cron run(s)`);
});

test('rollback mode (API_HOST_MODE=worker): the same front serves the API without objects', async () => {
  const rb = await runtime(rt.scriptPath, { API_HOST_MODE: 'worker' });
  try {
    const a = await signUp('rollback');
    const up = await rb.fetch('/media/upload', await uploadInit(a.token));
    assert.equal(up.status, 200);
    const { id } = await up.json();
    assert.equal((await rb.fetch(`/media/${id}`, { headers: bearer(a.token) })).status, 200);
    assert.equal((await rb.fetch('/maintenance')).status, 404);
  } finally {
    await rb.mf.dispose();
  }
});

(async () => {
  const scriptPath = await bundle();
  rt = await runtime(scriptPath);
  rt.scriptPath = scriptPath;
  let passed = 0;
  try {
    for (const t of tests) {
      try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
    }
  } finally {
    await rt.mf.dispose();
    fs.rmSync(scriptPath, { force: true });
  }
  console.log(`${passed}/${tests.length} end-to-end checks passed (workerd + SQLite Durable Objects + emulators)`);
})().catch((e) => { console.error(e); process.exit(1); });
