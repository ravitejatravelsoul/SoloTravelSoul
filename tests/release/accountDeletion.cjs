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
    Promise, Error, Object, JSON, Set, Map, Array, String, fetch: (...a) => global.fetch(...a), __DEV__: false,
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
        : f.op === 'GREATER_THAN' ? typeof d.data[f.field] === 'number' && d.data[f.field] > f.value
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
    async deletePrefixes(prefixes, beforePage) {
      await beforePage?.();
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
  [`savedPosts/${BOB}___alicePost`]: { postId: 'alicePost', userId: BOB, collectionName: 'Trips' },
  [`postLikes/aliceJournal___${CAROL}`]: { postId: 'aliceJournal', userId: CAROL, targetType: 'journal' },
  [`postLikes/aliceJournalLegacy___${CAROL}`]: { postId: 'aliceJournal2', userId: CAROL }, // legacy edge, no targetType
  'travelJournals/aliceJournal2': { authorId: ME, likeCount: 1 },
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
  const authUsers = new Set([ME, BOB, CAROL]);
  const auth = { fail: 0, async del(uid) {
    // Auth removal must be the very last thing: no owned data may remain.
    authCalls.push({ uid, privateDataGone: !(await store.get(`users/${uid}`)), mediaGone: ![...r2.objects, ...storage.objects].some((k) => k.includes(`/${uid}/`)) });
    if (auth.fail > 0) { auth.fail--; throw new Error('auth backend down'); }
    authUsers.delete(uid);
  } };
  let now = Date.now();
  let attempts = 0;
  const deps = { store, r2, firebaseStorage: storage, deleteAuthUser: (uid) => auth.del(uid), now: () => now,
    authUserExists: async (uid) => authUsers.has(uid),
    newAttemptId: () => `attempt-${++attempts}` };
  return { deps, r2, storage, authCalls, auth, advance: (ms) => { now += ms; }, now: () => now };
}

async function expectState(store, h) {
  const get = async (p) => (await store.get(p))?.data;
  const gone = [
    `users/${ME}`, `users/${ME}/trips/t1`, `users/${ME}/trips/t1/checklist/c1`, `users/${ME}/trips/t1/itinerary/d1`, `users/${ME}/saved_places/p1`,
    `userLookup/${ME}`, 'userLookupByEmail/alice@example.test', `publicProfiles/${ME}`,
    `follows/${ME}___${BOB}`, `follows/${BOB}___${ME}`, `postLikes/bobPost___${ME}`, `savedPosts/${ME}___bobPost`, `postLikes/bobJournal___${ME}`,
    'travelPosts/alicePost', 'travelJournals/aliceJournal', 'travelJournals/aliceJournal2',
    // Other users' likes/saves that pointed at Alice's deleted content.
    `postLikes/alicePost___${BOB}`, `savedPosts/${BOB}___alicePost`, `postLikes/aliceJournal___${CAROL}`, `postLikes/aliceJournalLegacy___${CAROL}`,
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
const test = (name, fn, only) => tests.push({ name, fn, only });

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
}, 'memory');

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
}, 'memory');

// ── Defect 1: persistent deletion barrier ─────────────────────────────────────

const uploads = worker('uploads');
const { LEASE_MS } = deletion;

test('barrier: job document exists before the first data step and persists after completion', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const query = store.query.bind(store);
  let barrierAtFirstStep;
  store.query = async (...a) => {
    if (barrierAtFirstStep === undefined) barrierAtFirstStep = !!(await store.get(`accountDeletions/${ME}`));
    return query(...a);
  };
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  store.query = query;
  assert.equal(barrierAtFirstStep, true);
  assert.ok(await store.get(`accountDeletions/${ME}`), 'barrier is never removed');
  // A failed attempt also leaves the barrier up (account locked, retry allowed).
  const store2 = await newStore(); await seed(store2); const h2 = harness(store2);
  h2.r2.failNext = 1;
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: null }, h2.deps));
  assert.equal((await store2.get(`accountDeletions/${ME}`)).data.status, 'failed');
});

function uploadRequest() {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'p.jpg', { type: 'image/jpeg' }));
  return new Request('https://worker.test/upload/post-photo', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: form });
}

test('worker uploads: refused once deletion started; an upload in flight when it starts is removed', async () => {
  const store = await newStore(); await seed(store);
  const objects = new Map();
  let onPut = async () => {};
  const deps = (isDeleting) => ({
    verify: async () => ({ uid: ME, email: null, authTime: 0 }),
    isDeleting,
    bucket: { put: async (k, v) => { objects.set(k, v); await onPut(); }, delete: async (k) => { objects.delete(k); } },
    publicBaseUrl: 'https://cdn.test/', json,
  });
  // Same barrier read the Worker performs (index.ts).
  const barrier = async (uid) => !!(await store.get(`accountDeletions/${uid}`));

  let resp = await uploads.handlePhotoUpload(uploadRequest(), uploads.POST_PHOTO, deps(barrier));
  assert.equal(resp.status, 200);
  assert.equal(objects.size, 1);
  objects.clear();

  // Deletion starts while the upload is being stored (after its first check).
  onPut = async () => {
    await store.commit([{ kind: 'update', path: `accountDeletions/${ME}`, set: { uid: ME, status: 'in_progress', leaseUntil: Date.now() + LEASE_MS }, mustExist: false }]);
  };
  resp = await uploads.handlePhotoUpload(uploadRequest(), uploads.POST_PHOTO, deps(barrier));
  assert.deepEqual([resp.status, (await resp.json()).code, objects.size], [403, 'account/deletion-in-progress', 0]);

  onPut = async () => {};
  resp = await uploads.handlePhotoUpload(uploadRequest(), uploads.PROFILE_PHOTO, deps(barrier));
  assert.deepEqual([resp.status, objects.size], [403, 0], 'refused before storing');

  resp = await uploads.handlePhotoUpload(uploadRequest(), uploads.POST_PHOTO, deps(async () => { throw new Error('firestore down'); }));
  assert.deepEqual([resp.status, objects.size], [403, 0], 'barrier read failure fails closed');
});

test('post-deletion sweep removes late media of recently deleted accounts only', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  // Uploads that passed the barrier check before deletion began, landing late.
  h.r2.objects.add(`post_photos/${ME}/late.jpg`);
  h.storage.objects.add(`journals/${ME}/t1/late.jpg`);
  assert.equal(await deletion.sweepRecentlyDeletedMedia(h.deps), 1);
  assert.ok(![...h.r2.objects, ...h.storage.objects].some((k) => k.includes(`/${ME}/`)));
  assert.ok(h.r2.objects.has(`post_photos/${BOB}/y.jpg`), 'other users untouched');
  h.advance(deletion.SWEEP_WINDOW_MS + 60_000);
  h.r2.objects.add(`post_photos/${ME}/much-later.jpg`);
  assert.equal(await deletion.sweepRecentlyDeletedMedia(h.deps), 0, 'outside the window');
});

test('barrier: other devices and still-valid tokens cannot write or upload during or after deletion; other users can', async () => {
  const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
  const sdk = require('firebase/firestore');
  const env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: '127.0.0.1', port: 8188, rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8') },
    storage: { host: '127.0.0.1', port: 9188, rules: fs.readFileSync(path.join(root, 'storage.rules'), 'utf8') },
  });
  try {
    const store = await newStore(); await seed(store); const h = harness(store);
    const alice = env.authenticatedContext(ME, { email: 'alice@example.test' });
    const bob = env.authenticatedContext(BOB, { email: 'bob@example.test' });
    const bytes = new Uint8Array([1, 2, 3]);
    const meta = { contentType: 'image/jpeg' };
    const aliceWrites = (tag) => [
      sdk.setDoc(sdk.doc(alice.firestore(), `users/${ME}/trips/${tag}`), { destination: 'x' }),
      sdk.setDoc(sdk.doc(alice.firestore(), `users/${ME}`), { email: 'alice@example.test' }),
      sdk.setDoc(sdk.doc(alice.firestore(), `travelPosts/${tag}`), { authorId: ME, likeCount: 0, commentCount: 0, saveCount: 0, visibility: 'public', isArchived: false }),
      sdk.setDoc(sdk.doc(alice.firestore(), `nearbyTravelers/${ME}`), { uid: ME }),
      sdk.setDoc(sdk.doc(alice.firestore(), `blocks/${ME}/blocked/${tag}`), { blockedUid: tag }),
      alice.storage().ref(`profile_photos/${ME}/${tag}.jpg`).put(bytes, meta),
      alice.storage().ref(`trip_covers/${ME}/${tag}.jpg`).put(bytes, meta),
    ];

    // Before deletion: the same writes are allowed (proves the barrier is what denies them).
    await assertSucceeds(sdk.setDoc(sdk.doc(alice.firestore(), `users/${ME}/trips/before`), { destination: 'x' }));
    await assertSucceeds(alice.storage().ref(`profile_photos/${ME}/before.jpg`).put(bytes, meta));
    await store.commit([{ kind: 'delete', path: `users/${ME}/trips/before` }]);

    // During deletion (mid "posts" step), another device keeps writing.
    const commit = store.commit.bind(store);
    let checked = false;
    store.commit = async (writes) => {
      if (!checked && writes.some((w) => w.path === 'travelPosts/alicePost')) {
        checked = true;
        for (const op of aliceWrites('during')) await assertFails(op);
        await assertSucceeds(sdk.setDoc(sdk.doc(bob.firestore(), `users/${BOB}/trips/during`), { destination: 'y' }));
        await assertSucceeds(bob.storage().ref(`profile_photos/${BOB}/during.jpg`).put(bytes, meta));
      }
      return commit(writes);
    };
    await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
    store.commit = commit;
    assert.ok(checked);
    await expectState(store, h);

    // After completion, a still-valid token for the deleted UID can recreate nothing.
    for (const op of aliceWrites('after')) await assertFails(op);
    assert.equal(await store.get(`users/${ME}/trips/after`), null);
  } finally {
    await env.cleanup();
  }
}, 'emulator');

// ── Defect 2: attempt ownership, conditional updates, lease renewal ──────────

test('deletion lasting well beyond the lease renews it, blocks concurrent attempts, and completes once', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const start = h.now();
  const clocked = {};
  let concurrentChecked = false;
  for (const m of ['get', 'query', 'listDocumentIds', 'listCollectionIds', 'commit']) {
    clocked[m] = async (...a) => {
      h.advance(15_000); // every database round trip takes 15 s
      if (!concurrentChecked && h.now() - start > LEASE_MS + 60_000) {
        concurrentChecked = true;
        // A second request (e.g. another device) after the original lease would have expired.
        await assert.rejects(deletion.deleteAccount({ uid: ME, email: null }, { ...h.deps, store }), deletion.DeletionInProgress);
      }
      return store[m](...a);
    };
  }
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, { ...h.deps, store: clocked });
  assert.ok(concurrentChecked);
  assert.ok(h.now() - start > 4 * LEASE_MS, `took ${(h.now() - start) / 60000} min`);
  const job = (await store.get(`accountDeletions/${ME}`)).data;
  assert.deepEqual([job.status, job.attempts, job.attemptId], ['completed', 1, 'attempt-1']);
  assert.equal(h.authCalls.length, 1);
  await expectState(store, h);
});

for (const [label, resume] of [
  ['continues with its next operation', (base, writes) => base(writes)],
  ['then fails with an error', async () => { throw new Error('late network error'); }],
]) {
  test(`an expired attempt that ${label} stops and cannot overwrite a newer successful job`, async () => {
    const store = await newStore(); await seed(store); const h = harness(store);
    const base = store.commit.bind(store);
    let tookOver = false;
    store.commit = async (writes) => {
      if (!tookOver && writes.some((w) => w.path === 'travelPosts/alicePost')) {
        tookOver = true;
        h.advance(LEASE_MS + 60_000); // attempt-1 stalls past its lease
        store.commit = base;
        await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps); // attempt-2 completes
        return resume(base, writes);
      }
      return base(writes);
    };
    await assert.rejects(deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps),
      (e) => e instanceof deletion.DeletionAttemptLost || e instanceof deletion.DeletionStepFailed);
    const job = (await store.get(`accountDeletions/${ME}`)).data;
    assert.deepEqual([job.status, job.attemptId, job.lastError], ['completed', 'attempt-2', null]);
    assert.equal(h.authCalls.length, 1, 'only the owning attempt removes Auth');
    await expectState(store, h);
  });
}

test('an attempt whose lease lapsed without takeover stops; the retry takes over and finishes', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const base = store.commit.bind(store);
  let stalled = false;
  store.commit = async (writes) => {
    if (!stalled && writes.some((w) => w.path.startsWith('follows/'))) { stalled = true; h.advance(LEASE_MS + 1); }
    return base(writes);
  };
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: null }, h.deps), (e) => e instanceof deletion.DeletionAttemptLost && e.reason === 'expired');
  store.commit = base;
  assert.equal(h.authCalls.length, 0);
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  assert.equal((await store.get(`accountDeletions/${ME}`)).data.attemptId, 'attempt-2');
  await expectState(store, h);
});

test('an expired attempt cannot mark a newer, still-running attempt failed', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const base = store.commit.bind(store);
  let phase = 'A';
  let releaseB, markPaused, newer;
  const bPaused = new Promise((r) => { markPaused = r; });
  const bRelease = new Promise((r) => { releaseB = r; });
  store.commit = async (writes) => {
    if (phase === 'A' && writes.some((w) => w.path === 'travelPosts/alicePost')) {
      phase = 'B';
      h.advance(LEASE_MS + 60_000); // attempt-1 stalls past its lease
      newer = deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps); // attempt-2 starts
      await bPaused; // attempt-2 is mid-way and owns the job
      throw new Error('late network error'); // attempt-1's step now fails
    }
    if (phase === 'B' && writes.some((w) => w.path.startsWith('groups/'))) {
      phase = 'B-paused';
      markPaused();
      await bRelease;
    }
    return base(writes);
  };
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps), deletion.DeletionStepFailed);
  let job = (await store.get(`accountDeletions/${ME}`)).data;
  assert.deepEqual([job.status, job.attemptId, job.lastError], ['in_progress', 'attempt-2', null]);
  releaseB();
  await newer;
  job = (await store.get(`accountDeletions/${ME}`)).data;
  assert.deepEqual([job.status, job.attemptId], ['completed', 'attempt-2']);
  store.commit = base;
  await expectState(store, h);
});

// ── Defect 3: likes/saves on deleted owned content ────────────────────────────

test('likes and saves referencing deleted owned posts/journals are removed; unrelated ones kept', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  // Retry safety: fail right after the first content item's edges were removed.
  const base = store.commit.bind(store);
  let failed = false;
  store.commit = async (writes) => {
    await base(writes);
    if (!failed && writes.some((w) => w.path === `savedPosts/${BOB}___alicePost`)) { failed = true; throw new Error('network: response lost'); }
  };
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps), (e) => e.step === 'posts');
  store.commit = base;
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  for (const p of [`postLikes/alicePost___${BOB}`, `savedPosts/${BOB}___alicePost`, `postLikes/aliceJournal___${CAROL}`, `postLikes/aliceJournalLegacy___${CAROL}`]) {
    assert.equal(await store.get(p), null, p);
  }
  for (const p of [`postLikes/bobPost___${CAROL}`, `savedPosts/${CAROL}___bobPost`]) assert.ok(await store.get(p), p);
  await expectState(store, h);
});

// ── Defect 4: accurate partial-deletion messaging ─────────────────────────────

test('failure messages describe possible partial deletion and retry, never "nothing was lost"', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  h.storage.failNext = 1;
  const resp = await route.handleAccountDeletion(req('Bearer t'), {
    verify: async () => ({ uid: ME, email: null, authTime: nowSec }), deletion: () => h.deps, json, nowSec: () => nowSec,
  });
  const body = await resp.json();
  assert.equal(resp.status, 500);
  assert.match(body.error, /may already be deleted/);
  assert.match(body.error, /try again/i);
  assert.doesNotMatch(body.error, /nothing was lost/i);
});

test('client failure toast describes possible partial deletion', async () => {
  const toasts = [];
  const hook = mobile('apps/mobile/hooks/useAuth.ts', {
    react: { useCallback: (f) => f }, 'zustand/react/shallow': { useShallow: (f) => f },
    'expo-router': { router: { replace() {} } },
    '@solotravelsoul/firebase': { signIn() {}, signUp() {}, signOut: async () => {}, resetPassword() {}, reauthenticate: async () => {}, createUserProfile() {}, upsertUserLookup() {} },
    '@solotravelsoul/shared': { getUserInitials: () => 'A' },
    '@/stores/authStore': { useAuthStore: (sel) => sel({ user: { uid: ME }, profile: null, loading: false, setLoading() {} }) },
    '@/stores/uiStore': { useUIStore: (sel) => sel({ addToast: (m) => toasts.push(m) }) },
    '@/hooks/useSyncEngine': { setSyncPaused() {} },
    '@/utils/accountDeletion': {
      requestAccountDeletion: async () => { throw Object.assign(new Error('x'), { code: 'deletion/failed' }); },
      clearLocalUserData: async () => {},
    },
  });
  assert.equal(await hook.useAuth().deleteAccount('pw'), false);
  assert.match(toasts[0], /may already be deleted/);
  assert.doesNotMatch(toasts[0], /nothing was lost/i);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'apps/mobile/app/privacy.tsx'), 'utf8'), /nothing was lost/i);
}, 'memory');

// ── Final bookkeeping failure: durable recovery ───────────────────────────────

// Fails every job write that would mark the job completed (the final write).
function failFinalWrite(store) {
  const base = store.commit.bind(store);
  store.commit = async (writes) => {
    if (writes.some((w) => w.path.startsWith('accountDeletions/') && w.set?.status === 'completed')) throw new Error('network: final write lost');
    return base(writes);
  };
  return () => { store.commit = base; };
}

test('final completed-job write fails: late media is still swept and scheduled finalization completes the job', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const restore = failFinalWrite(store);
  assert.deepEqual(await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps), { status: 'deleted' });
  let job = (await store.get(`accountDeletions/${ME}`)).data;
  assert.deepEqual([job.status, job.pendingFinalization, typeof job.mediaClearedAtMs], ['in_progress', true, 'number']);
  assert.equal(await h.deps.authUserExists(ME), false);

  // Late media from an upload in flight; the sweep must not depend on completion.
  h.r2.objects.add(`post_photos/${ME}/late.jpg`);
  h.storage.objects.add(`journals/${ME}/t1/late.jpg`);
  assert.equal(await deletion.sweepRecentlyDeletedMedia(h.deps), 1);
  assert.ok(![...h.r2.objects, ...h.storage.objects].some((k) => k.includes(`/${ME}/`)));

  // Recovery never acts under a live lease; once the dead attempt's lease lapses it finishes.
  restore();
  h.r2.objects.add(`profile_photos/${ME}/later.jpg`);
  assert.deepEqual(await deletion.runScheduledMaintenance(h.deps), { finalized: 0, resumed: 0, swept: 1 });
  h.advance(LEASE_MS + 1);
  assert.deepEqual(await deletion.runScheduledMaintenance(h.deps), { finalized: 1, resumed: 0, swept: 1 });
  job = (await store.get(`accountDeletions/${ME}`)).data;
  assert.deepEqual([job.status, job.pendingFinalization, job.recoveredBy], ['completed', false, 'scheduled-finalization']);
  assert.equal(h.authCalls.length, 1, 'no second Auth removal needed');
  await expectState(store, h);
  assert.deepEqual(await deletion.runScheduledMaintenance(h.deps), { finalized: 0, resumed: 0, swept: 1 }, 'idempotent');
});

test('Auth removal failed after media was cleared: finalization removes Auth without the user, but never under an active attempt', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  h.auth.fail = 1;
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps), (e) => e.step === 'auth');
  assert.equal(await h.deps.authUserExists(ME), true);

  // Another account mid-deletion (active lease, Auth present) must be left alone.
  await store.commit([{ kind: 'update', path: `accountDeletions/${BOB}`, mustExist: false,
    set: { uid: BOB, status: 'in_progress', attemptId: 'other', leaseUntil: h.now() + LEASE_MS, pendingFinalization: true, mediaClearedAtMs: h.now() } }]);

  const result = await deletion.finalizePendingDeletions(h.deps);
  assert.equal(result, 1);
  assert.equal(await h.deps.authUserExists(ME), false, 'Auth removed by the scheduled job');
  assert.equal(await h.deps.authUserExists(BOB), true, 'active attempt untouched');
  assert.equal((await store.get(`accountDeletions/${ME}`)).data.status, 'completed');
  assert.equal((await store.get(`accountDeletions/${BOB}`)).data.status, 'in_progress');
  await expectState(store, h);
});

// ── Cron finalization concurrency ─────────────────────────────────────────────

// Records the job state at every Auth removal: Auth may only be removed by the
// party that currently owns the job (in_progress, live lease, at the auth step).
function guardAuthRemoval(store, h) {
  const removals = [];
  const original = h.deps.deleteAuthUser;
  h.deps.deleteAuthUser = async (uid) => {
    const job = (await store.get(`accountDeletions/${uid}`))?.data;
    removals.push({ status: job?.status, step: job?.currentStep, live: (job?.leaseUntil ?? 0) > h.now(), attemptId: job?.attemptId });
    return original(uid);
  };
  return removals;
}

async function failedAtAuth(store, h) {
  h.auth.fail = 1;
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps), (e) => e.step === 'auth');
  assert.equal(await h.deps.authUserExists(ME), true);
}

test('cron finalization: a retry that starts while cron is checking Auth is never undercut by cron Auth removal', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  await failedAtAuth(store, h);
  const removals = guardAuthRemoval(store, h);

  // The user's retry starts exactly while cron awaits the Auth lookup, and pauses mid-way.
  const exists = h.deps.authUserExists;
  const base = store.commit.bind(store);
  let retry, pauseRetry, releaseRetry;
  const retryPaused = new Promise((r) => { pauseRetry = r; });
  const retryGo = new Promise((r) => { releaseRetry = r; });
  let paused = false;
  h.deps.authUserExists = async (uid) => {
    if (!retry) {
      retry = deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
      retry.catch(() => {});
      store.commit = async (writes) => {
        if (!paused && writes.some((w) => !w.path.startsWith('accountDeletions/'))) { paused = true; pauseRetry(); await retryGo; }
        return base(writes);
      };
      await Promise.race([retryPaused, retry.then(() => {}, () => {})]);
    }
    return exists(uid);
  };

  await deletion.finalizePendingDeletions(h.deps);
  releaseRetry();
  await retry.catch(() => {});
  store.commit = base;
  h.deps.authUserExists = exists;
  await deletion.runScheduledMaintenance(h.deps); // finish whoever lost the race
  h.advance(LEASE_MS + 1);
  await deletion.runScheduledMaintenance(h.deps);

  assert.ok(removals.length >= 1);
  for (const r of removals) {
    assert.deepEqual([r.status, r.step, r.live], ['in_progress', 'auth', true], `Auth removed while job was ${JSON.stringify(r)}`);
  }
  assert.equal(await h.deps.authUserExists(ME), false);
  const job = (await store.get(`accountDeletions/${ME}`)).data;
  assert.deepEqual([job.status, job.pendingFinalization], ['completed', false]);
  await expectState(store, h);
});

test('cron finalization: concurrent cron runs remove Auth and finalize exactly once', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  await failedAtAuth(store, h);
  const removals = guardAuthRemoval(store, h);
  const exists = h.deps.authUserExists;
  h.deps.authUserExists = async (uid) => { await new Promise((r) => setTimeout(r, 20)); return exists(uid); };
  const results = await Promise.all([deletion.finalizePendingDeletions(h.deps), deletion.finalizePendingDeletions(h.deps), deletion.finalizePendingDeletions(h.deps)]);
  assert.equal(results.reduce((a, b) => a + b, 0), 1);
  assert.equal(removals.length, 1, 'Auth removed exactly once');
  assert.deepEqual([removals[0].status, removals[0].step, removals[0].live], ['in_progress', 'auth', true]);
  assert.equal((await store.get(`accountDeletions/${ME}`)).data.status, 'completed');
});

test('cron finalization holds a lease: a retry during recovery is refused, then succeeds after completion', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  await failedAtAuth(store, h);
  const exists = h.deps.authUserExists;
  let retryOutcome;
  h.deps.authUserExists = async (uid) => {
    retryOutcome = await deletion.deleteAccount({ uid: ME, email: null }, { ...h.deps, deleteAuthUser: async () => { throw new Error('retry must not remove Auth here'); } })
      .then(() => 'ran', (e) => e.name);
    return exists(uid);
  };
  assert.equal(await deletion.finalizePendingDeletions(h.deps), 1);
  assert.equal(retryOutcome, 'DeletionInProgress');
  h.deps.authUserExists = exists;
  assert.deepEqual(await deletion.deleteAccount({ uid: ME, email: null }, h.deps), { status: 'deleted' });
});

// ── Worker entry point ────────────────────────────────────────────────────────

const workerIndex = () => worker('index').default;

function fakeR2(keys = []) {
  const objects = new Set(keys);
  return {
    objects, puts: 0,
    async put(k) { this.puts++; objects.add(k); },
    async delete(k) { for (const key of [].concat(k)) objects.delete(key); },
    async list({ prefix }) { return { objects: [...objects].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }; },
  };
}

function multipart(token) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'p.jpg', { type: 'image/jpeg' }));
  return new Request('https://worker.test/upload/post-photo', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
}

test('entry point: uploads fail closed with 503 before storing when barrier credentials are missing or unusable', async () => {
  for (const secret of [undefined, '', '{"client_email":"x"}', 'not json']) {
    const bucket = fakeR2();
    const env = { R2_BUCKET: bucket, PUBLIC_R2_BASE_URL: 'https://cdn.test', FIREBASE_PROJECT_ID: PROJECT, FIREBASE_STORAGE_BUCKET: 'b', GOOGLE_SERVICE_ACCOUNT_JSON: secret };
    for (const path of ['/upload/post-photo', '/upload/profile-photo']) {
      const resp = await workerIndex().fetch(new Request(`https://worker.test${path}`, { method: 'POST', headers: { Authorization: 'Bearer any' }, body: new FormData() }), env);
      assert.deepEqual([resp.status, (await resp.json()).code, bucket.puts], [503, 'uploads/unavailable', 0], `${path} secret=${secret}`);
    }
  }
});

// Real ID-token signatures and service-account JWTs; Google endpoints are
// faked, Firestore REST goes to the emulator.
async function rsaKeys() {
  const algo = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const id = await crypto.subtle.generateKey(algo, true, ['sign', 'verify']);
  const sa = await crypto.subtle.generateKey(algo, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', id.publicKey)), kid: 'test-kid', alg: 'RS256', use: 'sig' };
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', sa.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  return { id, jwk, serviceAccount: JSON.stringify({ client_email: 'deleter@test.iam.gserviceaccount.com', private_key: pem }) };
}
async function idToken(keys, uid, authTime = Math.floor(Date.now() / 1000)) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const nowS = Math.floor(Date.now() / 1000);
  const data = `${enc({ alg: 'RS256', kid: 'test-kid', typ: 'JWT' })}.${enc({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, iat: nowS, exp: nowS + 3600, auth_time: authTime })}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.id.privateKey, new TextEncoder().encode(data));
  return `${data}.${Buffer.from(sig).toString('base64url')}`;
}
function installGoogleFakes(keys, { storageObjects, authUsers }) {
  const real = global.fetch;
  const state = { failFinalWrite: false, authDeletes: [] };
  global.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/')) return Response.json({ keys: [keys.jwk] });
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'sa-token', expires_in: 3600 });
    if (url.startsWith('https://firestore.googleapis.com/')) {
      if (state.failFinalWrite && url.endsWith(':commit') && init.body.includes('/accountDeletions/') && init.body.includes('"status":{"stringValue":"completed"}')) {
        return new Response('{"error":{"status":"UNAVAILABLE"}}', { status: 503 });
      }
      return real(url.replace('https://firestore.googleapis.com', `http://${EMULATOR_HOST}`), { ...init, headers: { ...init.headers, Authorization: 'Bearer owner' } });
    }
    if (url.startsWith('https://storage.googleapis.com/storage/v1/b/')) {
      const u = new URL(url);
      if (init.method === 'DELETE') { storageObjects.delete(decodeURIComponent(u.pathname.split('/o/')[1])); return new Response(null, { status: 204 }); }
      const prefix = u.searchParams.get('prefix');
      return Response.json({ items: [...storageObjects].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) });
    }
    if (url.startsWith('https://identitytoolkit.googleapis.com/')) {
      const body = JSON.parse(init.body);
      if (url.endsWith(':delete')) { state.authDeletes.push(body.localId); authUsers.delete(body.localId); return Response.json({}); }
      if (url.endsWith(':lookup')) return Response.json(authUsers.has(body.localId[0]) ? { users: [{ localId: body.localId[0] }] } : {});
    }
    return real(input, init);
  };
  return { state, restore: () => { global.fetch = real; } };
}

test('entry point: barrier read through Firestore REST blocks uploads; final-write failure is recovered by the cron', async () => {
  const keys = await rsaKeys();
  const store = await newStore(); await seed(store);
  const h = harness(store); // only for the expected media layout
  const bucket = fakeR2(h.r2.objects);
  const storageObjects = new Set(h.storage.objects);
  const authUsers = new Set([ME, BOB]);
  const fakes = installGoogleFakes(keys, { storageObjects, authUsers });
  const env = { R2_BUCKET: bucket, PUBLIC_R2_BASE_URL: 'https://cdn.test', FIREBASE_PROJECT_ID: PROJECT,
    FIREBASE_STORAGE_BUCKET: 'bucket', GOOGLE_SERVICE_ACCOUNT_JSON: keys.serviceAccount };
  try {
    // Uploads: allowed without a barrier, refused (nothing stored) with one.
    let resp = await workerIndex().fetch(multipart(await idToken(keys, BOB)), env);
    assert.equal(resp.status, 200);
    const stored = (await resp.json()).photoURL.replace('https://cdn.test/', '');
    bucket.objects.delete(stored);
    // CAROL's deletion is actively running elsewhere (live lease), so maintenance leaves it alone.
    await store.commit([{ kind: 'update', path: `accountDeletions/${CAROL}`, set: { uid: CAROL, status: 'in_progress', attemptId: 'elsewhere', leaseUntil: Date.now() + 60 * 60 * 1000 }, mustExist: false }]);
    const puts = bucket.puts;
    resp = await workerIndex().fetch(multipart(await idToken(keys, CAROL)), env);
    assert.deepEqual([resp.status, (await resp.json()).code, bucket.puts], [403, 'account/deletion-in-progress', puts]);

    // Deletion through the entry point; the final job write is lost.
    fakes.state.failFinalWrite = true;
    resp = await workerIndex().fetch(new Request('https://worker.test/account/delete', { method: 'POST', headers: { Authorization: `Bearer ${await idToken(keys, ME)}` } }), env);
    assert.deepEqual([resp.status, await resp.json()], [200, { status: 'deleted' }]);
    assert.deepEqual(fakes.state.authDeletes, [ME]);
    let job = (await store.get(`accountDeletions/${ME}`)).data;
    assert.deepEqual([job.status, job.pendingFinalization], ['in_progress', true]);

    // The dead attempt's lease lapses (time passes before the next cron run);
    // a late upload lands; the deleted user never signs in again.
    await store.commit([{ kind: 'update', path: `accountDeletions/${ME}`, set: { leaseUntil: Date.now() - 1 } }]);
    bucket.objects.add(`post_photos/${ME}/late.jpg`);
    storageObjects.add(`journals/${ME}/t1/late.jpg`);
    fakes.state.failFinalWrite = false;
    const waits = [];
    await workerIndex().scheduled({}, env, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    job = (await store.get(`accountDeletions/${ME}`)).data;
    assert.deepEqual([job.status, job.pendingFinalization, job.recoveredBy], ['completed', false, 'scheduled-finalization']);
    assert.deepEqual(fakes.state.authDeletes, [ME], 'Auth already gone; not deleted twice');
    await expectState(store, { r2: { objects: bucket.objects }, storage: { objects: storageObjects } });
  } finally {
    fakes.restore();
  }
}, 'emulator');

// ── Stalled deletions complete without the user ───────────────────────────────

test('a deletion that failed mid-way (e.g. out of Worker subrequests) is finished by the cron', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  h.r2.failNext = 1; // stands in for "Too many subrequests" / any mid-plan failure
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps), (e) => e.step === 'r2Media');
  assert.equal(h.authCalls.length, 0);
  assert.deepEqual(await deletion.runScheduledMaintenance(h.deps), { finalized: 0, resumed: 1, swept: 1 });
  assert.equal(await h.deps.authUserExists(ME), false, 'completed without the user signing in again');
  await expectState(store, h);
});

test('cron resumes an attempt whose lease lapsed mid-plan, but never one with a live lease', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const base = store.commit.bind(store);
  let stalled = false;
  store.commit = async (writes) => {
    if (!stalled && writes.some((w) => w.path.startsWith('follows/'))) { stalled = true; h.advance(LEASE_MS + 1); }
    return base(writes);
  };
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps), deletion.DeletionAttemptLost);
  store.commit = base;
  // A different account mid-deletion under a live lease must be left alone.
  await store.commit([{ kind: 'update', path: `accountDeletions/${BOB}`, mustExist: false,
    set: { uid: BOB, status: 'in_progress', attemptId: 'other', leaseUntil: h.now() + LEASE_MS } }]);
  const result = await deletion.runScheduledMaintenance(h.deps);
  assert.equal(result.resumed, 1);
  assert.equal((await store.get(`accountDeletions/${BOB}`)).data.attemptId, 'other');
  assert.ok(await store.get(`users/${BOB}`));
  await expectState(store, h);
});

// ── Google Play web deletion resource and operator fulfilment ─────────────────

test('entry point: GET /account-deletion serves the web deletion request page', async () => {
  const resp = await workerIndex().fetch(new Request('https://worker.test/account-deletion'), { R2_BUCKET: fakeR2(), FIREBASE_PROJECT_ID: PROJECT });
  const html = await resp.text();
  assert.equal(resp.status, 200);
  assert.match(resp.headers.get('Content-Type'), /text\/html/);
  for (const needle of ['SoloTravelSoul', 'mailto:privacy@solotravelsoul.app', 'Delete account', 'What is deleted', 'What is kept']) {
    assert.ok(html.includes(needle), needle);
  }
}, 'memory');

test('entry point: operator deletion endpoint is disabled without a token and rejects bad tokens or input', async () => {
  const req = (auth, body) => new Request('https://worker.test/admin/account-deletion', {
    method: 'POST', headers: auth ? { Authorization: auth, 'Content-Type': 'application/json' } : {}, body: JSON.stringify(body ?? { uid: ME }),
  });
  const env = (token, secret) => ({ R2_BUCKET: fakeR2(), FIREBASE_PROJECT_ID: PROJECT, FIREBASE_STORAGE_BUCKET: 'b', ADMIN_DELETION_TOKEN: token, GOOGLE_SERVICE_ACCOUNT_JSON: secret });
  assert.equal((await workerIndex().fetch(req('Bearer anything'), env(undefined))).status, 404);
  assert.equal((await workerIndex().fetch(req('Bearer wrong-token'), env('right-token'))).status, 403);
  assert.equal((await workerIndex().fetch(req(null), env('right-token'))).status, 403);
  assert.equal((await workerIndex().fetch(req('Bearer right-token', { uid: '../users' }), env('right-token'))).status, 400);
  assert.equal((await workerIndex().fetch(req('Bearer right-token'), env('right-token'))).status, 503, 'no deletion credentials');
}, 'memory');

test('entry point: operator deletion fulfils a web request with the full plan', async () => {
  const keys = await rsaKeys();
  const store = await newStore(); await seed(store);
  const h = harness(store);
  const bucket = fakeR2(h.r2.objects);
  const storageObjects = new Set(h.storage.objects);
  const authUsers = new Set([ME, BOB]);
  const fakes = installGoogleFakes(keys, { storageObjects, authUsers });
  const env = { R2_BUCKET: bucket, PUBLIC_R2_BASE_URL: 'https://cdn.test', FIREBASE_PROJECT_ID: PROJECT, FIREBASE_STORAGE_BUCKET: 'bucket',
    GOOGLE_SERVICE_ACCOUNT_JSON: keys.serviceAccount, ADMIN_DELETION_TOKEN: 'operator-secret' };
  try {
    const resp = await workerIndex().fetch(new Request('https://worker.test/admin/account-deletion', {
      method: 'POST', headers: { Authorization: 'Bearer operator-secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: ME }),
    }), env);
    assert.deepEqual([resp.status, await resp.json()], [200, { status: 'deleted', uid: ME }]);
    assert.deepEqual(fakes.state.authDeletes, [ME]);
    await expectState(store, { r2: { objects: bucket.objects }, storage: { objects: storageObjects } });
  } finally {
    fakes.restore();
  }
}, 'emulator');

// ── Client and store-policy regressions ───────────────────────────────────────

test('client: photo picking never requests broad media-library permission (Play photo policy)', async () => {
  let permissionRequested = false;
  const picker = mobile('apps/mobile/utils/imageUtils.ts', {
    'expo-image-picker': {
      requestMediaLibraryPermissionsAsync: async () => { permissionRequested = true; return { status: 'denied' }; },
      launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///picked.jpg' }] }),
    },
    'expo-image-manipulator': {},
  });
  assert.equal(await picker.pickImageFromLibrary(), 'file:///picked.jpg');
  assert.equal(permissionRequested, false);
}, 'memory');

test('client: blocked users\' posts, journals and comments are hidden', async () => {
  let blocked = [BOB];
  const filter = mobile('apps/mobile/hooks/useWithoutBlocked.ts', {
    react: { useMemo: (f) => f() },
    '@/stores/blockStore': { useBlockStore: (sel) => sel({ blockedUids: blocked }) },
  });
  const items = [{ authorId: BOB, id: 1 }, { authorId: CAROL, id: 2 }];
  assert.deepEqual(filter.useWithoutBlocked(items).map((i) => i.id), [2]);
  blocked = [];
  assert.equal(filter.useWithoutBlocked(items).length, 2);
}, 'memory');

test('store config: restricted Android permissions blocked, release builds auto-increment', async () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/app.json'), 'utf8')).expo;
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/eas.json'), 'utf8'));
  for (const p of ['READ_MEDIA_IMAGES', 'READ_EXTERNAL_STORAGE', 'SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM', 'RECORD_AUDIO']) {
    assert.ok(!app.android.permissions.includes(`android.permission.${p}`), p);
    assert.ok(app.android.blockedPermissions.includes(`android.permission.${p}`), `${p} blocked`);
  }
  assert.equal(eas.build.production.autoIncrement, true);
  assert.equal(eas.build.production.environment, 'production');
  assert.equal(app.ios.config.usesNonExemptEncryption, false);
}, 'memory');

(async () => {
  let passed = 0;
  const only = tests.filter((t) => !t.only || t.only === (EMULATOR ? 'emulator' : 'memory'));
  for (const t of only) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); }
    catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${only.length} account deletion checks passed (${EMULATOR ? 'Firestore emulator' : 'in-memory store'})`);
})();
