// Account deletion: ownership, failure and retry tests.
//   node tests/release/accountDeletion.cjs             in-memory store (no emulator)
//   node tests/release/accountDeletion.cjs --emulator  Firestore emulator via the real REST adapter
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

const EMULATOR = process.argv.includes('--emulator');
const EMULATOR_HOST = '127.0.0.1:8188';
const PROJECT = 'demo-sts-release-review';

const transpile = (file) =>
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

const workerCache = {};
function worker(name) {
  if (workerCache[name]) return workerCache[name];
  const m = { exports: {} };
  workerCache[name] = m.exports;
  new Function('module', 'exports', 'require', transpile(path.join(root, 'workers/r2-upload-worker/src', name + '.ts')))(
    m, m.exports, (n) => (n.startsWith('./') ? worker(n.slice(2)) : require(n))
  );
  return (workerCache[name] = m.exports);
}

function mobile(file, deps) {
  const m = { exports: {} };
  vm.runInNewContext(transpile(path.join(root, file)), {
    module: m, exports: m.exports, console: { error() {}, log() {} },
    process: { env: { EXPO_PUBLIC_R2_UPLOAD_WORKER_URL: 'https://worker.test/' } },
    require: (n) => { if (n in deps) return deps[n]; throw Error('Unexpected ' + n); },
    Promise, Error, Object, JSON, Set, Map, Array, String, fetch: (...a) => global.fetch(...a),
  }, { filename: file });
  return m.exports;
}

const { StoreConflict, FirestoreRest } = worker('firestoreRest');
const deletion = worker('accountDeletion');
const route = worker('accountRoute');
const authMod = worker('auth');
const DELETED = deletion.DELETED_NAME;

// ── In-memory DocStore with Firestore commit semantics ───────────────────────

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
class MemoryStore {
  constructor() { this.docs = new Map(); this.clock = 0; }
  async get(p) { const d = this.docs.get(p); return d ? { path: p, data: clone(d.data), updateTime: d.updateTime } : null; }
  async query(collectionId, filters, opts = {}) {
    const out = [];
    for (const [p, d] of this.docs) {
      const segs = p.split('/');
      const parent = segs.slice(0, -2).join('/');
      if (segs[segs.length - 2] !== collectionId) continue;
      if (!opts.allDescendants && parent !== (opts.parent || '')) continue;
      const ok = filters.every((f) => f.op === 'EQUAL' ? d.data[f.field] === f.value
        : Array.isArray(d.data[f.field]) && d.data[f.field].includes(f.value));
      if (ok) out.push({ path: p, data: clone(d.data), updateTime: d.updateTime });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }
  async listDocumentIds(col) {
    const ids = new Set();
    for (const p of this.docs.keys()) if (p.startsWith(col + '/')) ids.add(p.slice(col.length + 1).split('/')[0]);
    return [...ids];
  }
  async listCollectionIds(docPath) {
    const ids = new Set();
    for (const p of this.docs.keys()) if (p.startsWith(docPath + '/')) ids.add(p.slice(docPath.length + 1).split('/')[0]);
    return [...ids];
  }
  async commit(writes) {
    for (const w of writes) {
      const d = this.docs.get(w.path);
      if (w.updateTime && (!d || d.updateTime !== w.updateTime)) throw new StoreConflict('updateTime');
      if (w.kind === 'delete' && w.mustExist && !d) throw new StoreConflict('missing');
      if (w.kind === 'update' && !w.updateTime && (w.mustExist ?? true) !== !!d) throw new StoreConflict('exists');
    }
    for (const w of writes) {
      if (w.kind === 'delete') { this.docs.delete(w.path); continue; }
      const data = clone(this.docs.get(w.path)?.data) ?? {};
      const at = (dotted, create) => {
        const segs = dotted.split('.'); let node = data;
        for (const s of segs.slice(0, -1)) { if (typeof node[s] !== 'object' || node[s] === null) { if (!create) return [null]; node[s] = {}; } node = node[s]; }
        return [node, segs[segs.length - 1]];
      };
      for (const [k, v] of Object.entries(w.set ?? {})) { const [n, key] = at(k, true); n[key] = clone(v); }
      for (const k of w.remove ?? []) { const [n, key] = at(k, false); if (n) delete n[key]; }
      for (const [k, v] of Object.entries(w.increment ?? {})) { const [n, key] = at(k, true); n[key] = (typeof n[key] === 'number' ? n[key] : 0) + v; }
      for (const k of w.serverTime ?? []) { const [n, key] = at(k, true); n[key] = new Date().toISOString(); }
      this.docs.set(w.path, { data, updateTime: String(++this.clock) });
    }
  }
}

async function emulatorStore() {
  const resp = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(resp.ok, 'emulator reset');
  return new FirestoreRest({ projectId: PROJECT, token: async () => 'owner', emulatorHost: EMULATOR_HOST });
}

const newStore = () => (EMULATOR ? emulatorStore() : Promise.resolve(new MemoryStore()));

function fakeMedia(name, keys) {
  const objects = new Set(keys);
  return {
    name, objects, failNext: 0,
    async deletePrefixes(prefixes) {
      if (this.failNext > 0) { this.failNext--; throw new Error(`${name} unavailable`); }
      let n = 0;
      for (const k of [...objects]) if (prefixes.some((p) => k.startsWith(p))) { objects.delete(k); n++; }
      return n;
    },
  };
}

// ── Two-user (plus bystander) fixture ─────────────────────────────────────────
// ME starts with a digit to exercise quoted field paths (memberInfo.`7alice`).
const ME = '7alice', BOB = 'bob', CAROL = 'carol';

const FIXTURE = {
  [`users/${ME}`]: { email: 'alice@example.test', name: 'Alice' },
  [`users/${ME}/trips/t1`]: { destination: 'Lisbon' },
  [`users/${ME}/trips/t1/checklist/c1`]: { title: 'Passport' },
  [`users/${ME}/trips/t1/itinerary/d1`]: { places: [] },
  [`users/${ME}/saved_places/p1`]: { userId: ME },
  [`users/${BOB}`]: { email: 'bob@example.test' },
  [`userLookup/${ME}`]: { uid: ME, email: 'old-alice@example.test', displayName: 'Alice' },
  'userLookupByEmail/alice@example.test': { uid: ME, email: 'alice@example.test' },
  'userLookupByEmail/old-alice@example.test': { uid: BOB, email: 'old-alice@example.test' }, // reclaimed by Bob
  [`publicProfiles/${ME}`]: { uid: ME, followersCount: 1, followingCount: 1 },
  [`publicProfiles/${BOB}`]: { uid: BOB, followersCount: 2, followingCount: 1 },
  [`publicProfiles/${CAROL}`]: { uid: CAROL, followersCount: 0, followingCount: 1 },
  [`follows/${ME}___${BOB}`]: { followerId: ME, followingId: BOB },
  [`follows/${CAROL}___${BOB}`]: { followerId: CAROL, followingId: BOB },
  [`follows/${BOB}___${ME}`]: { followerId: BOB, followingId: ME },
  'travelPosts/bobPost': { authorId: BOB, likeCount: 2, saveCount: 2, commentCount: 3 },
  [`postLikes/bobPost___${ME}`]: { postId: 'bobPost', userId: ME, targetType: 'post' },
  [`postLikes/bobPost___${CAROL}`]: { postId: 'bobPost', userId: CAROL, targetType: 'post' },
  [`savedPosts/${ME}___bobPost`]: { postId: 'bobPost', userId: ME },
  [`savedPosts/${CAROL}___bobPost`]: { postId: 'bobPost', userId: CAROL },
  'postComments/aliceComment': { authorId: ME, authorName: 'Alice', authorPhoto: 'https://r2/a.jpg', postId: 'bobPost', parentCommentId: null, text: 'hi', isDeleted: false, replyCount: 1 },
  'postComments/bobReply': { authorId: BOB, authorName: 'Bob', authorPhoto: null, postId: 'bobPost', parentCommentId: 'aliceComment', text: 'hello back', isDeleted: false, replyCount: 0 },
  'postComments/aliceReplyToCarol': { authorId: ME, authorName: 'Alice', authorPhoto: null, postId: 'bobPost', parentCommentId: 'carolComment', text: 'yes', isDeleted: false, replyCount: 0 },
  // Deleted by Alice earlier (counters already released) but still carrying her name.
  'postComments/aliceOldDeleted': { authorId: ME, authorName: 'Alice', authorPhoto: 'https://r2/a.jpg', postId: 'bobPost', parentCommentId: null, text: '', isDeleted: true, replyCount: 0 },
  'postComments/carolComment': { authorId: CAROL, authorName: 'Carol', authorPhoto: null, postId: 'bobPost', parentCommentId: null, text: 'q?', isDeleted: false, replyCount: 1 },
  'travelPosts/alicePost': { authorId: ME, likeCount: 1, saveCount: 0, commentCount: 1, images: ['https://r2/post_photos/7alice/x.jpg'] },
  [`postLikes/alicePost___${BOB}`]: { postId: 'alicePost', userId: BOB, targetType: 'post' },
  'postComments/bobOnAlice': { authorId: BOB, authorName: 'Bob', postId: 'alicePost', parentCommentId: null, text: 'nice', isDeleted: false, replyCount: 0 },
  'travelJournals/aliceJournal': { authorId: ME, likeCount: 0 },
  'travelJournals/bobJournal': { authorId: BOB, likeCount: 1 },
  [`postLikes/bobJournal___${ME}`]: { postId: 'bobJournal', userId: ME }, // legacy edge without targetType
  'publicTrips/bobTrip': { ownerUid: BOB, memberCount: 2 },
  [`trips/bobTrip/members/${BOB}`]: { uid: BOB, role: 'owner', displayName: 'Bob' },
  [`trips/bobTrip/members/${ME}`]: { uid: ME, role: 'member', displayName: 'Alice' },
  'publicTrips/aliceTrip': { ownerUid: ME, memberCount: 2 },
  [`trips/aliceTrip/members/${ME}`]: { uid: ME, role: 'owner' },
  [`trips/aliceTrip/members/${BOB}`]: { uid: BOB, role: 'member' },
  'travelGroups/bobGroup': { ownerUid: BOB, memberCount: 2 },
  [`travelGroups/bobGroup/members/${BOB}`]: { uid: BOB, role: 'owner' },
  [`travelGroups/bobGroup/members/${ME}`]: { uid: ME, role: 'member', displayName: 'Alice' },
  'tripJoinRequests/aliceAsked': { requestorUid: ME, requestorName: 'Alice', ownerUid: BOB, status: 'approved' },
  'tripJoinRequests/bobAsked': { requestorUid: BOB, requestorName: 'Bob', ownerUid: ME, status: 'pending' },
  'groups/chat1': { members: [ME, BOB], memberInfo: { [ME]: { name: 'Alice', initials: 'A' }, [BOB]: { name: 'Bob', initials: 'B' } }, unreadCounts: { [ME]: 2, [BOB]: 0 }, lastMessage: { senderId: ME, senderName: 'Alice', text: 'see you' } },
  'groups/chat1/messages/m1': { senderId: ME, senderName: 'Alice', text: 'see you' },
  'groups/chat1/messages/m2': { senderId: BOB, senderName: 'Bob', text: 'bye' },
  'groups/soloChat': { members: [ME], memberInfo: { [ME]: { name: 'Alice', initials: 'A' } } },
  'groups/soloChat/messages/s1': { senderId: ME, senderName: 'Alice', text: 'note to self' },
  'groups/leftChat/messages/old': { senderId: ME, senderName: 'Alice', text: 'from before I left' },
  'groups/leftChat': { members: [BOB], memberInfo: { [BOB]: { name: 'Bob', initials: 'B' } } },
  [`direct_chats/${ME}_${BOB}`]: { participants: [ME, BOB], participantInfo: { [ME]: { name: 'Alice', initials: 'A' }, [BOB]: { name: 'Bob', initials: 'B' } }, unreadCounts: { [ME]: 1, [BOB]: 0 } },
  [`direct_chats/${ME}_${BOB}/messages/d1`]: { senderId: ME, text: 'hey bob' },
  'notifications/mine': { userId: ME, title: 'x' },
  'notifications/toBob': { userId: BOB, actorId: ME, actorName: 'Alice', actorPhoto: 'https://r2/a.jpg', title: 'Alice liked your post' },
  'activityFeed/aliceItem': { actorUid: ME, actorName: 'Alice' },
  'activityFeed/bobItem': { actorUid: BOB, actorName: 'Bob' },
  [`blocks/${ME}/blocked/${CAROL}`]: { blockedUid: CAROL },
  [`blocks/${BOB}/blocked/${CAROL}`]: { blockedUid: CAROL },
  [`nearbyTravelers/${ME}`]: { uid: ME },
  [`travelerReputation/${ME}`]: { score: 3 },
  'user_place_reviews/r1': { userId: ME, text: 'great' },
  'user_place_reviews/r2': { userId: BOB, text: 'ok' },
  'reports/rep1': { reporterUid: ME, targetId: CAROL },
};

async function seed(store) {
  for (const [p, data] of Object.entries(FIXTURE)) {
    await store.commit([{ kind: 'update', path: p, set: data, mustExist: false }]);
  }
}

function harness(store) {
  const r2 = fakeMedia('r2', [`profile_photos/${ME}/avatar.jpg`, `post_photos/${ME}/x.jpg`, `post_photos/${BOB}/y.jpg`, `profile_photos/${BOB}/avatar.jpg`]);
  const storage = fakeMedia('firebase-storage', [`profile_photos/${ME}/a.jpg`, `trip_covers/${ME}/t1.jpg`, `journals/${ME}/t1/e.jpg`, `trip_covers/${BOB}/t.jpg`]);
  const authCalls = [];
  const auth = { fail: 0, async del(uid) {
    // Auth removal must be the very last thing: no owned data may remain.
    authCalls.push({ uid, privateDataGone: !(await store.get(`users/${uid}`)), mediaGone: ![...r2.objects, ...storage.objects].some((k) => k.includes(`/${uid}/`)) });
    if (auth.fail > 0) { auth.fail--; throw new Error('auth backend down'); }
  } };
  let now = Date.now();
  const deps = { store, r2, firebaseStorage: storage, deleteAuthUser: (uid) => auth.del(uid), now: () => now };
  return { deps, r2, storage, authCalls, auth, advance: (ms) => { now += ms; } };
}

async function expectState(store, h) {
  const get = async (p) => (await store.get(p))?.data;
  const gone = [
    `users/${ME}`, `users/${ME}/trips/t1`, `users/${ME}/trips/t1/checklist/c1`, `users/${ME}/trips/t1/itinerary/d1`, `users/${ME}/saved_places/p1`,
    `userLookup/${ME}`, 'userLookupByEmail/alice@example.test', `publicProfiles/${ME}`,
    `follows/${ME}___${BOB}`, `follows/${BOB}___${ME}`, `postLikes/bobPost___${ME}`, `savedPosts/${ME}___bobPost`, `postLikes/bobJournal___${ME}`,
    'travelPosts/alicePost', 'travelJournals/aliceJournal',
    'publicTrips/aliceTrip', `trips/aliceTrip/members/${ME}`, `trips/aliceTrip/members/${BOB}`,
    `trips/bobTrip/members/${ME}`, `travelGroups/bobGroup/members/${ME}`, 'tripJoinRequests/aliceAsked',
    'groups/soloChat', 'groups/soloChat/messages/s1', 'notifications/mine', 'activityFeed/aliceItem',
    `blocks/${ME}/blocked/${CAROL}`, `nearbyTravelers/${ME}`, `travelerReputation/${ME}`, 'user_place_reviews/r1',
  ];
  for (const p of gone) assert.equal(await get(p), undefined, `${p} should be deleted`);

  // Other users' content and relationships are preserved; counters exact.
  assert.equal((await get('userLookupByEmail/old-alice@example.test')).uid, BOB);
  assert.deepEqual([(await get(`publicProfiles/${BOB}`)).followersCount, (await get(`publicProfiles/${BOB}`)).followingCount], [1, 0]);
  assert.equal((await get(`publicProfiles/${CAROL}`)).followingCount, 1);
  const bobPost = await get('travelPosts/bobPost');
  assert.deepEqual([bobPost.likeCount, bobPost.saveCount, bobPost.commentCount], [1, 1, 1]);
  assert.ok(await get(`postLikes/bobPost___${CAROL}`));
  assert.ok(await get(`savedPosts/${CAROL}___bobPost`));
  const tomb = await get('postComments/aliceComment');
  assert.deepEqual([tomb.isDeleted, tomb.text, tomb.authorName, tomb.authorPhoto, tomb.replyCount], [true, '', DELETED, null, 1]);
  const old = await get('postComments/aliceOldDeleted');
  assert.deepEqual([old.authorName, old.authorPhoto], [DELETED, null]);
  assert.equal((await get('postComments/bobReply')).text, 'hello back');
  assert.equal((await get('postComments/carolComment')).replyCount, 0);
  assert.ok(await get(`postLikes/alicePost___${BOB}`), "Bob's like on Alice's post is Bob's record");
  assert.ok(await get('postComments/bobOnAlice'), "Bob's comment is Bob's content");
  assert.equal((await get('travelJournals/bobJournal')).likeCount, 0);
  assert.equal((await get('publicTrips/bobTrip')).memberCount, 1);
  assert.ok(await get(`trips/bobTrip/members/${BOB}`));
  assert.equal((await get('travelGroups/bobGroup')).memberCount, 1);
  assert.equal((await get('tripJoinRequests/bobAsked')).status, 'cancelled');
  const chat = await get('groups/chat1');
  assert.deepEqual(chat.members, [BOB]);
  assert.equal(chat.memberInfo[ME], undefined);
  assert.equal(chat.unreadCounts[ME], undefined);
  assert.equal(chat.lastMessage.senderName, DELETED);
  assert.deepEqual([(await get('groups/chat1/messages/m1')).senderName, (await get('groups/chat1/messages/m1')).text], [DELETED, 'see you']);
  assert.equal((await get('groups/chat1/messages/m2')).senderName, 'Bob');
  assert.equal((await get('groups/leftChat/messages/old')).senderName, DELETED);
  const dm = await get(`direct_chats/${ME}_${BOB}`);
  assert.deepEqual([dm.participantInfo[ME].name, dm.participantInfo[BOB].name, dm.unreadCounts[ME]], [DELETED, 'Bob', undefined]);
  assert.equal((await get(`direct_chats/${ME}_${BOB}/messages/d1`)).text, 'hey bob');
  const n = await get('notifications/toBob');
  assert.deepEqual([n.actorName, n.actorPhoto, n.userId], [DELETED, null, BOB]);
  assert.ok(await get('activityFeed/bobItem'));
  assert.ok(await get(`blocks/${BOB}/blocked/${CAROL}`));
  assert.ok(await get('user_place_reviews/r2'));
  assert.ok(await get('reports/rep1'), 'safety reports are retained');
  assert.ok(await get(`users/${BOB}`));
  // Media: only this user's prefixes.
  assert.deepEqual([...h.r2.objects].sort(), [`post_photos/${BOB}/y.jpg`, `profile_photos/${BOB}/avatar.jpg`]);
  assert.deepEqual([...h.storage.objects], [`trip_covers/${BOB}/t.jpg`]);
  assert.equal((await get(`accountDeletions/${ME}`)).status, 'completed');
}

// Simulates "commit applied but the response was lost" for writes touching `match`.
function lossyCommit(store, match, times = 1) {
  const original = store.commit.bind(store);
  let left = times;
  store.commit = async (writes) => {
    await original(writes);
    if (left > 0 && writes.some((w) => w.path.includes(match))) { left--; throw new Error('network: response lost'); }
  };
  return () => { store.commit = original; };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('two-user ownership: only the caller\'s data is deleted, others preserved, counters exact', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  assert.deepEqual(await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps), { status: 'deleted' });
  await expectState(store, h);
  assert.equal(h.authCalls.length, 1);
  assert.deepEqual(h.authCalls[0], { uid: ME, privateDataGone: true, mediaGone: true });
});

test('media failure keeps Auth, records the failed step, and a retry finishes exactly once', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  h.storage.failNext = 1;
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps),
    (e) => e instanceof deletion.DeletionStepFailed && e.step === 'firebaseMedia');
  assert.equal(h.authCalls.length, 0, 'Auth must not be removed after a failed cleanup');
  const job = (await store.get(`accountDeletions/${ME}`)).data;
  assert.deepEqual([job.status, job.lastError.step, job.leaseUntil], ['failed', 'firebaseMedia', 0]);
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  await expectState(store, h);
  assert.equal(h.authCalls.length, 1);
});

test('lost commit responses mid-step never double-decrement counters on retry', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  // In step order: each attempt dies inside a later step after the earlier ones completed.
  for (const match of [`postLikes/bobPost___${ME}`, `follows/${ME}___${BOB}`, 'postComments/aliceReplyToCarol', `trips/bobTrip/members/${ME}`]) {
    const restore = lossyCommit(store, match);
    await assert.rejects(deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps), deletion.DeletionStepFailed);
    restore();
  }
  assert.equal(h.authCalls.length, 0);
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  await expectState(store, h);
});

test('Auth removal failure is retryable and data stays deleted', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  h.auth.fail = 1;
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps), (e) => e.step === 'auth');
  assert.equal((await store.get(`accountDeletions/${ME}`)).data.status, 'failed');
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  await expectState(store, h);
  assert.equal(h.authCalls.length, 2);
});

test('concurrent attempt is rejected while a lease is held; stale lease can be taken over', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  await store.commit([{ kind: 'update', path: `accountDeletions/${ME}`, set: { uid: ME, status: 'in_progress', leaseUntil: Date.now() + 60_000 }, mustExist: false }]);
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: null }, h.deps), deletion.DeletionInProgress);
  assert.ok(await store.get(`users/${ME}`), 'nothing deleted while another attempt runs');
  h.advance(10 * 60_000);
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  await expectState(store, h);
});

test('repeat request after completion is a no-op success', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  await expectState(store, h);
});

// ── Route: authentication and recent-login gate ───────────────────────────────

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const req = (auth) => new Request('https://worker.test/account/delete', { method: 'POST', headers: auth ? { Authorization: auth } : {} });
const nowSec = Math.floor(Date.now() / 1000);

test('route: missing token, invalid token, stale login and missing credentials delete nothing', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const call = async (auth, verified, configured = true) => {
    const resp = await route.handleAccountDeletion(req(auth), {
      verify: async () => { if (!verified) throw new Error('bad signature'); return verified; },
      deletion: () => (configured ? h.deps : null), json, nowSec: () => nowSec,
    });
    return { status: resp.status, body: await resp.json() };
  };
  assert.deepEqual(await call(null, null), { status: 401, body: { error: 'Missing Authorization: Bearer <token>', code: 'auth/missing-token' } });
  assert.equal((await call('Bearer forged', null)).body.code, 'auth/invalid-token');
  const stale = await call('Bearer t', { uid: ME, email: null, authTime: nowSec - 10 * 60 });
  assert.deepEqual([stale.status, stale.body.code], [401, 'auth/requires-recent-login']);
  assert.equal((await call('Bearer t', { uid: ME, email: null, authTime: 0 })).body.code, 'auth/requires-recent-login');
  assert.equal((await call('Bearer t', { uid: ME, email: null, authTime: nowSec }, false)).status, 503);
  assert.ok(await store.get(`users/${ME}`), 'no rejected request may delete data');
  assert.equal(h.authCalls.length, 0);
  const ok = await call('Bearer t', { uid: ME, email: 'alice@example.test', authTime: nowSec - 30 });
  assert.deepEqual([ok.status, ok.body], [200, { status: 'deleted' }]);
  await expectState(store, h);
});

test('route: a failed step returns a retryable 500 naming the step', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  h.r2.failNext = 1;
  const resp = await route.handleAccountDeletion(req('Bearer t'), {
    verify: async () => ({ uid: ME, email: null, authTime: nowSec }), deletion: () => h.deps, json, nowSec: () => nowSec,
  });
  const body = await resp.json();
  assert.deepEqual([resp.status, body.code, body.step, body.retryable], [500, 'deletion/failed', 'r2Media', true]);
  assert.equal(h.authCalls.length, 0);
});

test('recent-auth window', async () => {
  assert.equal(authMod.isRecentAuth({ authTime: nowSec - 60 }, nowSec), true);
  assert.equal(authMod.isRecentAuth({ authTime: nowSec - 301 }, nowSec), false);
  assert.equal(authMod.isRecentAuth({ authTime: 0 }, nowSec), false);
});

// ── Client: reauth gate, local cleanup only after success ─────────────────────

test('client: wrong password / server failure keep local data; success clears caches and signs out', async () => {
  const storage = new Map([[`@sts:trips:${ME}`, '[]'], [`@sts:queue:${ME}`, '[]'], [`@sts:chatqueue:${ME}`, '[]'], [`@sts/notif_ids_${ME}_t1`, '{}'], [`@sts:trips:${BOB}`, '[]'], ['onboarded', '1']]);
  const AsyncStorage = { getAllKeys: async () => [...storage.keys()], multiRemove: async (ks) => ks.forEach((k) => storage.delete(k)) };
  let cancelled = 0, fetches = [], fetchResult = { ok: true, status: 200, json: async () => ({ status: 'deleted' }) };
  const local = mobile('apps/mobile/utils/accountDeletion.ts', {
    '@react-native-async-storage/async-storage': { default: AsyncStorage },
    'expo-notifications': { cancelAllScheduledNotificationsAsync: async () => { cancelled++; } },
    '@solotravelsoul/firebase': { getFreshIdToken: async () => 'fresh-token' },
  });
  const realFetch = global.fetch;
  global.fetch = async (url, init) => { fetches.push({ url, auth: init.headers.Authorization }); return fetchResult; };

  let reauth = async () => {}, signOuts = 0, toasts = [], routes = [], paused = [];
  const hook = mobile('apps/mobile/hooks/useAuth.ts', {
    react: { useCallback: (f) => f }, 'zustand/react/shallow': { useShallow: (f) => f },
    'expo-router': { router: { replace: (r) => routes.push(r) } },
    '@solotravelsoul/firebase': { signIn() {}, signUp() {}, signOut: async () => { signOuts++; }, resetPassword() {}, reauthenticate: (p) => reauth(p), createUserProfile() {}, upsertUserLookup() {} },
    '@solotravelsoul/shared': { getUserInitials: () => 'A' },
    '@/stores/authStore': { useAuthStore: (sel) => sel({ user: { uid: ME }, profile: null, loading: false, setLoading() {} }) },
    '@/stores/uiStore': { useUIStore: (sel) => sel({ addToast: (m, t) => toasts.push(t) }) },
    '@/hooks/useSyncEngine': { setSyncPaused: (uid, p) => paused.push(p) },
    '@/utils/accountDeletion': local,
  });
  try {
    reauth = async () => { throw Object.assign(new Error('x'), { code: 'auth/wrong-password' }); };
    assert.equal(await hook.useAuth().deleteAccount('nope'), false);
    assert.deepEqual([fetches.length, signOuts, storage.size, paused], [0, 0, 6, [true, false]]);

    reauth = async () => {};
    fetchResult = { ok: false, status: 500, json: async () => ({ code: 'deletion/failed', step: 'r2Media' }) };
    assert.equal(await hook.useAuth().deleteAccount('pw'), false);
    assert.deepEqual([fetches.length, signOuts, storage.size, cancelled], [1, 0, 6, 0]);
    assert.deepEqual(fetches[0], { url: 'https://worker.test/account/delete', auth: 'Bearer fresh-token' });

    fetchResult = { ok: true, status: 200, json: async () => ({ status: 'deleted' }) };
    assert.equal(await hook.useAuth().deleteAccount('pw'), true);
    assert.deepEqual([...storage.keys()].sort(), [`@sts:trips:${BOB}`, 'onboarded']);
    assert.deepEqual([signOuts, cancelled, routes], [1, 1, ['/(auth)/login']]);

    // Lost response from a completed deletion: reauth now reports the user gone.
    reauth = async () => { throw Object.assign(new Error('x'), { code: 'auth/user-not-found' }); };
    assert.equal(await hook.useAuth().deleteAccount('pw'), true);
  } finally {
    global.fetch = realFetch;
  }
});

(async () => {
  let passed = 0;
  const only = EMULATOR ? tests.filter((t) => !t.name.startsWith('client') && t.name !== 'recent-auth window') : tests;
  for (const t of only) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); }
    catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${only.length} account deletion checks passed (${EMULATOR ? 'Firestore emulator' : 'in-memory store'})`);
})();
