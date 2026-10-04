// Worker media (KV bytes + D1 index, Firestore-gated access).
//   node --no-warnings tests/release/media.cjs             in-memory Firestore, real SQLite D1 schema
//   node --no-warnings tests/release/media.cjs --emulator  Firestore emulator; content changes are made
//                                                          directly by users through the client SDK + rules
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { root, worker, MemoryStore, d1Fake, kvFake } = require('./lib/fakes.cjs');

const EMULATOR = process.argv.includes('--emulator');
const HOST = '127.0.0.1:8188';
const PROJECT = 'demo-sts-release-review';
const BASE = 'https://media.worker.test';

const media = worker('media');
const { FirestoreRest } = worker('firestoreRest');
const modRoute = worker('moderationRoute');
const deletion = worker('accountDeletion');

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const verify = async (t) => { if (!t.startsWith('tok:')) throw new Error('bad token'); return { uid: t.slice(4), authTime: Math.floor(Date.now() / 1000) }; };

let env, sdk;
async function harness() {
  const db = d1Fake();
  const kv = kvFake();
  let store;
  if (EMULATOR) {
    const resp = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    assert.ok(resp.ok, 'emulator reset');
    store = new FirestoreRest({ projectId: PROJECT, token: async () => 'owner', emulatorHost: HOST });
  } else {
    store = new MemoryStore();
  }
  const deps = { db, kv, store, verify, publicBaseUrl: BASE, json };
  // Admin seeding (Worker / console); never used for the "direct user change" steps.
  const seed = async (p, data) => {
    if (!EMULATOR) return store.seed(p, data);
    await env.withSecurityRulesDisabled(async (ctx) => { await sdk.setDoc(sdk.doc(ctx.firestore(), p), data); });
  };
  // A change made directly by a signed-in user through Firestore (client SDK, real rules).
  const direct = async (uid, p, patch) => {
    if (!EMULATOR) { const cur = (await store.get(p))?.data ?? {}; return store.seed(p, { ...cur, ...patch }); }
    await sdk.updateDoc(sdk.doc(env.authenticatedContext(uid).firestore(), p), patch);
  };
  return { db, kv, store, deps, seed, direct };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
function uploadReq(uid, { bytes = PNG, type = 'image/png', purpose = 'post', headers = {} } = {}) {
  const form = new FormData();
  if (bytes) form.append('file', new File([bytes], 'x.png', { type }));
  if (purpose) form.append('purpose', purpose);
  return new Request(`${BASE}/media/upload`, { method: 'POST', body: form, headers: uid ? { Authorization: `Bearer tok:${uid}`, ...headers } : headers });
}
async function upload(h, uid, opts) {
  const resp = await media.handleMediaUpload(uploadReq(uid, opts), h.deps);
  const body = await resp.json();
  return { status: resp.status, ...body };
}
async function view(h, id, uid) {
  const req = new Request(`${BASE}/media/${id}`, { headers: uid === undefined ? {} : { Authorization: `Bearer ${uid === 'bad' ? 'nope' : 'tok:' + uid}` } });
  const resp = await media.handleMediaView(req, id, h.deps);
  return { status: resp.status, cache: resp.headers.get('Cache-Control'), vary: resp.headers.get('Vary'), bytes: resp.status === 200 ? new Uint8Array(await resp.arrayBuffer()) : null };
}
const OK = 200;

const tests = [];
const test = (name, fn, only) => tests.push({ name, fn, only });

// ── Upload ────────────────────────────────────────────────────────────────────

test('upload: auth, 2 MB cap, purpose and type checks; success indexes then stores bytes', async () => {
  const h = await harness();
  assert.equal((await upload(h, null)).status, 401);
  assert.equal((await media.handleMediaUpload(new Request(`${BASE}/media/upload`, { method: 'POST', headers: { Authorization: 'Bearer nope' } }), h.deps)).status, 403);
  const big = new Uint8Array(media.MAX_UPLOAD_BYTES + 1);
  assert.equal((await upload(h, 'alice', { bytes: big })).status, 413, 'actual size over 2 MB');
  assert.equal((await upload(h, 'alice', { headers: { 'Content-Length': String(5 * 1024 * 1024) } })).status, 413, 'declared size over 2 MB rejected before reading');
  assert.equal((await upload(h, 'alice', { bytes: new Uint8Array(media.MAX_UPLOAD_BYTES) })).status, OK, 'exactly 2 MB accepted');
  assert.equal((await upload(h, 'alice', { type: 'text/html' })).status, 415);
  assert.equal((await upload(h, 'alice', { purpose: 'avatarz' })).status, 400);
  const ok = await upload(h, 'alice');
  assert.equal(ok.status, OK);
  assert.match(ok.id, /^[0-9a-f]{32}$/, 'opaque id');
  assert.equal(ok.photoURL, `${BASE}/media/${ok.id}`);
  assert.ok(!ok.photoURL.includes('alice'), 'URL does not reveal the owner');
  const row = h.db.row(ok.id);
  assert.deepEqual([row.owner_uid, row.status, row.purpose, row.visibility, row.kv_delete_pending], ['alice', 'active', 'post', 'inherit', 0]);
  assert.deepEqual([...new Uint8Array(h.kv.map.get(row.kv_key))], [...PNG]);
});

test('upload: deletion barrier or suspension before the upload refuses it without storing anything', async () => {
  const h = await harness();
  await h.seed('accountDeletions/alice', { state: 'in_progress' });
  await h.seed('accountSuspensions/bob', { reason: 'abuse' });
  assert.equal((await upload(h, 'alice')).status, 403);
  assert.equal((await upload(h, 'bob')).status, 403);
  assert.equal(h.kv.map.size, 0);
  assert.equal(h.db.raw.prepare('SELECT COUNT(*) n FROM media').get().n, 0);
});

test('upload: deletion starting during the upload (post-check) never activates; bytes removed or queued', async () => {
  for (const kvDeleteFails of [false, true]) {
    const h = await harness();
    const put = h.kv.put;
    h.kv.put = async (k, v) => { await put(k, v); await h.seed('accountDeletions/alice', { state: 'in_progress' }); };
    if (kvDeleteFails) h.kv.state.deleteQuota = 0;
    const r = await upload(h, 'alice');
    assert.equal(r.status, 403);
    const row = h.db.raw.prepare('SELECT * FROM media').get();
    assert.equal(row.status, 'removed');
    assert.equal(row.kv_delete_pending, kvDeleteFails ? 1 : 0, 'queued for the cleanup cron when KV refuses the delete');
    assert.equal(h.kv.map.size, kvDeleteFails ? 1 : 0);
  }
});

test('upload: Firestore, D1 and KV failures fail closed (503, nothing served, cleanup queued)', async () => {
  if (EMULATOR) return;
  // Barrier unreadable before upload.
  let h = await harness();
  h.store.failGetMany = 1;
  assert.equal((await upload(h, 'alice')).status, 503);
  assert.equal(h.kv.map.size, 0);
  // Barrier unreadable after bytes are stored: treated as blocked.
  h = await harness();
  const put = h.kv.put;
  h.kv.put = async (k, v) => { await put(k, v); h.store.failGetMany = 1; };
  assert.equal((await upload(h, 'alice')).status, 403);
  assert.equal(h.db.raw.prepare('SELECT status FROM media').get().status, 'removed');
  // D1 rows-written quota: no bytes are written without an index row.
  h = await harness();
  h.db.state.failWrites = 1;
  assert.equal((await upload(h, 'alice')).status, 503);
  assert.equal(h.kv.map.size, 0);
  // KV write quota: row marked failed and queued.
  h = await harness();
  h.kv.state.putQuota = 0;
  assert.equal((await upload(h, 'alice')).status, 503);
  const failed = h.db.raw.prepare('SELECT * FROM media').get();
  assert.deepEqual([failed.status, failed.kv_delete_pending], ['failed', 1]);
  // Activation write fails: the row stays pending and is never served.
  h = await harness();
  let writes = 0;
  const prep = h.db.prepare;
  h.db.prepare = (sql) => { if (/^UPDATE media SET status = 'active'/.test(sql.trim()) && writes++ === 0) h.db.state.failWrites = 1; return prep(sql); };
  assert.equal((await upload(h, 'alice')).status, 503);
  const pending = h.db.raw.prepare('SELECT * FROM media').get();
  assert.equal(pending.status, 'pending');
  assert.equal((await view(h, pending.id, 'alice')).status, 404, 'pending media is never served');
}, 'memory');

// ── View authorization ────────────────────────────────────────────────────────

async function postWithImage(h, { owner = 'alice', postId = 'p1', visibility = 'public', purpose = 'post' } = {}) {
  const up = await upload(h, owner, { purpose });
  const coll = purpose === 'journal' ? 'travelJournals' : 'travelPosts';
  await h.seed(`${coll}/${postId}`, { authorId: owner, visibility, isArchived: false, images: [up.photoURL], likeCount: 0, commentCount: 0, saveCount: 0, reportCount: 0 });
  return up;
}

test('view: token required; unattached media is owner-only; attached public post is shared with ≤5 min private cache', async () => {
  const h = await harness();
  const up = await upload(h, 'alice');
  assert.equal((await view(h, 'not-an-id', 'alice')).status, 404);
  assert.equal((await view(h, up.id)).status, 401);
  assert.equal((await view(h, up.id, 'bad')).status, 403);
  let v = await view(h, up.id, 'alice');
  assert.equal(v.status, OK);
  assert.equal(v.cache, 'private, no-store');
  assert.equal(v.vary, 'Authorization');
  assert.deepEqual([...v.bytes], [...PNG]);
  assert.equal((await view(h, up.id, 'bob')).status, 404, 'not attached to anything yet');
  await h.seed('travelPosts/p1', { authorId: 'alice', visibility: 'public', isArchived: false, images: [up.photoURL] });
  v = await view(h, up.id, 'bob');
  assert.equal(v.status, OK);
  assert.equal(v.cache, 'private, max-age=300');
  assert.equal(h.db.row(up.id).parent_id, 'p1', 'parent bound lazily');
  // Someone else's post referencing alice's media never grants access.
  const h2 = await harness();
  const up2 = await upload(h2, 'alice');
  await h2.seed('travelPosts/evil', { authorId: 'mallory', visibility: 'public', isArchived: false, images: [up2.photoURL] });
  assert.equal((await view(h2, up2.id, 'bob')).status, 404);
});

test('view: direct Firestore privacy change, archive, report auto-hide and moderator removal revoke access on the next request', async () => {
  const h = await harness();
  const up = await postWithImage(h);
  assert.equal((await view(h, up.id, 'bob')).status, OK);
  await h.direct('alice', 'travelPosts/p1', { visibility: 'private' });
  assert.equal((await view(h, up.id, 'bob')).status, 404, 'private');
  assert.equal((await view(h, up.id, 'alice')).status, OK, 'owner still sees it');
  await h.direct('alice', 'travelPosts/p1', { visibility: 'public' });
  assert.equal((await view(h, up.id, 'bob')).status, OK);
  await h.direct('alice', 'travelPosts/p1', { isArchived: true });
  assert.equal((await view(h, up.id, 'bob')).status, 404, 'archived');
  await h.direct('alice', 'travelPosts/p1', { isArchived: false });

  // Three reports from distinct users: the third hides the post (rules force under_review).
  for (const [i, reporter] of ['r1', 'r2', 'r3'].entries()) {
    if (EMULATOR) {
      const db = env.authenticatedContext(reporter).firestore();
      await sdk.runTransaction(db, async (tx) => {
        const ref = sdk.doc(db, 'travelPosts/p1');
        const t = await tx.get(ref);
        tx.set(sdk.doc(db, `reports/post___p1___${reporter}`), { reporterUid: reporter, targetType: 'post', targetId: 'p1', reason: 'spam', details: '', status: 'pending', createdAt: sdk.serverTimestamp() });
        const next = (t.data().reportCount ?? 0) + 1;
        tx.update(ref, next >= 3 ? { reportCount: next, visibility: 'under_review' } : { reportCount: next });
      });
    } else {
      await h.direct(reporter, 'travelPosts/p1', i === 2 ? { reportCount: 3, visibility: 'under_review' } : { reportCount: i + 1 });
    }
  }
  assert.equal((await view(h, up.id, 'bob')).status, 404, 'report threshold auto-hide');
  await h.seed('moderators/mod', { grantedBy: 'console' });
  let mv = await view(h, up.id, 'mod');
  assert.equal(mv.status, OK, 'moderators can review hidden media');
  assert.equal(mv.cache, 'private, no-store');
  if (EMULATOR) {
    await sdk.updateDoc(sdk.doc(env.authenticatedContext('mod').firestore(), 'travelPosts/p1'), { visibility: 'removed', moderatedBy: 'mod', moderatedAt: sdk.serverTimestamp() });
  } else {
    await h.direct('mod', 'travelPosts/p1', { visibility: 'removed', moderatedBy: 'mod' });
  }
  assert.equal((await view(h, up.id, 'bob')).status, 404, 'moderator removal');
  // The D1 row still says active/inherit (stale): it never overrides Firestore.
  assert.deepEqual([h.db.row(up.id).status, h.db.row(up.id).visibility], ['active', 'inherit']);
});

test('view: a stale D1 parent binding cannot expose media moved to a hidden post', async () => {
  const h = await harness();
  const up = await postWithImage(h, { postId: 'pa' });
  assert.equal((await view(h, up.id, 'bob')).status, OK);
  assert.equal(h.db.row(up.id).parent_id, 'pa');
  // Alice moves the image from public post A into private post B directly.
  await h.seed('travelPosts/pb', { authorId: 'alice', visibility: 'private', isArchived: false, images: [], likeCount: 0, commentCount: 0, saveCount: 0, reportCount: 0 });
  await h.direct('alice', 'travelPosts/pb', { images: [up.photoURL] });
  await h.direct('alice', 'travelPosts/pa', { images: [] });
  assert.equal((await view(h, up.id, 'bob')).status, 404);
  assert.equal(h.db.row(up.id).parent_id, 'pb', 'rebound to the current parent');
  // Journal cover images are resolved the same way.
  const j = await upload(h, 'alice', { purpose: 'journal' });
  await h.seed('travelJournals/j1', { authorId: 'alice', visibility: 'public', isArchived: false, images: [], coverImageURL: j.photoURL, likeCount: 0, reportCount: 0 });
  assert.equal((await view(h, j.id, 'bob')).status, OK);
  await h.direct('alice', 'travelJournals/j1', { visibility: 'private' });
  assert.equal((await view(h, j.id, 'bob')).status, 404);
});

test('view: profile photos are shared while referenced; replacing the photo revokes the old one', async () => {
  const h = await harness();
  const up = await upload(h, 'alice', { purpose: 'profile' });
  await h.seed('users/alice', { uid: 'alice', photoURL: up.photoURL });
  assert.equal((await view(h, up.id, 'bob')).status, OK);
  const next = await upload(h, 'alice', { purpose: 'profile' });
  await h.direct('alice', 'users/alice', { photoURL: next.photoURL });
  assert.equal((await view(h, up.id, 'bob')).status, 404);
  assert.equal((await view(h, next.id, 'bob')).status, OK);
});

test('view: owner_only rows, removed rows and the deletion barrier deny regardless of Firestore content', async () => {
  const h = await harness();
  const up = await postWithImage(h);
  await h.seed('moderators/mod', { grantedBy: 'console' });
  h.db.raw.prepare(`UPDATE media SET visibility = 'owner_only' WHERE id = ?`).run(up.id);
  assert.equal((await view(h, up.id, 'bob')).status, 404);
  assert.equal((await view(h, up.id, 'mod')).status, OK);
  assert.equal((await view(h, up.id, 'alice')).status, OK);
  h.db.raw.prepare(`UPDATE media SET visibility = 'inherit', status = 'removed' WHERE id = ?`).run(up.id);
  assert.equal((await view(h, up.id, 'bob')).status, 404, 'removed in D1 although the post is public');
  assert.equal((await view(h, up.id, 'alice')).status, 404);
  const h2 = await harness();
  const up2 = await postWithImage(h2);
  await h2.seed('accountDeletions/alice', { state: 'in_progress' });
  assert.equal((await view(h2, up2.id, 'bob')).status, 404, 'deletion barrier');
  assert.equal((await view(h2, up2.id, 'alice')).status, 404, 'even for the owner');
});

test('view: D1, Firestore and KV errors fail closed with no bytes; missing bytes are 404', async () => {
  if (EMULATOR) return;
  const h = await harness();
  const up = await postWithImage(h);
  h.db.state.fail = 1;
  let v = await view(h, up.id, 'bob');
  assert.deepEqual([v.status, v.bytes, v.cache], [503, null, 'private, no-store']);
  h.store.failGetMany = 1;
  assert.equal((await view(h, up.id, 'bob')).status, 503);
  h.kv.state.failGet = 1;
  assert.equal((await view(h, up.id, 'bob')).status, 503);
  h.kv.map.clear();
  assert.equal((await view(h, up.id, 'bob')).status, 404);
}, 'memory');

test('no edge caching: the media path never uses the Cache API', async () => {
  for (const f of ['media.ts', 'index.ts', 'moderationRoute.ts', 'adminMedia.ts']) {
    const src = fs.readFileSync(path.join(root, 'workers/r2-upload-worker/src', f), 'utf8');
    assert.ok(!/\bcaches\./.test(src) && !/cf:\s*\{[^}]*cache/i.test(src), `${f} uses edge caching`);
  }
}, 'memory');

// ── Cleanup ───────────────────────────────────────────────────────────────────

test('maintenance: abandoned uploads and unreferenced media are revoked and purged; KV quota leaves them queued', async () => {
  const h = await harness();
  let t = 1_000_000_000_000;
  h.deps.now = () => t;
  const kept = await postWithImage(h, { postId: 'keep' });
  const orphan = await upload(h, 'alice');
  const profileOld = await upload(h, 'alice', { purpose: 'profile' });
  await h.seed('users/alice', { uid: 'alice', photoURL: 'elsewhere' });
  h.db.raw.prepare(`INSERT INTO media VALUES ('${'a'.repeat(32)}', 'alice', 'm/abandoned', 'post', 'inherit', 'pending', NULL, 'image/png', 1, ?, ?, 0)`).run(t, t);
  h.kv.map.set('m/abandoned', new ArrayBuffer(1));
  t += media.UNATTACHED_ORPHAN_MS + 1;
  h.kv.state.deleteQuota = 1; // KV daily delete limit reached after one delete
  const r1 = await media.runMediaMaintenance(h.deps, { checkLimit: 10, purgeLimit: 10 });
  assert.deepEqual([r1.abandoned, r1.orphaned, r1.purged], [1, 2, 1]);
  assert.equal(h.db.row(kept.id).status, 'active');
  assert.equal(h.db.row(orphan.id).status, 'removed');
  assert.equal(h.db.row(profileOld.id).status, 'removed');
  assert.equal(h.db.raw.prepare('SELECT COUNT(*) n FROM media WHERE kv_delete_pending = 1').get().n, 2, 'still queued, not reported as deleted');
  assert.equal((await view(h, orphan.id, 'alice')).status, 404, 'revoked although bytes remain');
  h.kv.state.deleteQuota = Infinity;
  const r2 = await media.runMediaMaintenance(h.deps, { checkLimit: 10, purgeLimit: 10 });
  assert.equal(r2.purged, 2);
  assert.deepEqual([...h.kv.map.keys()], [h.db.row(kept.id).kv_key]);
  assert.ok(h.db.row(kept.id).updated_at === t, 'referenced media rechecked and kept');
});

test('maintenance: D1 quota errors propagate (fail closed) instead of being reported as done', async () => {
  if (EMULATOR) return;
  const h = await harness();
  h.db.state.fail = 1;
  await assert.rejects(media.runMediaMaintenance(h.deps, { checkLimit: 1, purgeLimit: 1 }));
}, 'memory');

test("moderator removal revokes and deletes only the author's KV media; KV failure stays queued", async () => {
  const h = await harness();
  await h.seed('moderators/mod', { grantedBy: 'console' });
  const own = await upload(h, 'alice');
  const foreign = await upload(h, 'carol');
  await h.seed('travelPosts/rm', { authorId: 'alice', visibility: 'removed', isArchived: false, images: [own.photoURL, foreign.photoURL] });
  h.kv.state.deleteQuota = 0;
  const deps = { verify, store: h.store, publicBaseUrl: 'https://pub.r2.test', media: { db: h.db, kv: h.kv, baseUrl: BASE }, json };
  const call = () => modRoute.handleRemoveMedia(new Request(`${BASE}/moderation/remove-media`, { method: 'POST', headers: { Authorization: 'Bearer tok:mod' }, body: JSON.stringify({ targetType: 'post', targetId: 'rm' }) }), deps);
  assert.equal((await call()).status, OK);
  assert.deepEqual([h.db.row(own.id).status, h.db.row(own.id).kv_delete_pending], ['removed', 1], 'revoked; physical delete queued');
  assert.equal(h.db.row(foreign.id).status, 'active', "another user's media is untouched");
  h.kv.state.deleteQuota = Infinity;
  await media.purgePending(h.db, h.kv, { limit: 10 });
  assert.equal(h.kv.map.has(h.db.row(own.id).kv_key), false);
  assert.equal(h.kv.map.has(h.db.row(foreign.id).kv_key), true);
});

test('account deletion media step: revokes all of the owner\'s media at once, purges in bounded batches', async () => {
  const h = await harness();
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await postWithImage(h, { postId: `q${i}` })).id);
  const other = await upload(h, 'bob');
  await media.revokeOwner(h.db, 'alice', Date.now());
  for (const id of ids) assert.equal((await view(h, id, 'alice')).status, 404, 'logical revocation is immediate');
  assert.equal((await view(h, other.id, 'bob')).status, OK);
  let r = await media.purgePending(h.db, h.kv, { owner: 'alice', limit: 2 });
  assert.deepEqual(r, { deleted: 2, remaining: 1 });
  h.kv.state.deleteQuota = 0;
  r = await media.purgePending(h.db, h.kv, { owner: 'alice', limit: 2 });
  assert.deepEqual(r, { deleted: 0, remaining: 1 }, 'KV refusal is reported as remaining, not deleted');
  assert.equal(typeof deletion.MediaCleanupPending, 'function');
});

(async () => {
  if (EMULATOR) {
    const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
    sdk = require('firebase/firestore');
    env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8188, rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8') } });
  }
  let passed = 0;
  const only = tests.filter((t) => !t.only || t.only === (EMULATOR ? 'emulator' : 'memory'));
  for (const t of only) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  if (env) await env.cleanup();
  console.log(`${passed}/${only.length} media checks passed (${EMULATOR ? 'Firestore emulator, direct client changes' : 'in-memory store'})`);
})();
