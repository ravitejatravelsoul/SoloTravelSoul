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
const { LegacyMediaInaccessible } = worker('objectStores');
const deletion = worker('accountDeletion');
const route = worker('accountRoute');
const authMod = worker('auth');
const DELETED = deletion.DELETED_NAME;
const { d1Fake, kvFake } = require('./lib/fakes.cjs');

// ── In-memory DocStore with Firestore commit semantics ───────────────────────

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
class MemoryStore {
  constructor() { this.docs = new Map(); this.clock = 0; }
  async get(p) { const d = this.docs.get(p); return d ? { path: p, data: clone(d.data), updateTime: d.updateTime } : null; }
  async getMany(ps) { return Promise.all(ps.map((p) => this.get(p))); }
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
    const ineq = filters.find((f) => f.op === 'GREATER_THAN');
    const key = (doc) => [ineq ? doc.data[ineq.field] : 0, doc.path];
    const cmp = (a, b) => { const [x, y] = [key(a), key(b)]; return x[0] !== y[0] ? (x[0] < y[0] ? -1 : 1) : x[1].localeCompare(y[1]); };
    out.sort(cmp);
    const after = opts.startAfter ? { path: opts.startAfter.path, data: opts.startAfter.data ?? {} } : null;
    const rest = after ? out.filter((d) => cmp(d, after) > 0) : out;
    return opts.limit ? rest.slice(0, opts.limit) : rest;
  }
  async listDocumentIds(col, opts = {}) {
    const ids = new Set();
    for (const p of this.docs.keys()) if (p.startsWith(col + '/')) ids.add(p.slice(col.length + 1).split('/')[0]);
    const sorted = [...ids].sort();
    return opts.limit ? sorted.slice(0, opts.limit) : sorted;
  }
  async listCollectionIds(docPath, opts = {}) {
    const ids = new Set();
    for (const p of this.docs.keys()) if (p.startsWith(docPath + '/')) ids.add(p.slice(docPath.length + 1).split('/')[0]);
    const sorted = [...ids].sort();
    return opts.limit ? sorted.slice(0, opts.limit) : sorted;
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
    inaccessible: false,
    bucketMissing: false,
    async bucketExists(before) { await before?.(); this.gate(); return !this.bucketMissing; },
    gate() { if (this.inaccessible) throw new LegacyMediaInaccessible(name, 403); },
    async deletePrefixes(prefixes, beforePage) {
      await beforePage?.();
      this.gate();
      if (this.bucketMissing) throw new LegacyMediaInaccessible(name, 404);
      if (this.failNext > 0) { this.failNext--; throw new Error(`${name} unavailable`); }
      let n = 0;
      for (const k of [...objects]) if (prefixes.some((p) => k.startsWith(p))) { objects.delete(k); n++; }
      return n;
    },
    async deleteObjects(names, before) {
      await before?.(); this.gate();
      let n = 0;
      for (const k of names) if (objects.delete(k)) n++;
      return n;
    },
    async verifyAbsent(prefixes, names, before) {
      await before?.(); this.gate();
      return ![...objects].some((k) => prefixes.some((p) => k.startsWith(p)) || names.includes(k));
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
  const storage = fakeMedia('firebase-storage', [`profile_photos/${ME}/a.jpg`, `trip_covers/${ME}/t1.jpg`, `journals/${ME}/t1/e.jpg`, `trip_covers/${BOB}/t.jpg`,
    `profile_images/${ME}.jpg`, `profile_images/${BOB}.jpg`]); // profile_images/{uid}.jpg: earlier Swift app
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
  // KV media + D1 index are always bound: missing bindings block deletion (never proof of no media).
  const media = { db: d1Fake(), kv: kvFake() };
  const deps = { store, r2, firebaseStorage: storage, media, deleteAuthUser: (uid) => auth.del(uid), now: () => now,
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
  assert.deepEqual([...h.storage.objects].sort(), [`profile_images/${BOB}.jpg`, `trip_covers/${BOB}/t.jpg`]);
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
  assert.deepEqual(await deletion.runScheduledMaintenance(h.deps), { finalized: 0, resumed: 0, swept: 1, stalled: 0, budgetLimited: false });
  h.advance(LEASE_MS + 1);
  assert.deepEqual(await deletion.runScheduledMaintenance(h.deps), { finalized: 1, resumed: 0, swept: 1, stalled: 0, budgetLimited: false });
  job = (await store.get(`accountDeletions/${ME}`)).data;
  assert.deepEqual([job.status, job.pendingFinalization, job.recoveredBy], ['completed', false, 'scheduled-finalization']);
  assert.equal(h.authCalls.length, 1, 'no second Auth removal needed');
  await expectState(store, h);
  assert.deepEqual(await deletion.runScheduledMaintenance(h.deps), { finalized: 0, resumed: 0, swept: 1, stalled: 0, budgetLimited: false }, 'idempotent');
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

/** KV media + D1 index bindings for Worker env objects (deletion requires them). */
function mediaBindings() {
  const kv = kvFake();
  return { MEDIA_DB: d1Fake(), MEDIA_KV: { get: (k) => kv.get(k), put: (k, v) => kv.put(k, v), delete: (k) => kv.delete(k) } };
}

function multipart(token) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'p.jpg', { type: 'image/jpeg' }));
  return new Request('https://worker.test/upload/post-photo', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
}

test('entry point: uploads fail closed with 503 before storing when barrier credentials are missing or unusable', async () => {
  for (const secret of [undefined, '', '{"client_email":"x"}', 'not json']) {
    const bucket = fakeR2();
    const env = { ...mediaBindings(), R2_BUCKET: bucket, PUBLIC_R2_BASE_URL: 'https://cdn.test', FIREBASE_PROJECT_ID: PROJECT, FIREBASE_STORAGE_BUCKET: 'b', GOOGLE_SERVICE_ACCOUNT_JSON: secret };
    for (const path of ['/upload/post-photo', '/upload/profile-photo']) {
      const resp = await workerIndex().fetch(new Request(`https://worker.test${path}`, { method: 'POST', headers: { Authorization: 'Bearer any' }, body: new FormData() }), env);
      assert.deepEqual([resp.status, (await resp.json()).code, bucket.puts], [503, 'uploads/unavailable', 0], `${path} secret=${secret}`);
    }
  }
});

// Real ID-token signatures and service-account JWTs; Google endpoints are
// faked, Firestore REST goes to the emulator.
// The Worker caches Google's JWKS per isolate, so every test signs with one key set.
let cachedKeys;
async function rsaKeys() {
  if (cachedKeys) return cachedKeys;
  cachedKeys = await makeRsaKeys();
  return cachedKeys;
}
async function makeRsaKeys() {
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
  const state = { failFinalWrite: false, authDeletes: [], fetches: 0, bucketMissing: false, storageDenied: false, failListPrefix: null };
  global.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    state.fetches++; // every outbound call is a Workers subrequest
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
      if (state.storageDenied) return new Response('{"error":{"code":403}}', { status: 403 });
      if (state.bucketMissing) return new Response('{"error":{"code":404}}', { status: 404 });
      if (!u.pathname.includes('/o')) return Response.json({ name: 'bucket' }); // bucket metadata
      if (state.failListPrefix && u.searchParams.get('prefix') === state.failListPrefix) {
        state.failListPrefix = null;
        return new Response('{"error":{"code":503}}', { status: 503 });
      }
      const objectName = u.pathname.includes('/o/') ? decodeURIComponent(u.pathname.split('/o/')[1]) : null;
      if (init.method === 'DELETE') return new Response(null, { status: storageObjects.delete(objectName) ? 204 : 404 });
      if (objectName !== null) return storageObjects.has(objectName) ? Response.json({ name: objectName }) : new Response(null, { status: 404 });
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
  const env = { ...mediaBindings(), R2_BUCKET: bucket, PUBLIC_R2_BASE_URL: 'https://cdn.test', FIREBASE_PROJECT_ID: PROJECT,
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
    const token = await idToken(keys, ME);
    let slices = 0;
    for (; slices < 60;) {
      const before = fakes.state.fetches;
      resp = await workerIndex().fetch(new Request('https://worker.test/account/delete', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }), env);
      assert.ok(fakes.state.fetches - before <= 50, `invocation made ${fakes.state.fetches - before} subrequests`);
      slices++;
      if (resp.status !== 202) break;
      assert.notEqual((await resp.clone().json()).status, 'blocked', 'deletion must not be blocked here');
      assert.equal(fakes.state.authDeletes.length, 0);
    }
    assert.deepEqual([resp.status, await resp.json()], [200, { status: 'deleted' }]);
    assert.ok(slices > 1, 'bounded slices through the real adapters');
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
    const beforeCron = fakes.state.fetches;
    await workerIndex().scheduled({}, env, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    assert.ok(fakes.state.fetches - beforeCron <= 50, `cron made ${fakes.state.fetches - beforeCron} subrequests`);
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
  assert.deepEqual(await deletion.runScheduledMaintenance(h.deps), { finalized: 0, resumed: 1, swept: 1, stalled: 0, budgetLimited: false });
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
  const env = { ...mediaBindings(), R2_BUCKET: bucket, PUBLIC_R2_BASE_URL: 'https://cdn.test', FIREBASE_PROJECT_ID: PROJECT, FIREBASE_STORAGE_BUCKET: 'bucket',
    GOOGLE_SERVICE_ACCOUNT_JSON: keys.serviceAccount, ADMIN_DELETION_TOKEN: 'operator-secret' };
  try {
    let resp;
    for (let i = 0; i < 40; i++) {
      const before = fakes.state.fetches;
      resp = await workerIndex().fetch(new Request('https://worker.test/admin/account-deletion', {
        method: 'POST', headers: { Authorization: 'Bearer operator-secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: ME }),
      }), env);
      assert.ok(fakes.state.fetches - before <= 50);
      if (resp.status !== 202) break;
      assert.equal((await resp.json()).uid, ME);
    }
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

// ── Recovery identity and pending group membership ───────────────────────────

test('cron recovery with no token email still removes the verified-email alias the UID owns', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  // Verified Auth email differs from the stale emails stored in users/ and userLookup/.
  await store.commit([{ kind: 'update', path: 'userLookupByEmail/alice-verified@example.test', mustExist: false,
    set: { uid: ME, email: 'alice-verified@example.test' } }]);
  // First attempt (with the verified token email) fails before the directory step.
  const query = store.query.bind(store);
  let failed = false;
  store.query = async (collectionId, ...rest) => {
    if (!failed && collectionId === 'notifications') { failed = true; throw new Error('backend unavailable'); }
    return query(collectionId, ...rest);
  };
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: 'alice-verified@example.test' }, h.deps), (e) => e.step === 'notifications');
  store.query = query;
  // Cron resumes without any token email.
  const result = await deletion.runScheduledMaintenance(h.deps);
  assert.equal(result.resumed, 1);
  assert.equal((await store.get(`accountDeletions/${ME}`)).data.status, 'completed');
  assert.equal(await store.get('userLookupByEmail/alice-verified@example.test'), null, 'verified alias removed');
  assert.equal((await store.get('userLookupByEmail/old-alice@example.test')).data.uid, BOB, "another account's alias kept");
  await expectState(store, h);
});

test("deletion removes the user from other users' pending groups, preserving the group and its members", async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  await store.commit([{ kind: 'update', path: 'groups/bobPending', mustExist: false, set: {
    name: 'Bob trip', createdBy: BOB, members: [BOB], pendingMembers: [ME, CAROL],
    memberInfo: { [BOB]: { name: 'Bob', initials: 'B' }, [ME]: { name: 'Alice', initials: 'A' }, [CAROL]: { name: 'Carol', initials: 'C' } },
    unreadCounts: { [BOB]: 0, [ME]: 0, [CAROL]: 0 }, lastMessage: null,
  } }]);
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  const g = (await store.get('groups/bobPending')).data;
  assert.deepEqual(g.members, [BOB]);
  assert.deepEqual(g.pendingMembers, [CAROL]);
  assert.equal(g.memberInfo[ME], undefined);
  assert.equal(g.unreadCounts[ME], undefined);
  assert.equal(g.memberInfo[CAROL].name, 'Carol');
  await expectState(store, h);
});

test('pending-group cleanup is retry-safe and tolerates a concurrent group change', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  await store.commit([{ kind: 'update', path: 'groups/bobPending', mustExist: false, set: {
    name: 'Bob trip', createdBy: BOB, members: [BOB], pendingMembers: [ME, CAROL],
    memberInfo: { [BOB]: { name: 'Bob' }, [ME]: { name: 'Alice' }, [CAROL]: { name: 'Carol' } }, unreadCounts: { [BOB]: 0, [ME]: 0, [CAROL]: 0 },
  } }]);
  // The creator's client resumes concurrently: Carol is added just before the cleanup commit.
  const base = store.commit.bind(store);
  let raced = false;
  store.commit = async (writes) => {
    if (!raced && writes.some((w) => w.path === 'groups/bobPending')) {
      raced = true;
      const g = (await store.get('groups/bobPending')).data;
      await base([{ kind: 'update', path: 'groups/bobPending', set: { members: [...g.members, CAROL], pendingMembers: g.pendingMembers.filter((m) => m !== CAROL) } }]);
    }
    return base(writes);
  };
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  store.commit = base;
  const g = (await store.get('groups/bobPending')).data;
  assert.deepEqual([g.members, g.pendingMembers], [[BOB, CAROL], []]);
  assert.equal(g.memberInfo[ME], undefined);
  assert.equal(g.memberInfo[CAROL].name, 'Carol');
});

// ── Stalled-deletion reporting ────────────────────────────────────────────────

test('deletions stuck past the threshold are reported (cron warning + operator status), others are not', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  h.r2.failNext = 1000; // persistent outage: every attempt fails at the media step
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps));
  const warnings = [];
  const warn = console.warn;
  console.warn = (msg) => warnings.push(msg);
  try {
    let result = await deletion.runScheduledMaintenance(h.deps);
    assert.deepEqual([result.resumed, result.stalled], [0, 0], 'young failures are retried, not reported');
    h.advance(deletion.STALLED_AFTER_MS + 60_000);
    result = await deletion.runScheduledMaintenance(h.deps);
    assert.equal(result.stalled, 1);
  } finally {
    console.warn = warn;
  }
  const event = JSON.parse(warnings.find((w) => w.includes('account_deletion_stalled')));
  assert.deepEqual([event.count, event.jobs[0].uid, event.jobs[0].lastErrorStep], [1, ME, 'r2Media']);
  assert.ok(!JSON.stringify(event).includes('alice@'), 'no email in the report');

  // Operator status endpoint (same admin token as operator deletion).
  const status = (auth) => route.handleAdminDeletionStatus(new Request('https://worker.test/admin/deletion-status', { headers: auth ? { Authorization: auth } : {} }),
    { adminToken: 'ops', deletion: () => h.deps, json });
  assert.equal((await status('Bearer wrong')).status, 403);
  const ok = await status('Bearer ops');
  const body = await ok.json();
  assert.deepEqual([ok.status, body.count, body.stalled[0].uid, body.stalled[0].status], [200, 1, ME, 'failed']);
  assert.equal((await route.handleAdminDeletionStatus(new Request('https://w/admin/deletion-status'), { adminToken: undefined, deletion: () => h.deps, json })).status, 404);
});

// ── Moderation media removal and suspension through the Worker entry point ────

test('entry point: moderators delete the media of removed posts; others cannot; suspended users cannot upload', async () => {
  const keys = await rsaKeys();
  const store = await newStore(); await seed(store);
  const bucket = fakeR2([`post_photos/${BOB}/y.jpg`, `post_photos/${CAROL}/z.jpg`, `post_photos/${BOB}/keep.jpg`]);
  const fakes = installGoogleFakes(keys, { storageObjects: new Set(), authUsers: new Set([ME, BOB, CAROL]) });
  const env = { ...mediaBindings(), R2_BUCKET: bucket, PUBLIC_R2_BASE_URL: 'https://cdn.test', FIREBASE_PROJECT_ID: PROJECT, FIREBASE_STORAGE_BUCKET: 'bucket', GOOGLE_SERVICE_ACCOUNT_JSON: keys.serviceAccount };
  const seedDoc = (p, data) => store.commit([{ kind: 'update', path: p, set: data, mustExist: false }]);
  await seedDoc('moderators/mod', { grantedBy: 'console' });
  await seedDoc('travelPosts/removedPost', { authorId: BOB, visibility: 'removed', images: [`https://cdn.test/post_photos/${BOB}/y.jpg`, `https://cdn.test/post_photos/${CAROL}/z.jpg`, 'https://elsewhere.test/x.jpg'] });
  await seedDoc('travelPosts/livePost', { authorId: BOB, visibility: 'public', images: [`https://cdn.test/post_photos/${BOB}/keep.jpg`] });
  const call = async (uid, body) => {
    const resp = await workerIndex().fetch(new Request('https://worker.test/moderation/remove-media', {
      method: 'POST', headers: { Authorization: `Bearer ${await idToken(keys, uid)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), env);
    return { status: resp.status, body: await resp.json() };
  };
  try {
    assert.equal((await call(CAROL, { targetType: 'post', targetId: 'removedPost' })).status, 403, 'not a moderator');
    assert.equal((await call('mod', { targetType: 'post', targetId: 'livePost' })).status, 409, 'must be removed first');
    assert.equal((await call('mod', { targetType: 'post', targetId: '../x' })).status, 400);
    const ok = await call('mod', { targetType: 'post', targetId: 'removedPost' });
    assert.deepEqual([ok.status, ok.body.removed], [200, 1]);
    assert.deepEqual([...bucket.objects].sort(), [`post_photos/${BOB}/keep.jpg`, `post_photos/${CAROL}/z.jpg`], "only the author's own prefix");
    // Only the claimed (author-owned) URLs are dropped from the document.
    assert.deepEqual((await store.get('travelPosts/removedPost')).data.images, [`https://cdn.test/post_photos/${CAROL}/z.jpg`, 'https://elsewhere.test/x.jpg']);

    // Suspended account: uploads refused before storing.
    await seedDoc(`accountSuspensions/${CAROL}`, { suspendedBy: 'mod', reason: 'test' });
    const puts = bucket.puts;
    const up = await workerIndex().fetch(multipart(await idToken(keys, CAROL)), env);
    assert.deepEqual([up.status, bucket.puts], [403, puts]);
  } finally {
    fakes.restore();
  }
}, 'emulator');

// ── Moderation media removal: caller barriers, removal/restore race, retries ──

const modRoute = worker('moderationRoute');
const CDN = 'https://cdn.test';

async function mediaFixture() {
  const store = await newStore();
  const seedDoc = (p, data) => store.commit([{ kind: 'update', path: p, set: data, mustExist: false }]);
  await seedDoc('moderators/mod', { grantedBy: 'console' });
  await seedDoc('moderators/mod2', { grantedBy: 'console' });
  await seedDoc('travelPosts/rp', { authorId: BOB, visibility: 'removed', images: [`${CDN}/post_photos/${BOB}/a.jpg`, `${CDN}/post_photos/${BOB}/b.jpg`] });
  await seedDoc('travelJournals/rj', { authorId: BOB, visibility: 'removed', images: [`${CDN}/post_photos/${BOB}/j.jpg`], coverImageURL: `${CDN}/post_photos/${BOB}/cover.jpg` });
  const bucket = fakeR2([`post_photos/${BOB}/a.jpg`, `post_photos/${BOB}/b.jpg`, `post_photos/${BOB}/j.jpg`, `post_photos/${BOB}/cover.jpg`, `post_photos/${BOB}/new.jpg`]);
  let now = Date.now();
  const deps = (uid, extra = {}) => ({
    verify: async () => ({ uid, email: null, authTime: 0 }), store, bucket, publicBaseUrl: CDN, json, now: () => now, ...extra,
  });
  const call = async (uid, body, extra) => {
    const resp = await modRoute.handleRemoveMedia(new Request('https://w/moderation/remove-media', {
      method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body),
    }), deps(uid, extra));
    return { status: resp.status, body: await resp.json() };
  };
  return { store, seedDoc, bucket, call, advance: (ms) => { now += ms; } };
}

test('remove-media: suspended or deleting moderators are refused before anything is deleted', async () => {
  const f = await mediaFixture();
  await f.seedDoc('accountSuspensions/mod', { suspendedBy: 'owner', reason: 'abuse' });
  assert.equal((await f.call('mod', { targetType: 'post', targetId: 'rp' })).status, 403);
  await f.seedDoc('accountDeletions/mod2', { uid: 'mod2', status: 'in_progress' });
  assert.equal((await f.call('mod2', { targetType: 'post', targetId: 'rp' })).status, 403);
  assert.equal(f.bucket.objects.size, 5, 'nothing deleted');
  assert.equal((await f.store.get('travelPosts/rp')).data.images.length, 2);
});

test('remove-media: an unreadable caller barrier fails closed', async () => {
  const f = await mediaFixture();
  const s = f.store;
  const failingStore = {
    get: async (p) => { if (p.startsWith('accountSuspensions/') || p.startsWith('accountDeletions/')) throw new Error('firestore down'); return s.get(p); },
    query: (...a) => s.query(...a), listDocumentIds: (c) => s.listDocumentIds(c), listCollectionIds: (d) => s.listCollectionIds(d), commit: (w) => s.commit(w),
  };
  const r = await f.call('mod', { targetType: 'post', targetId: 'rp' }, { store: failingStore });
  assert.equal(r.status, 503);
  assert.equal(f.bucket.objects.size, 5, 'nothing deleted');
});

test('remove-media: a restore with new images during object deletion is never undone', async () => {
  const f = await mediaFixture();
  const realDelete = f.bucket.delete.bind(f.bucket);
  let restored = false;
  f.bucket.delete = async (keys) => {
    // Another moderator restores the post and the author attaches a new photo
    // while the objects are being deleted (Admin write: bypasses rules).
    restored = true;
    await f.store.commit([{ kind: 'update', path: 'travelPosts/rp', set: { visibility: 'public', images: [`${CDN}/post_photos/${BOB}/new.jpg`] } }]);
    return realDelete(keys);
  };
  const r = await f.call('mod', { targetType: 'post', targetId: 'rp' });
  assert.ok(restored);
  assert.equal(r.status, 200);
  const post = (await f.store.get('travelPosts/rp')).data;
  assert.deepEqual([post.visibility, post.images], ['public', [`${CDN}/post_photos/${BOB}/new.jpg`]], 'restored content kept');
  assert.ok(f.bucket.objects.has(`post_photos/${BOB}/new.jpg`), 'new photo object kept');
  assert.ok(!f.bucket.objects.has(`post_photos/${BOB}/a.jpg`));
});

test('remove-media: a restore committed before the claim prevents any deletion', async () => {
  const f = await mediaFixture();
  const get = f.store.get.bind(f.store);
  let raced = false;
  f.store.get = async (p) => {
    const d = await get(p);
    if (!raced && p === 'travelPosts/rp') {
      raced = true;
      await f.store.commit([{ kind: 'update', path: 'travelPosts/rp', set: { visibility: 'public' } }]);
    }
    return d;
  };
  const r = await f.call('mod', { targetType: 'post', targetId: 'rp' });
  f.store.get = get;
  assert.equal(r.status, 409);
  assert.equal(f.bucket.objects.size, 5, 'nothing deleted');
});

test('remove-media: interrupted removal is retried safely after its lease; journals include the cover', async () => {
  const f = await mediaFixture();
  const realDelete = f.bucket.delete.bind(f.bucket);
  f.bucket.delete = async () => { throw new Error('R2 unavailable'); };
  assert.equal((await f.call('mod', { targetType: 'journal', targetId: 'rj' })).status, 500);
  f.bucket.delete = realDelete;
  assert.equal((await f.call('mod2', { targetType: 'journal', targetId: 'rj' })).status, 409, 'claimed removal still leased');
  f.advance(10 * 60_000);
  const r = await f.call('mod2', { targetType: 'journal', targetId: 'rj' });
  assert.deepEqual([r.status, r.body.removed], [200, 2]);
  const j = (await f.store.get('travelJournals/rj')).data;
  assert.deepEqual([j.images, j.coverImageURL, j.mediaRemoval.state], [[], null, 'done']);
  assert.ok(!f.bucket.objects.has(`post_photos/${BOB}/cover.jpg`));
  assert.deepEqual((await f.call('mod', { targetType: 'journal', targetId: 'rj' })).body.removed, 0, 'repeat is a no-op');
});

test('remove-media + real rules: a moderator restore during object deletion is refused, then allowed once finished', async () => {
  const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
  const sdk = require('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId: PROJECT,
    firestore: { host: '127.0.0.1', port: 8188, rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8') } });
  try {
    const f = await mediaFixture();
    const modDb = env.authenticatedContext('mod2').firestore();
    const restore = () => sdk.updateDoc(sdk.doc(modDb, 'travelPosts/rp'), { visibility: 'public', reportCount: 0, moderatedBy: 'mod2', moderatedAt: sdk.serverTimestamp() });
    const realDelete = f.bucket.delete.bind(f.bucket);
    let tried = false;
    f.bucket.delete = async (keys) => { tried = true; await assertFails(restore()); return realDelete(keys); };
    const r = await f.call('mod', { targetType: 'post', targetId: 'rp' }, { now: Date.now });
    assert.ok(tried);
    assert.deepEqual([r.status, r.body.removed], [200, 2]);
    await restore(); // lease released on completion
    const post = (await f.store.get('travelPosts/rp')).data;
    assert.deepEqual([post.visibility, post.images, post.mediaRemoval.state], ['public', [], 'done']);
  } finally {
    await env.cleanup();
  }
}, 'emulator');

test("account deletion still removes the user's moderated (under_review / removed) posts and journals", async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  for (const [p, v] of [['travelPosts/aliceHeld', 'under_review'], ['travelJournals/aliceRemoved', 'removed']]) {
    await store.commit([{ kind: 'update', path: p, mustExist: false, set: { authorId: ME, visibility: v, reportCount: 3 } }]);
  }
  await deletion.deleteAccount({ uid: ME, email: 'alice@example.test' }, h.deps);
  assert.equal(await store.get('travelPosts/aliceHeld'), null);
  assert.equal(await store.get('travelJournals/aliceRemoved'), null);
  await expectState(store, h);
});

// ── Removal lease expiry: restores wait for a terminal state ─────────────────

const removalTargets = [['post', 'travelPosts/rp', 'rp'], ['journal', 'travelJournals/rj', 'rj']];

for (const [type, docPath, id] of removalTargets) {
  test(`remove-media + real rules (${type}): deletion outlasting its lease still blocks restore until done`, async () => {
    const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
    const sdk = require('firebase/firestore');
    const env = await initializeTestEnvironment({ projectId: PROJECT,
      firestore: { host: '127.0.0.1', port: 8188, rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8') } });
    try {
      const f = await mediaFixture();
      const modDb = env.authenticatedContext('mod2').firestore();
      const restore = () => sdk.updateDoc(sdk.doc(modDb, docPath), { visibility: 'public', reportCount: 0, moderatedBy: 'mod2', moderatedAt: sdk.serverTimestamp() });
      const realDelete = f.bucket.delete.bind(f.bucket);
      let tried = false;
      f.bucket.delete = async (keys) => {
        // The claim's lease has already expired in real time (claimed with a clock 10 min behind).
        tried = true;
        await assertFails(restore());
        return realDelete(keys);
      };
      const lagging = () => Date.now() - 10 * 60_000;
      const r = await f.call('mod', { targetType: type, targetId: id }, { now: lagging });
      assert.ok(tried);
      assert.equal(r.status, 200);
      await restore(); // terminal state reached: restore allowed
      const doc = (await f.store.get(docPath)).data;
      assert.deepEqual([doc.visibility, doc.mediaRemoval.state], ['public', 'done']);
    } finally {
      await env.cleanup();
    }
  }, 'emulator');

  test(`remove-media (${type}): takeover after lease expiry completes; the stale run cannot touch restored content`, async () => {
    const f = await mediaFixture();
    const realDelete = f.bucket.delete.bind(f.bucket);
    let releaseStale, staleEntered;
    const staleGate = new Promise((r) => { releaseStale = r; });
    const entered = new Promise((r) => { staleEntered = r; });
    let first = true;
    f.bucket.delete = async (keys) => {
      if (first) { first = false; staleEntered(); await staleGate; } // run A stalls mid-delete
      return realDelete(keys);
    };
    const runA = f.call('mod', { targetType: type, targetId: id });
    await entered;
    assert.equal((await f.call('mod2', { targetType: type, targetId: id })).status, 409, 'lease still live');
    f.advance(10 * 60_000);
    const runB = await f.call('mod2', { targetType: type, targetId: id }); // takeover
    assert.equal(runB.status, 200);
    const afterB = (await f.store.get(docPath)).data;
    assert.equal(afterB.mediaRemoval.state, 'done');
    assert.equal(afterB.mediaRemoval.by, 'mod2');
    // Restore (now allowed: terminal state) and the author attaches a new photo.
    await f.store.commit([{ kind: 'update', path: docPath, set: { visibility: 'public', images: [`${CDN}/post_photos/${BOB}/new.jpg`] } }]);
    releaseStale();
    const a = await runA;
    assert.equal(a.status, 200);
    assert.equal(a.body.superseded, true, 'stale run recognised it no longer owns the removal');
    const final = (await f.store.get(docPath)).data;
    assert.deepEqual([final.visibility, final.images, final.mediaRemoval.by], ['public', [`${CDN}/post_photos/${BOB}/new.jpg`], 'mod2']);
    assert.ok(f.bucket.objects.has(`post_photos/${BOB}/new.jpg`), 'restored photo kept');
    // Repeating removal on restored content is refused (not removed).
    assert.equal((await f.call('mod', { targetType: type, targetId: id })).status, 409);
  });
}

// ── Workers Free: bounded slices, persisted cursor, continuation auth, budgets ─

const budgetMod = worker('budget');
const mediaMod = worker('media');
const COLD_AUTH_CALLS = 2; // JWKS + service-account token on a cold isolate
const STORE_METHODS = ['get', 'getMany', 'query', 'listDocumentIds', 'listCollectionIds', 'commit'];

/**
 * Charges store calls to `budget` as the REST adapter fetches them: one per call,
 * except that an unpaged query or listing fetches every 100-result page.
 */
const PAGED_OPTS = { query: 2, listDocumentIds: 1, listCollectionIds: 1 };
function metered(store, budget) {
  return new Proxy(store, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      if (!STORE_METHODS.includes(k)) return v.bind(t);
      return async (...a) => {
        if (!(k in PAGED_OPTS) || a[PAGED_OPTS[k]]?.limit) { budget.spend(); return v.apply(t, a); }
        const result = await v.apply(t, a);
        budget.spend(Math.floor(result.length / 100) + 1); // pages fetched until a short page
        return result;
      };
    },
  });
}

/** One invocation's deps: fetch budget (store, Auth, Storage) and D1 query budget. */
function invocation(h, store, mediaStore) {
  const budget = new budgetMod.SubrequestBudget();
  const queries = new budgetMod.SubrequestBudget(budgetMod.D1_FREE_QUERIES);
  budget.spend(COLD_AUTH_CALLS);
  const charge = (fn) => async (...a) => { budget.spend(); return fn(...a); };
  const fs = h.storage;
  const storage = { name: fs.name,
    bucketExists: (before) => fs.bucketExists(async () => { await before?.(); budget.spend(); }),
    deletePrefixes: (p, before) => fs.deletePrefixes(p, async () => { await before?.(); budget.spend(); }),
    deleteObjects: (n, before) => fs.deleteObjects(n, async () => { await before?.(); budget.spend(); }),
    verifyAbsent: (p, n, before) => fs.verifyAbsent(p, n, async () => { await before?.(); budget.spend(); }) };
  const m = mediaStore ?? h.deps.media;
  const deps = { ...h.deps, store: metered(store, budget), firebaseStorage: storage, budget,
    deleteAuthUser: charge(h.deps.deleteAuthUser), authUserExists: charge(h.deps.authUserExists),
    media: m ? { db: mediaMod.meteredD1(m.db, queries), kv: m.kv, queries } : undefined };
  return { deps, budget, queries };
}

function seedMedia(n, owner) {
  const m = { db: d1Fake(), kv: kvFake() };
  const ins = m.db.raw.prepare(`INSERT INTO media VALUES (?, ?, ?, 'post', 'inherit', 'active', NULL, 'image/jpeg', 1, 1, 1, 0)`);
  for (const [uid, count] of [[owner, n], [BOB, 2]]) {
    for (let i = 0; i < count; i++) {
      const id = (uid === owner ? 'a' : 'b') + String(i).padStart(31, '0');
      ins.run(id, uid, `m/${id}`);
      m.kv.map.set(`m/${id}`, new ArrayBuffer(1));
    }
  }
  return m;
}

const tokenFor = (uid, authTime = nowSec) => ({ uid, email: null, authTime });
const callRoute = async (h, store, m, identity, body) => {
  const inv = invocation(h, store, m);
  const resp = await route.handleAccountDeletion(
    new Request('https://worker.test/account/delete', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: body ? JSON.stringify(body) : undefined }),
    { verify: async () => identity, deletion: () => inv.deps, json, nowSec: () => nowSec }
  );
  return { status: resp.status, body: await resp.json(), used: inv.budget.used, queries: inv.queries.used };
};

test('bounded slices: every invocation stays within 50 subrequests and 50 D1 queries; 202 until done; cursor persisted', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const m = seedMedia(45, ME);
  const slices = [];
  let r;
  for (let i = 0; i < 60; i++) {
    r = await callRoute(h, store, m, tokenFor(ME));
    slices.push(r);
    assert.ok(r.used <= budgetMod.WORKERS_FREE_SUBREQUESTS, `slice ${i} used ${r.used} subrequests`);
    assert.ok(r.queries <= budgetMod.D1_FREE_QUERIES, `slice ${i} used ${r.queries} D1 queries`);
    if (r.status !== 202) break;
    assert.equal(r.body.status, 'in_progress');
    if (i > 0) assert.ok(r.body.completedSteps >= slices[i - 1].body.completedSteps, 'progress never goes back');
    const job = (await store.get(`accountDeletions/${ME}`)).data;
    assert.equal(job.completedSteps.length, r.body.completedSteps, 'cursor persisted with the 202');
    assert.equal(job.leaseUntil, 0, 'paused slice releases its lease');
    assert.equal(h.authCalls.length, 0, 'Auth untouched until every step is done');
  }
  assert.deepEqual([r.status, r.body], [200, { status: 'deleted' }]);
  assert.ok(slices.length >= 3, `expected several slices, got ${slices.length}`);
  assert.equal(h.authCalls.length, 1);
  await expectState(store, h);
  assert.equal(m.db.raw.prepare(`SELECT COUNT(*) n FROM media WHERE owner_uid = ? AND (status != 'removed' OR kv_delete_pending = 1)`).get(ME).n, 0);
  assert.equal([...m.kv.map.keys()].filter((k) => k.startsWith('m/a')).length, 0, 'KV bytes deleted (accepted by KV)');
  assert.equal(m.db.raw.prepare(`SELECT COUNT(*) n FROM media WHERE owner_uid = ? AND status = 'active'`).get(BOB).n, 2, "other users' media untouched");
  console.log(`      slices=${slices.length} max subrequests=${Math.max(...slices.map((s) => s.used))} max D1 queries=${Math.max(...slices.map((s) => s.queries))}`);
});

test('KV delete quota: the media step stays pending (202, revoked) and is never reported deleted until KV accepts', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const m = seedMedia(5, ME);
  m.kv.state.deleteQuota = 2;
  let r;
  for (let i = 0; i < 40; i++) {
    r = await callRoute(h, store, m, tokenFor(ME));
    if (r.status !== 202 || m.kv.state.deleteQuota < 0) break;
  }
  assert.equal(r.status, 202);
  r = await callRoute(h, store, m, tokenFor(ME));
  assert.equal(r.status, 202, 'still pending while KV refuses deletes');
  assert.equal(h.authCalls.length, 0);
  assert.equal((await store.get(`accountDeletions/${ME}`)).data.currentStep, 'media');
  assert.equal(m.db.raw.prepare(`SELECT COUNT(*) n FROM media WHERE owner_uid = ? AND status = 'active'`).get(ME).n, 0, 'logically revoked at once');
  assert.ok(m.db.raw.prepare(`SELECT COUNT(*) n FROM media WHERE owner_uid = ? AND kv_delete_pending = 1`).get(ME).n > 0);
  m.kv.state.deleteQuota = Infinity; // next UTC day
  for (let i = 0; i < 10 && r.status === 202; i++) r = await callRoute(h, store, m, tokenFor(ME));
  assert.equal(r.status, 200);
  await expectState(store, h);
});

test('continuation auth: start needs recent login; continuation is bound to the verified token UID only', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const stale = nowSec - 60 * 60;
  let r = await callRoute(h, store, null, tokenFor(ME, stale));
  assert.deepEqual([r.status, r.body.code], [401, 'auth/requires-recent-login'], 'starting needs a recent login');
  assert.equal(await store.get(`accountDeletions/${ME}`), null);
  r = await callRoute(h, store, null, tokenFor(ME));
  assert.equal(r.status, 202);
  const before = (await store.get(`accountDeletions/${ME}`)).data.completedSteps.length;
  // Another signed-in user cannot continue (or start) someone else's deletion; a body UID is ignored.
  r = await callRoute(h, store, null, tokenFor(BOB, stale), { uid: ME });
  assert.deepEqual([r.status, r.body.code], [401, 'auth/requires-recent-login']);
  assert.equal((await store.get(`accountDeletions/${ME}`)).data.completedSteps.length, before, "Bob's request did not advance Alice's job");
  assert.equal(await store.get(`accountDeletions/${BOB}`), null);
  // The same user continues with an older (still valid) token.
  for (let i = 0; i < 40 && r.status !== 200; i++) {
    r = await callRoute(h, store, null, tokenFor(ME, stale), { uid: BOB });
    assert.ok([200, 202].includes(r.status), JSON.stringify(r.body));
  }
  assert.equal(r.status, 200);
  await expectState(store, h);
  assert.ok(await store.get(`users/${BOB}`), 'body uid never selects the account');
  r = await callRoute(h, store, null, tokenFor(ME, stale));
  assert.deepEqual([r.status, r.body], [200, { status: 'deleted' }], 'completed: idempotent');
  // An unreadable job document fails closed.
  const inv = invocation(harness(store), store, null);
  inv.deps.store = { get: async () => { throw new Error('unavailable'); } };
  const resp = await route.handleAccountDeletion(req('Bearer t'), { verify: async () => tokenFor(CAROL, stale), deletion: () => inv.deps, json, nowSec: () => nowSec });
  assert.equal(resp.status, 503);
}, 'memory');

test('cron: discovery, finalization, recovery and sweep stay within 50 subrequests per run and finish the work', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const m = seedMedia(30, ME);
  // Alice: one user slice, then the app is closed (paused, lease released).
  assert.equal((await callRoute(h, store, m, tokenFor(ME))).status, 202);
  // Other jobs: a failed one and one awaiting finalization (Auth already gone).
  await store.commit([{ kind: 'update', path: 'accountDeletions/zed', set: { uid: 'zed', status: 'failed', attemptId: 'x', leaseUntil: 0, completedSteps: [], startedAtMs: h.now() }, mustExist: false }]);
  await store.commit([{ kind: 'update', path: 'accountDeletions/yan', set: { uid: 'yan', status: 'in_progress', attemptId: 'y', leaseUntil: 0, pendingFinalization: true, mediaClearedAtMs: h.now(), completedSteps: [], startedAtMs: h.now() }, mustExist: false }]);
  const runs = [];
  for (let i = 0; i < 40; i++) {
    const inv = invocation(h, store, m);
    const result = await deletion.runScheduledMaintenance(inv.deps);
    runs.push({ used: inv.budget.used, queries: inv.queries.used, result });
    assert.ok(inv.budget.used <= budgetMod.WORKERS_FREE_SUBREQUESTS, `cron run ${i}: ${inv.budget.used} subrequests`);
    assert.ok(inv.queries.used <= budgetMod.D1_FREE_QUERIES, `cron run ${i}: ${inv.queries.used} D1 queries`);
    const states = await Promise.all([ME, 'zed', 'yan'].map(async (u) => (await store.get(`accountDeletions/${u}`)).data.status));
    if (states.every((s) => s === 'completed')) break;
  }
  for (const u of [ME, 'zed', 'yan']) assert.equal((await store.get(`accountDeletions/${u}`)).data.status, 'completed', u);
  await expectState(store, h);
  assert.ok(runs.length >= 2);
  assert.ok(runs.some((r) => r.result.budgetLimited), 'at least one run stopped at its budget and resumed later');
  console.log(`      cron runs=${runs.length} max subrequests=${Math.max(...runs.map((r) => r.used))} max D1 queries=${Math.max(...runs.map((r) => r.queries))}`);
}, 'memory');

test('cron media maintenance limits keep the run within both budgets; the D1 cap is hard', async () => {
  for (const [f, q] of [[50, 50], [30, 50], [50, 10], [12, 6], [10, 4]]) {
    const { checkLimit, purgeLimit } = mediaMod.maintenanceLimits(f, q);
    assert.ok(4 + 2 * checkLimit + purgeLimit <= q, `D1 ${f}/${q}`);
    assert.ok(10 + 3 * checkLimit <= Math.max(f, 10), `fetch ${f}/${q}`);
  }
  const m = { db: d1Fake(), kv: kvFake() };
  const queries = new budgetMod.SubrequestBudget(3);
  const db = mediaMod.meteredD1(m.db, queries);
  for (let i = 0; i < 3; i++) await db.prepare('SELECT 1').first();
  await assert.rejects(db.prepare('SELECT 1').first(), budgetMod.BudgetExceeded, 'a query beyond the cap is never sent');
  assert.equal(m.db.state.queries, 3);
}, 'memory');

test('legacy profile_images/{uid}.jpg: deleted and verified absent when accessible; unresolved (not deleted) when inaccessible', async () => {
  // Accessible: a fresh check proves absence before the record says so.
  let store = await newStore(); await seed(store); let h = harness(store);
  await deletion.deleteAccount({ uid: ME, email: null }, h.deps);
  assert.ok(!h.storage.objects.has(`profile_images/${ME}.jpg`));
  assert.ok(h.storage.objects.has(`profile_images/${BOB}.jpg`));
  let rec = (await store.get(`legacyMediaCleanup/${ME}`)).data;
  assert.equal(rec.status, 'verified_absent');
  assert.deepEqual(rec.objects, [`profile_images/${ME}.jpg`]);

  // Still listed after delete: the step fails and is never recorded as done.
  store = await newStore(); await seed(store); h = harness(store);
  h.storage.verifyAbsent = async () => false;
  await assert.rejects(deletion.deleteAccount({ uid: ME, email: null }, h.deps), (e) => e.step === 'firebaseMedia');
  assert.equal(await store.get(`legacyMediaCleanup/${ME}`), null);
  assert.equal(h.authCalls.length, 0);

  // Inaccessible (Spark project; Storage needs Blaze): recorded as unresolved and listed for operators; blocked, not deleted.
  store = await newStore(); await seed(store); h = harness(store);
  h.storage.inaccessible = true;
  const blocked = await deletion.deleteAccount({ uid: ME, email: null }, h.deps);
  assert.deepEqual([blocked.status, blocked.step], ['blocked', 'firebaseMedia']);
  assert.equal(h.authCalls.length, 0);
  assert.ok(h.storage.objects.has(`profile_images/${ME}.jpg`), 'nothing was deleted');
  rec = (await store.get(`legacyMediaCleanup/${ME}`)).data;
  assert.deepEqual([rec.status, rec.reason], ['unresolved', 'inaccessible (403)']);
  assert.equal((await store.get(`accountDeletions/${ME}`)).data.legacyMediaUnresolved, true, 'the job carries the open item');
  const resp = await route.handleAdminDeletionStatus(new Request('https://w/admin/deletion-status', { headers: { Authorization: 'Bearer ops' } }), { adminToken: 'ops', deletion: () => h.deps, json });
  assert.deepEqual((await resp.json()).legacyMediaUnresolved.map((u) => u.uid), [ME]);
});

test('legacy media migration tooling: dry run by default, ownership gate, resumable state, no source deletion', async () => {
  const src = fs.readFileSync(path.join(root, 'scripts/migrateLegacyMedia.ts'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', 'require', transpile(path.join(root, 'scripts/migrateLegacyMedia.ts')))(m, m.exports, require);
  const mig = m.exports;
  assert.deepEqual(mig.parseLegacyPath('firebase', 'profile_images/abcdef12.jpg'), { source: 'firebase', path: 'profile_images/abcdef12.jpg', ownerUid: 'abcdef12', purpose: 'profile' });
  assert.equal(mig.parseLegacyPath('firebase', 'profile_images/../x.jpg'), null);
  assert.equal(mig.parseLegacyPath('r2', 'other/abcdef12/x.jpg'), null);
  const item = mig.parseLegacyPath('r2', 'post_photos/abcdef12/x.jpg');
  assert.deepEqual(mig.ownershipDecision(item, false, []), { ok: false, reason: 'owner-auth-user-missing' });
  assert.deepEqual(mig.ownershipDecision(item, true, [{ path: 'travelPosts/p', ownerUid: 'someoneElse' }]), { ok: false, reason: 'referenced-by-another-account' });
  assert.deepEqual(mig.ownershipDecision(item, true, [{ path: 'travelPosts/p', ownerUid: 'abcdef12' }]), { ok: true });
  const tmp = path.join(require('os').tmpdir(), `sts-mig-${process.pid}.json`);
  mig.saveState(tmp, { [mig.stateKey(item)]: { stage: 'imported', mediaId: 'x' } });
  assert.equal(mig.loadState(tmp)[mig.stateKey(item)].stage, 'imported');
  fs.unlinkSync(tmp);
  assert.match(src, /apply: \{ type: 'boolean', default: false \}/, 'dry run is the default');
  assert.ok(!/\.delete\(\)|deleteFiles|bucket\.delete/.test(src), 'never deletes source objects');
  assert.ok(/process\.env\.ADMIN_DELETION_TOKEN/.test(src) && !/console\.log\([^)]*token/i.test(src), 'token from env, never printed');
}, 'memory');

// ── Regressions: inaccessible legacy media; multi-page datasets beyond one invocation ─

async function bulk(store, entries) {
  for (let i = 0; i < entries.length; i += 400) {
    await store.commit(entries.slice(i, i + 400).map(([p, data]) => ({ kind: 'update', path: p, set: data, mustExist: false })));
  }
}
const countDocs = async (store, col, field, value) => (await store.query(col, [{ field, op: 'EQUAL', value }])).length;

test('legacy Storage inaccessible: deletion is blocked (Auth kept, step incomplete) and finishes only after verified absence', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  h.storage.inaccessible = true;
  // User start + continuation.
  let r = await callRoute(h, store, null, tokenFor(ME));
  for (let i = 0; i < 40 && r.status === 202 && r.body.status === 'in_progress'; i++) r = await callRoute(h, store, null, tokenFor(ME, nowSec - 3600));
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.deepEqual([r.body.status, r.body.step, r.body.reason], ['blocked', 'firebaseMedia', 'legacy-media-inaccessible']);
  assert.equal(h.authCalls.length, 0, 'Auth is preserved while legacy media cannot be verified');
  assert.ok(h.storage.objects.has(`profile_images/${ME}.jpg`));
  let job = (await store.get(`accountDeletions/${ME}`)).data;
  assert.deepEqual([job.status, job.leaseUntil, job.blockedOn, job.legacyMediaUnresolved, job.pendingFinalization ?? false], ['in_progress', 0, 'firebaseMedia', true, false]);
  assert.ok(!job.completedSteps.includes('firebaseMedia'), 'step stays incomplete');
  assert.equal((await store.get(`legacyMediaCleanup/${ME}`)).data.status, 'unresolved', 'operator record kept');
  // Repeated continuation: still blocked, still truthful.
  r = await callRoute(h, store, null, tokenFor(ME, nowSec - 3600));
  assert.deepEqual([r.status, r.body.status], [202, 'blocked']);
  // Cron (finalization + recovery) never removes Auth while blocked.
  for (let i = 0; i < 3; i++) await deletion.runScheduledMaintenance(invocation(h, store, null).deps);
  assert.equal(h.authCalls.length, 0);
  assert.equal(await h.deps.authUserExists(ME), true);
  job = (await store.get(`accountDeletions/${ME}`)).data;
  assert.equal(job.status, 'in_progress');
  // Admin status lists it as unresolved.
  const status = await route.handleAdminDeletionStatus(new Request('https://w/admin/deletion-status', { headers: { Authorization: 'Bearer ops' } }), { adminToken: 'ops', deletion: () => h.deps, json });
  assert.deepEqual((await status.json()).legacyMediaUnresolved.map((u) => u.uid), [ME]);
  // Access returns: the next cron run retries, proves absence and completes.
  h.storage.inaccessible = false;
  await deletion.runScheduledMaintenance(invocation(h, store, null).deps);
  job = (await store.get(`accountDeletions/${ME}`)).data;
  assert.deepEqual([job.status, job.legacyMediaUnresolved, job.blockedOn ?? null], ['completed', false, null]);
  assert.equal((await store.get(`legacyMediaCleanup/${ME}`)).data.status, 'verified_absent');
  assert.ok(!h.storage.objects.has(`profile_images/${ME}.jpg`));
  assert.equal(h.authCalls.length, 1);
  await expectState(store, h);
  const after = await route.handleAdminDeletionStatus(new Request('https://w/admin/deletion-status', { headers: { Authorization: 'Bearer ops' } }), { adminToken: 'ops', deletion: () => h.deps, json });
  assert.deepEqual((await after.json()).legacyMediaUnresolved, []);
}, 'memory');

test('legacy Storage inaccessible: a job recorded by the earlier code as finished but unresolved is not finalized; it is retried', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  h.storage.inaccessible = true;
  // State the previous version could leave: every step "done", unresolved flag, pending finalization, Auth still present.
  await store.commit([{ kind: 'update', path: `accountDeletions/${ME}`, mustExist: false, set: {
    uid: ME, status: 'failed', attemptId: 'old', leaseUntil: 0, legacyMediaUnresolved: true, pendingFinalization: true,
    mediaClearedAtMs: h.now(), completedSteps: deletion.DELETION_STEPS.map((s) => s.id), startedAtMs: h.now() } }]);
  await store.commit([{ kind: 'update', path: `legacyMediaCleanup/${ME}`, mustExist: false, set: { uid: ME, status: 'unresolved', store: 'firebase-storage', reason: 'inaccessible (403)' } }]);
  await deletion.runScheduledMaintenance(invocation(h, store, null).deps);
  assert.equal(h.authCalls.length, 0, 'finalization refuses while legacy media is unresolved');
  assert.equal((await store.get(`accountDeletions/${ME}`)).data.blockedOn, 'firebaseMedia');
  h.storage.inaccessible = false;
  for (let i = 0; i < 5 && (await store.get(`accountDeletions/${ME}`)).data.status !== 'completed'; i++) {
    await deletion.runScheduledMaintenance(invocation(h, store, null).deps);
  }
  assert.equal((await store.get(`accountDeletions/${ME}`)).data.status, 'completed');
  assert.equal((await store.get(`legacyMediaCleanup/${ME}`)).data.status, 'verified_absent');
  assert.equal(h.authCalls.length, 1);
}, 'memory');

/** A durable-progress fingerprint: documents left, completed steps and cursors on the job. */
async function progressMark(store) {
  const job = (await store.get(`accountDeletions/${ME}`))?.data ?? {};
  return JSON.stringify([store.docs.size, job.completedSteps, job.cursors ?? null, job.status]);
}

test('multi-page datasets: 6,000 notifications, a 1,500-document subtree, 300 likes, 300 comments and 250 sent notifications finish across bounded slices', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const extra = [];
  for (let i = 0; i < 6000; i++) extra.push([`notifications/n${String(i).padStart(5, '0')}`, { userId: ME, title: 'x' }]);
  for (let i = 0; i < 1500; i++) extra.push([`users/${ME}/trips/t1/checklist/c${String(i).padStart(5, '0')}`, { title: 'item' }]);
  for (let i = 0; i < 300; i++) {
    const id = `bp${String(i).padStart(4, '0')}`;
    extra.push([`travelPosts/${id}`, { authorId: BOB, likeCount: 1, saveCount: 0, commentCount: 0 }]);
    extra.push([`postLikes/${id}___${ME}`, { postId: id, userId: ME, targetType: 'post' }]);
    extra.push([`postComments/ac${String(i).padStart(4, '0')}`, { authorId: ME, authorName: 'Alice', authorPhoto: null, postId: 'bobPost', parentCommentId: null, text: 'hi', isDeleted: false, replyCount: 0 }]);
  }
  for (let i = 0; i < 250; i++) extra.push([`notifications/s${String(i).padStart(4, '0')}`, { userId: BOB, actorId: ME, actorName: 'Alice', actorPhoto: 'https://r2/a.jpg', title: 'Alice liked' }]);
  await bulk(store, extra);
  await store.commit([{ kind: 'update', path: 'travelPosts/bobPost', set: { commentCount: 303 } }]);

  let r; let slices = 0; let maxUsed = 0;
  for (; slices < 1500; slices++) {
    const before = await progressMark(store);
    r = await callRoute(h, store, null, tokenFor(ME, slices ? nowSec - 3600 : nowSec));
    assert.ok(r.status === 202 || r.status === 200, `slice ${slices}: ${r.status} ${JSON.stringify(r.body)}`);
    maxUsed = Math.max(maxUsed, r.used);
    assert.ok(r.used <= budgetMod.WORKERS_FREE_SUBREQUESTS && r.queries <= budgetMod.D1_FREE_QUERIES);
    if (r.status === 200) break;
    assert.equal(r.body.status, 'in_progress');
    assert.notEqual(await progressMark(store), before, `slice ${slices} made no durable progress`);
    assert.equal((await store.get(`accountDeletions/${ME}`)).data.leaseUntil, 0, 'paused lease released');
  }
  assert.equal(r.status, 200);
  await expectState(store, h);
  assert.equal(await countDocs(store, 'notifications', 'userId', ME), 0);
  for (let i = 0; i < 300; i++) assert.equal((await store.get(`travelPosts/bp${String(i).padStart(4, '0')}`)).data.likeCount, 0, 'each like released exactly once');
  const sent = await store.query('notifications', [{ field: 'actorId', op: 'EQUAL', value: ME }]);
  assert.equal(sent.length, 251, "other users keep their notifications (250 + the fixture's toBob)");
  assert.ok(sent.every((n) => n.data.actorName === DELETED && n.data.actorPhoto === null && n.data.userId === BOB));
  const tombs = await store.query('postComments', [{ field: 'authorId', op: 'EQUAL', value: ME }]);
  assert.ok(tombs.filter((c) => c.path.startsWith('postComments/ac')).every((c) => c.data.isDeleted && c.data.authorName === DELETED));
  assert.equal(h.authCalls.length, 1);
  console.log(`      slices=${slices + 1} max subrequests=${maxUsed}`);
}, 'memory');

test('cron discovery over 5,100 incomplete jobs stays within budget, makes progress every run and does not starve behind held jobs', async () => {
  const store = await newStore();
  const now = Date.now();
  const jobs = [];
  // The first 100 by name are held by live attempts elsewhere; the rest failed earlier.
  for (let i = 0; i < 5100; i++) {
    const uid = `j${String(i).padStart(5, '0')}`;
    jobs.push([`accountDeletions/${uid}`, i < 100
      ? { uid, status: 'in_progress', attemptId: 'elsewhere', leaseUntil: now + 60 * 60 * 1000, completedSteps: [], startedAtMs: now }
      : { uid, status: 'failed', attemptId: 'old', leaseUntil: 0, completedSteps: [], startedAtMs: now }]);
  }
  for (let i = 0; i < 150; i++) {
    const uid = `f${String(i).padStart(4, '0')}`;
    jobs.push([`accountDeletions/${uid}`, { uid, status: 'in_progress', attemptId: 'gone', leaseUntil: 0, pendingFinalization: true, mediaClearedAtMs: now, completedSteps: [], startedAtMs: now }]);
  }
  await bulk(store, jobs);
  const h = harness(store);
  const statusOf = async (uid) => (await store.get(`accountDeletions/${uid}`)).data.status;
  let completedLater = 0;
  // Durable progress: completed jobs plus completed steps across all jobs.
  const progress = () => {
    let n = 0;
    for (const [p, d] of store.docs) {
      if (!p.startsWith('accountDeletions/')) continue;
      n += (d.data.status === 'completed' ? 1000 : 0) + (Array.isArray(d.data.completedSteps) ? d.data.completedSteps.length : 0);
    }
    return n;
  };
  for (let run = 0; run < 80; run++) {
    const before = progress();
    const inv = invocation(h, store, null);
    const result = await deletion.runScheduledMaintenance(inv.deps);
    assert.ok(inv.budget.used <= budgetMod.WORKERS_FREE_SUBREQUESTS, `run ${run}: ${inv.budget.used}`);
    assert.ok(progress() > before, `cron run ${run} made no durable progress (${JSON.stringify(result)})`);
  }
  for (let i = 100; i < 5100; i++) if (await statusOf(`j${String(i).padStart(5, '0')}`) === 'completed') completedLater++;
  assert.ok(completedLater > 0, 'jobs behind the held ones are reached');
  for (let i = 0; i < 100; i++) assert.equal(await statusOf(`j${String(i).padStart(5, '0')}`), 'in_progress', 'live attempts untouched');
  const finalized = (await Promise.all(Array.from({ length: 150 }, (_, i) => statusOf(`f${String(i).padStart(4, '0')}`)))).filter((s) => s === 'completed').length;
  assert.equal(finalized, 150, 'all pending finalizations (more than one page) completed');
}, 'memory');

test('real REST adapter: a 1,200-document dataset is deleted page by page under a hard 50-fetch cap per invocation', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const extra = [];
  for (let i = 0; i < 1200; i++) extra.push([`notifications/n${String(i).padStart(5, '0')}`, { userId: ME, title: 'x' }]);
  for (let i = 0; i < 230; i++) extra.push([`users/${ME}/trips/t1/checklist/c${String(i).padStart(4, '0')}`, { title: 'item' }]);
  await bulk(store, extra);
  let result; let slices = 0;
  for (; slices < 200; slices++) {
    const budget = new budgetMod.SubrequestBudget();
    const rest = new FirestoreRest({ projectId: PROJECT, token: async () => 'owner', emulatorHost: EMULATOR_HOST, fetch: budgetMod.budgetedFetch(budget) });
    result = await deletion.deleteAccount({ uid: ME, email: null }, { ...h.deps, store: rest, budget });
    assert.ok(budget.used <= 50);
    if (result.status === 'deleted') break;
    assert.equal(result.status, 'in_progress');
  }
  assert.equal(result.status, 'deleted');
  assert.ok(slices > 3, `expected several slices, got ${slices + 1}`);
  await expectState(store, h);
  assert.equal(await countDocs(store, 'notifications', 'userId', ME), 0);
}, 'emulator');


// ── Free-only staging: no-legacy mode and binding guards ──────────────────────

const indexMod = worker('index');

test('missing media bindings block deletion (never proof of no media); restoring them lets it finish', async () => {
  const store = await newStore(); await seed(store); const h = harness(store);
  const media = h.deps.media;
  let r = await deletion.deleteAccount({ uid: ME, email: null }, { ...h.deps, media: undefined });
  assert.deepEqual([r.status, r.step, r.reason], ['blocked', 'media', 'media-bindings-missing']);
  assert.equal(h.authCalls.length, 0);
  r = await deletion.deleteAccount({ uid: ME, email: null }, { ...h.deps, media });
  assert.equal(r.status, 'deleted');
  await expectState(store, h);
}, 'memory');

test('legacy media required (default): unbound R2 or a missing Storage bucket blocks deletion with Auth kept', async () => {
  let store = await newStore(); await seed(store); let h = harness(store);
  let r = await deletion.deleteAccount({ uid: ME, email: null }, { ...h.deps, r2: undefined });
  assert.deepEqual([r.status, r.step, r.reason], ['blocked', 'r2Media', 'legacy-r2-unbound']);
  store = await newStore(); await seed(store); h = harness(store);
  h.storage.bucketMissing = true;
  r = await deletion.deleteAccount({ uid: ME, email: null }, h.deps);
  assert.deepEqual([r.status, r.step], ['blocked', 'firebaseMedia'], 'a 404 bucket is not proof of absence outside no-legacy mode');
  assert.equal((await store.get(`legacyMediaCleanup/${ME}`)).data.reason, 'inaccessible (404)');
  assert.equal(h.authCalls.length, 0);
}, 'memory');

test('staging no-legacy mode: completes only with proof the bucket was never provisioned; existing or denied buckets take the normal path', async () => {
  // Never provisioned + no R2 binding: completes, proof recorded.
  let store = await newStore(); await seed(store); let h = harness(store);
  h.storage.bucketMissing = true;
  let r = await deletion.deleteAccount({ uid: ME, email: null }, { ...h.deps, r2: undefined, legacyMode: 'none' });
  assert.equal(r.status, 'deleted');
  let rec = (await store.get(`legacyMediaCleanup/${ME}`)).data;
  assert.deepEqual([rec.status, rec.proof], ['verified_absent', 'bucket-not-provisioned']);
  assert.equal(h.authCalls.length, 1);
  // Bucket exists: its objects are really deleted and verified, not bypassed.
  store = await newStore(); await seed(store); h = harness(store);
  r = await deletion.deleteAccount({ uid: ME, email: null }, { ...h.deps, r2: undefined, legacyMode: 'none' });
  assert.equal(r.status, 'deleted');
  assert.ok(!h.storage.objects.has(`profile_images/${ME}.jpg`) && h.storage.objects.has(`profile_images/${BOB}.jpg`));
  rec = (await store.get(`legacyMediaCleanup/${ME}`)).data;
  assert.deepEqual([rec.status, rec.proof], ['verified_absent', 'listing-and-lookup']);
  // Access denied: blocked, Auth kept.
  store = await newStore(); await seed(store); h = harness(store);
  h.storage.inaccessible = true;
  r = await deletion.deleteAccount({ uid: ME, email: null }, { ...h.deps, r2: undefined, legacyMode: 'none' });
  assert.deepEqual([r.status, r.step], ['blocked', 'firebaseMedia']);
  assert.equal(h.authCalls.length, 0);
}, 'memory');

test('no-legacy mode is refused for the production project and for unknown values', async () => {
  const shared = fs.readFileSync(path.join(root, 'packages/shared/src/environment.ts'), 'utf8');
  assert.ok(shared.includes(`PRODUCTION_FIREBASE_PROJECT_ID = '${indexMod.PRODUCTION_FIREBASE_PROJECT_ID}'`), 'Worker and app agree on the production project');
  const prod = indexMod.PRODUCTION_FIREBASE_PROJECT_ID;
  assert.equal(indexMod.legacyModeFor({ FIREBASE_PROJECT_ID: prod, LEGACY_MEDIA_MODE: 'none' }), null);
  assert.equal(indexMod.legacyModeFor({ FIREBASE_PROJECT_ID: prod }), 'required');
  assert.equal(indexMod.legacyModeFor({ FIREBASE_PROJECT_ID: 'solotravelsoul-staging', LEGACY_MEDIA_MODE: 'none' }), 'none');
  assert.equal(indexMod.legacyModeFor({ FIREBASE_PROJECT_ID: 'solotravelsoul-staging', LEGACY_MEDIA_MODE: 'skip' }), null);
  // Through the entry point: the operator endpoint refuses before touching anything.
  const env = { FIREBASE_PROJECT_ID: prod, FIREBASE_STORAGE_BUCKET: `${prod}.firebasestorage.app`, LEGACY_MEDIA_MODE: 'none',
    GOOGLE_SERVICE_ACCOUNT_JSON: (await rsaKeys()).serviceAccount, ADMIN_DELETION_TOKEN: 'ops' };
  const real = global.fetch;
  let fetched = 0;
  global.fetch = async () => { fetched++; throw new Error('no network expected'); };
  const errors = console.error;
  console.error = () => {};
  try {
    const resp = await workerIndex().fetch(new Request('https://w/admin/account-deletion', { method: 'POST', headers: { Authorization: 'Bearer ops' }, body: JSON.stringify({ uid: ME }) }), env);
    assert.deepEqual([resp.status, (await resp.json()).code], [503, 'deletion/unavailable']);
    assert.equal(fetched, 0);
  } finally {
    global.fetch = real;
    console.error = errors;
  }
}, 'memory');

/** Staging-shaped Worker env: KV/D1 media, no R2 binding, optional no-legacy mode. */
function stagingEnv(keys, mode) {
  const kv = kvFake();
  return { FIREBASE_PROJECT_ID: PROJECT, FIREBASE_STORAGE_BUCKET: `${PROJECT}.firebasestorage.app`, GOOGLE_SERVICE_ACCOUNT_JSON: keys.serviceAccount,
    ADMIN_DELETION_TOKEN: 'ops', MEDIA_DB: d1Fake(), MEDIA_KV: { get: (k) => kv.get(k), put: (k, v) => kv.put(k, v), delete: (k) => kv.delete(k) },
    MEDIA_PUBLIC_ORIGIN: 'https://staging.worker.test', ...(mode ? { LEGACY_MEDIA_MODE: mode } : {}) };
}
async function deleteThroughWorker(keys, env, uid = ME) {
  const token = await idToken(keys, uid);
  let resp;
  for (let i = 0; i < 40; i++) {
    resp = await workerIndex().fetch(new Request('https://w/account/delete', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }), env);
    if (resp.status !== 202) break;
    const body = await resp.clone().json();
    if (body.status === 'blocked') break;
  }
  return { status: resp.status, body: await resp.json() };
}

test('staging end to end: a new account is deleted without Storage, R2 or Blaze (bucket never provisioned)', async () => {
  const keys = await rsaKeys();
  const store = await newStore(); await seed(store);
  const storageObjects = new Set([`profile_images/${BOB}.jpg`, `trip_covers/${BOB}/t.jpg`]); // never reachable: bucket missing
  const fakes = installGoogleFakes(keys, { storageObjects, authUsers: new Set([ME, BOB]) });
  fakes.state.bucketMissing = true;
  try {
    const r = await deleteThroughWorker(keys, stagingEnv(keys, 'none'));
    assert.deepEqual([r.status, r.body], [200, { status: 'deleted' }]);
    assert.deepEqual(fakes.state.authDeletes, [ME]);
    const rec = (await store.get(`legacyMediaCleanup/${ME}`)).data;
    assert.deepEqual([rec.status, rec.proof], ['verified_absent', 'bucket-not-provisioned']);
    await expectState(store, { r2: { objects: new Set([`post_photos/${BOB}/y.jpg`, `profile_photos/${BOB}/avatar.jpg`]) }, storage: { objects: storageObjects } });
  } finally {
    fakes.restore();
  }
}, 'emulator');

test('entry point: without no-legacy mode a missing bucket or Storage 403 blocks deletion and keeps Auth', async () => {
  const keys = await rsaKeys();
  for (const [label, setup, mode] of [['missing bucket, mode required', (s) => { s.bucketMissing = true; }, undefined], ['403, no-legacy mode', (s) => { s.storageDenied = true; }, 'none']]) {
    const store = await newStore(); await seed(store);
    const fakes = installGoogleFakes(keys, { storageObjects: new Set(), authUsers: new Set([ME, BOB]) });
    setup(fakes.state);
    const env = stagingEnv(keys, mode);
    if (!mode) Object.assign(env, { R2_BUCKET: fakeR2(), PUBLIC_R2_BASE_URL: 'https://cdn.test' });
    try {
      const r = await deleteThroughWorker(keys, env);
      assert.deepEqual([r.status, r.body.status, r.body.step], [202, 'blocked', 'firebaseMedia'], label);
      assert.deepEqual(fakes.state.authDeletes, [], label);
      assert.equal((await store.get(`legacyMediaCleanup/${ME}`)).data.status, 'unresolved', label);
    } finally {
      fakes.restore();
    }
  }
}, 'emulator');

test('cron late-media sweep through the real REST adapter: pages, equal timestamps, budget stops, restarts and retried failures', async () => {
  const keys = await rsaKeys();
  const store = await newStore();
  const base = Date.now() - 60_000;
  const uids = Array.from({ length: 130 }, (_, i) => `sw${String(i).padStart(3, '0')}`);
  const storageObjects = new Set();
  for (let i = 0; i < uids.length; i += 25) {
    await store.commit(uids.slice(i, i + 25).map((uid, j) => ({ kind: 'update', path: `accountDeletions/${uid}`, mustExist: false, set: {
      uid, status: 'completed', pendingFinalization: false, mediaClearedAtMs: base + Math.floor((i + j) / 10), completedSteps: [] } })));
  }
  for (const uid of uids) storageObjects.add(`journals/${uid}/late.jpg`);
  storageObjects.add(`journals/${BOB}/keep.jpg`); // not a deleted account
  const fakes = installGoogleFakes(keys, { storageObjects, authUsers: new Set() });
  fakes.state.failListPrefix = 'journals/sw007/'; // one job's cleanup fails once
  const warn = console.warn;
  console.warn = () => {};
  try {
    let runs = 0;
    let sawSavedTimestampCursor = false;
    const remaining = () => uids.filter((u) => storageObjects.has(`journals/${u}/late.jpg`));
    for (; runs < 60 && remaining().length; runs++) {
      // Restart: a fresh adapter and budget each run; only Firestore carries the position.
      const budget = new budgetMod.SubrequestBudget();
      const f = budgetMod.budgetedFetch(budget);
      const rest = new FirestoreRest({ projectId: PROJECT, token: async () => 'owner', emulatorHost: EMULATOR_HOST, fetch: f });
      const deps = { store: rest, budget, legacyMode: 'required', media: undefined,
        firebaseStorage: worker('objectStores').firebaseStorageDeleter({ bucket: 'bucket', token: async () => 'sa', fetch: f }),
        deleteAuthUser: async () => {}, authUserExists: async () => false };
      const before = remaining().length;
      const result = await deletion.runScheduledMaintenance(deps);
      assert.ok(budget.used <= 50, `run ${runs}: ${budget.used} subrequests`);
      assert.ok(remaining().length < before || result.swept > 0 || runs > 0, `run ${runs} made no progress`);
      const cron = (await store.get('deletionMaintenance/cron'))?.data;
      if (cron?.cursors?.sweepAfter?.mediaClearedAtMs) sawSavedTimestampCursor = true;
    }
    assert.deepEqual(remaining(), [], 'every job in the window was reached, including after the failed one');
    assert.ok(runs > 3, `expected several budget-limited runs, got ${runs}`);
    assert.ok(sawSavedTimestampCursor, 'the (mediaClearedAtMs, path) cursor was saved between runs');
    assert.ok(storageObjects.has(`journals/${BOB}/keep.jpg`), 'other accounts untouched');
    assert.equal(fakes.state.failListPrefix, null, 'the injected failure happened and was retried on a later pass');
  } finally {
    console.warn = warn;
    fakes.restore();
  }
}, 'emulator');


test('counter audit dry run: expected tallies, legacy likes, never writes', async () => {
  const src = fs.readFileSync(path.join(root, 'scripts/auditCounters.ts'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', 'require', transpile(path.join(root, 'scripts/auditCounters.ts')))(m, m.exports, require);
  const a = m.exports;
  const likes = [{ postId: 'p1', targetType: 'post' }, { postId: 'p1' }, { postId: 'j1' }, { postId: 'gone' }, { postId: 'j1', targetType: 'journal' }];
  const t = a.likeTallies(likes, new Set(['p1']), new Set(['j1']));
  assert.deepEqual([t.get('travelPosts/p1'), t.get('travelJournals/j1'), t.size], [2, 2, 2]);
  const mism = a.compareCounters([{ path: 'travelPosts/p1', data: { likeCount: 2 } }, { path: 'travelPosts/p2', data: { likeCount: -1 } }], 'likeCount', t);
  assert.deepEqual(mism, [{ path: 'travelPosts/p2', field: 'likeCount', stored: -1, expected: 0 }]);
  assert.ok(!/\.(update|delete|create)\(|\.doc\([^)]*\)\.set\(|\.ref\.set\(|batch\(|runTransaction|bulkWriter/.test(src), 'the audit has no write path');
  assert.ok(!/console\.log\([^)]*mismatches\b/.test(src), 'paths go only to the operator report file');
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
