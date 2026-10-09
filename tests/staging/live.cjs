// Live staging integration test (Firebase Spark + Workers Free + KV/D1). STAGING ONLY.
//
//   STS_STATE=<file outside the repo> STS_ADMIN_TOKEN=<staging admin token> \
//     node --no-warnings tests/staging/live.cjs <phase>
//
// Phases (run in order; state such as disposable test accounts is kept in STS_STATE):
//   setup        create disposable accounts, profiles, a moderator grant
//   media        upload/view, cache headers, private/hidden denial, direct Firestore
//                privacy change, report auto-hide, moderator removal, profile photo
//   content      social content between A and B (posts, comments, likes, follows, DM, group)
//   delete-a     delete A across slices; verify what is gone and what B retains
//   start-user <key>        create content for a further account (C, D, ...) and start its deletion
//   continue-user <key>     continue that account's deletion with its own token
//   verify-deleted <key>    verify that account is fully deleted
//
// Uses the app's own packages/firebase modules with the Firebase client SDK (real rules),
// the staging Worker over HTTPS, the Firebase CLI owner credentials for read-only
// verification (Firestore REST) and `wrangler d1 execute` for D1 reads. Prints results
// only — never tokens, passwords or keys. Refuses anything but the staging targets.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');
const PROJECT = 'solotravelsoul-staging';
const WEB_APP_ID = '1:927322372618:web:9947970efca34c09ccbdf3';
const STATE = process.env.STS_STATE;
if (!STATE || STATE.startsWith(ROOT)) throw new Error('Set STS_STATE to a file outside the repository.');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const sh = (args, cwd = ROOT) => execFileSync(npx, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });

const toml = fs.readFileSync(path.join(ROOT, 'workers/r2-upload-worker/wrangler.toml'), 'utf8');
const WORKER = (toml.match(/MEDIA_PUBLIC_ORIGIN\s*=\s*"([^"]+)"/) || [])[1];
if (!WORKER || !/^https:\/\/solotravelsoul-r2-upload-staging\./.test(WORKER)) throw new Error('staging Worker origin not configured');
// Requests may go to another staging host serving the same API (e.g. the Durable Object proof);
// media URLs keep the canonical staging origin.
const API = process.env.STS_API_ORIGIN || WORKER;
if (!/^https:\/\/solotravelsoul-[a-z0-9-]*staging\.[a-z0-9-]+\.workers\.dev$/.test(API)) throw new Error('STS_API_ORIGIN must be a staging workers.dev origin');

const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { users: {}, ids: {} };
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });

// ── Results ───────────────────────────────────────────────────────────────────
const results = [];
async function check(name, fn) {
  try { const detail = await fn(); results.push(['PASS', name, detail ?? '']); }
  catch (e) { results.push(['FAIL', name, String(e && e.message || e).slice(0, 300)]); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
function report() {
  for (const [s, n, d] of results) console.log(`${s} ${n}${d ? ` — ${d}` : ''}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`${results.length - failed}/${results.length} live checks passed`);
  if (failed) process.exitCode = 1;
}

// ── App modules bound to one Firebase client app per user ────────────────────
const sdkApp = require('firebase/app');
const sdkAuth = require('firebase/auth');
const sdkFs = require('firebase/firestore');
const config = JSON.parse(sh(['firebase', 'apps:sdkconfig', 'WEB', WEB_APP_ID, '--project', PROJECT, '--json'])).result.sdkConfig;
if (config.projectId !== PROJECT) throw new Error('not the staging project');

function loadTs(file, overrides, cache = {}) {
  if (cache[file]) return cache[file];
  const m = { exports: {} };
  cache[file] = m.exports;
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const req = (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(file), name);
      for (const f of [`${base}.ts`, path.join(base, 'index.ts')]) if (fs.existsSync(f)) return loadTs(f, overrides, cache);
    }
    return require(name);
  };
  new Function('module', 'exports', 'require', '__DEV__', code)(m, m.exports, req, false);
  return (cache[file] = m.exports);
}
const sharedCache = {};
const shared = loadTs(path.join(ROOT, 'packages/shared/index.ts'), {}, sharedCache);

const sessions = {};
async function session(key) {
  if (sessions[key]) return sessions[key];
  const u = state.users[key];
  const app = sdkApp.initializeApp(config, `sts-live-${key}`);
  const auth = sdkAuth.getAuth(app);
  const db = sdkFs.initializeFirestore(app, { localCache: sdkFs.memoryLocalCache() });
  const cred = await sdkAuth.signInWithEmailAndPassword(auth, u.email, u.password);
  const overrides = {
    'firebase/firestore': { ...sdkFs, initializeFirestore: () => db, getFirestore: () => db },
    '@solotravelsoul/shared': shared,
    './config': { app },
    './auth': { auth },
    './firestore': { db },
  };
  const dir = path.join(ROOT, 'packages/firebase/src');
  const cache = {};
  const mods = {};
  for (const f of ['posts', 'chat', 'firestore', 'moderation']) mods[f] = loadTs(path.join(dir, `${f}.ts`), { ...overrides, ...(f === 'firestore' ? {} : { './firestore': { db } }) }, cache);
  const s = { key, uid: cred.user.uid, app, auth, db, ...mods, token: (force = false) => cred.user.getIdToken(force) };
  sessions[key] = s;
  return s;
}
async function closeAll() { for (const s of Object.values(sessions)) await sdkApp.deleteApp(s.app).catch(() => {}); }

// ── Admin (read-only verification) with the Firebase CLI owner token ─────────
let ownerToken;
async function owner() {
  if (ownerToken) return ownerToken;
  const ft = path.join(process.env.APPDATA || '', 'npm/node_modules/firebase-tools/lib');
  const auth = require(path.join(ft, 'auth.js'));
  const { configstore } = require(path.join(ft, 'configstore.js'));
  ownerToken = (await auth.getAccessToken(configstore.get('tokens').refresh_token, [])).access_token;
  return ownerToken;
}
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const fsValue = (v) => (v == null ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'booleanValue' in v ? v.booleanValue
  : 'doubleValue' in v ? v.doubleValue : 'nullValue' in v ? null : 'arrayValue' in v ? (v.arrayValue.values || []).map(fsValue)
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fsValue(x)])) : 'timestampValue' in v ? v.timestampValue : v);
async function adminGet(p) {
  const r = await fetch(`${FS}/${p}`, { headers: { Authorization: `Bearer ${await owner()}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`admin get ${r.status}`);
  const j = await r.json();
  return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, fsValue(v)]));
}
async function adminQuery(collectionId, field, op, value, allDescendants = false) {
  const enc = typeof value === 'string' ? { stringValue: value } : typeof value === 'boolean' ? { booleanValue: value } : { integerValue: String(value) };
  const r = await fetch(`${FS}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${await owner()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId, allDescendants }], where: { fieldFilter: { field: { fieldPath: field }, op, value: enc } } } }) });
  if (!r.ok) throw new Error(`admin query ${r.status}`);
  return (await r.json()).filter((x) => x.document).map((x) => ({ path: x.document.name.split('/documents/')[1], data: Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, fsValue(v)])) }));
}
async function adminSet(p, data) {
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) }]));
  const r = await fetch(`${FS}/${p}`, { method: 'PATCH', headers: { Authorization: `Bearer ${await owner()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`admin set ${r.status}`);
}
function d1(sql) {
  const out = sh(['wrangler', 'd1', 'execute', 'solotravelsoul-media-staging', '--env', 'staging', '--remote', '--json', '--command', JSON.stringify(sql)], path.join(ROOT, 'workers/r2-upload-worker'));
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}

// ── Worker calls ──────────────────────────────────────────────────────────────
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
async function upload(s, purpose, bytes = PNG, type = 'image/png') {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), 'x.png');
  form.append('purpose', purpose);
  const headers = s ? { Authorization: `Bearer ${await s.token()}` } : {};
  const r = await fetch(`${API}/media/upload`, { method: 'POST', headers, body: form });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function view(s, url) {
  const r = await fetch(url.replace(WORKER, API), { headers: s ? { Authorization: `Bearer ${await s.token()}` } : {} });
  const bytes = r.status === 200 ? Buffer.from(await r.arrayBuffer()) : null;
  return { status: r.status, cache: r.headers.get('cache-control'), vary: r.headers.get('vary'), bytes };
}
async function deleteUntilDone(s, maxSlices = Number(process.env.STS_MAX_SLICES) || 40, fresh = true) {
  // Starting needs a recent sign-in: sign in again just before the first call.
  if (fresh) await sdkAuth.signInWithEmailAndPassword(s.auth, state.users[s.key].email, state.users[s.key].password);
  const token = await s.auth.currentUser.getIdToken(true);
  const slices = [];
  for (let i = 0; i < maxSlices; i++) {
    const r = await fetch(`${API}/account/delete`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const body = await r.json().catch(() => ({}));
    slices.push({ status: r.status, state: body.status, step: body.step ?? null, completed: body.completedSteps ?? null });
    if (r.status !== 202 || body.status === 'blocked') break;
  }
  return slices;
}

async function newUser(key) {
  const email = `sts-live-${state.run}-${key}@example.com`;
  const password = crypto.randomBytes(18).toString('base64url');
  const app = sdkApp.initializeApp(config, `sts-create-${key}`);
  const cred = await sdkAuth.createUserWithEmailAndPassword(sdkAuth.getAuth(app), email, password);
  state.users[key] = { email, password, uid: cred.user.uid };
  await sdkApp.deleteApp(app);
  save();
  const s = await session(key);
  await s.firestore.createUserProfile(s.uid, { email, name: `Live ${key.toUpperCase()}` });
  const profile = await s.firestore.getUserProfile(s.uid);
  await s.firestore.upsertPublicProfile(s.uid, { ...profile, profileVisibility: 'public' });
  await s.chat.upsertUserLookup(s.uid, `Live ${key.toUpperCase()}`, email, key.toUpperCase()).catch(() => {});
  return s;
}
const postInput = (s, images, caption) => ({ authorId: s.uid, authorName: `Live ${s.key.toUpperCase()}`, authorPhoto: null, caption, body: '', location: 'Lisbon', country: 'PT',
  tripId: null, images, hashtags: [], postType: 'photo', visibility: 'public' });

// ── Phases ────────────────────────────────────────────────────────────────────
const phases = {
  async setup() {
    state.run = state.run || crypto.randomBytes(3).toString('hex');
    for (const k of ['a', 'b', 'm', 'r1', 'r2', 'r3']) {
      await check(`create disposable account ${k}`, async () => { if (!state.users[k]) await newUser(k); return 'ok'; });
    }
    await check('grant moderator m (operator write)', async () => {
      await adminSet(`moderators/${state.users.m.uid}`, { grantedBy: 'staging-live-test', grantedAtMs: Date.now() });
      return 'moderators/{m} set';
    });
  },

  async media() {
    const [a, b, m] = [await session('a'), await session('b'), await session('m')];
    let url;
    await check('upload: no token 401, oversize 413, non-image 415', async () => {
      assert((await upload(null, 'post')).status === 401, 'no token');
      assert((await upload(a, 'post', Buffer.alloc(2 * 1024 * 1024 + 1))).status === 413, 'oversize');
      assert((await upload(a, 'post', Buffer.from('<html>'), 'text/html')).status === 415, 'type');
      return 'ok';
    });
    await check('upload: owner upload returns an opaque worker media URL', async () => {
      const r = await upload(a, 'post');
      assert(r.status === 200 && /\/media\/[0-9a-f]{32}$/.test(r.body.photoURL), `status ${r.status}`);
      url = r.body.photoURL; state.ids.url1 = url; save();
      return 'id 32 hex';
    });
    await check('view: owner 200 no-store, other user 404 while unattached, no token 401', async () => {
      const own = await view(a, url);
      assert(own.status === 200 && own.cache === 'private, no-store' && own.vary === 'Authorization' && own.bytes.equals(PNG), JSON.stringify({ ...own, bytes: !!own.bytes }));
      assert((await view(b, url)).status === 404, 'other user');
      assert((await view(null, url)).status === 401, 'no token');
      return 'ok';
    });
    await check('public post attaches media: other user 200 with private, max-age=300', async () => {
      state.ids.post1 = await a.posts.createPost(postInput(a, [url], 'Live staging photo'));
      save();
      const v = await view(b, url);
      assert(v.status === 200 && v.cache === 'private, max-age=300', JSON.stringify({ status: v.status, cache: v.cache }));
      return 'ok';
    });
    await check('direct Firestore privacy change (client SDK) revokes on next request', async () => {
      await a.posts.updatePost(state.ids.post1, a.uid, { visibility: 'private' });
      const hidden = await view(b, url);
      await a.posts.updatePost(state.ids.post1, a.uid, { visibility: 'public' });
      const back = await view(b, url);
      assert(hidden.status === 404 && back.status === 200, `private ${hidden.status}, public again ${back.status}`);
      return 'private 404, public 200';
    });
    await check('report auto-hide at 3 reports (client SDK) hides media; moderator can still review', async () => {
      for (const r of ['r1', 'r2', 'r3']) await (await session(r)).firestore.reportContent((await session(r)).uid, 'post', state.ids.post1, 'spam', 'live test');
      const doc = await adminGet(`travelPosts/${state.ids.post1}`);
      assert(doc.visibility === 'under_review', `visibility ${doc.visibility}`);
      const other = await view(b, url);
      const mod = await view(m, url);
      assert(other.status === 404 && mod.status === 200 && mod.cache === 'private, no-store', `other ${other.status}, moderator ${mod.status} ${mod.cache}`);
      return 'under_review: other 404, moderator 200 no-store';
    });
    await check('moderator removal: visibility removed, remove-media revokes and deletes KV bytes', async () => {
      await m.moderation.setContentVisibility('post', state.ids.post1, m.uid, 'removed');
      const r = await fetch(`${API}/moderation/remove-media`, { method: 'POST', headers: { Authorization: `Bearer ${await m.token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'post', targetId: state.ids.post1 }) });
      const body = await r.json();
      const id = url.split('/').pop();
      const row = d1(`SELECT status, kv_delete_pending FROM media WHERE id = '${id}'`)[0];
      const ownerView = await view(a, url);
      assert(r.status === 200 && body.removed === 1 && row.status === 'removed' && row.kv_delete_pending === 0 && ownerView.status === 404,
        JSON.stringify({ status: r.status, body, row, owner: ownerView.status }));
      return 'removed=1, D1 removed, bytes deleted, owner 404';
    });
    await check('profile photo: shared while current; replaced photo revoked', async () => {
      const p1 = (await upload(a, 'profile')).body.photoURL;
      await a.firestore.updateUserProfile(a.uid, { photoURL: p1 });
      const v1 = await view(b, p1);
      const p2 = (await upload(a, 'profile')).body.photoURL;
      await a.firestore.updateUserProfile(a.uid, { photoURL: p2 });
      const old = await view(b, p1);
      const cur = await view(b, p2);
      state.ids.profile = p2; save();
      assert(v1.status === 200 && old.status === 404 && cur.status === 200, `first ${v1.status}, replaced ${old.status}, current ${cur.status}`);
      return 'ok';
    });
  },

  async content() {
    const [a, b] = [await session('a'), await session('b')];
    await check('A and B create linked social content through the app modules', async () => {
      const img = (await upload(a, 'post')).body.photoURL;
      state.ids.post2 = await a.posts.createPost(postInput(a, [img], 'A keeps this until deletion'));
      state.ids.bPost = await b.posts.createPost(postInput(b, [], 'B post'));
      await a.posts.likePost(state.ids.bPost, a.uid);
      await b.posts.likePost(state.ids.post2, b.uid);
      state.ids.aComment = await a.posts.addComment({ postId: state.ids.bPost, authorId: a.uid, authorName: 'Live A', authorPhoto: null, text: 'nice trip', parentCommentId: null });
      state.ids.bReply = await b.posts.addComment({ postId: state.ids.bPost, authorId: b.uid, authorName: 'Live B', authorPhoto: null, text: 'thanks', parentCommentId: state.ids.aComment });
      await a.posts.followUser(a.uid, b.uid);
      await b.posts.followUser(b.uid, a.uid);
      const info = (n) => ({ name: n, initials: n.slice(-1) });
      state.ids.dm = await a.chat.getOrCreateDirectChat(a.uid, info('Live A'), b.uid, info('Live B'));
      await a.chat.sendDirectMessage(state.ids.dm, a.uid, 'hello from A', crypto.randomUUID(), [b.uid]);
      await b.chat.sendDirectMessage(state.ids.dm, b.uid, 'hello from B', crypto.randomUUID(), [a.uid]);
      state.ids.group = await b.chat.createGroup(b.uid, 'Live trip group', [b.uid, a.uid], { [b.uid]: info('Live B'), [a.uid]: info('Live A') });
      await a.chat.sendGroupMessage(state.ids.group, a.uid, 'Live A', 'group hello', crypto.randomUUID()).catch((e) => { throw new Error(`group message: ${e.message}`); });
      save();
      const bp = await adminGet(`travelPosts/${state.ids.bPost}`);
      assert(bp.likeCount === 1 && bp.commentCount === 2, JSON.stringify({ likeCount: bp.likeCount, commentCount: bp.commentCount }));
      return 'posts, likes, comment+reply, follows, DM, group';
    });
  },

  async 'delete-a'() {
    const [a, b] = [await session('a'), await session('b')];
    const aUid = a.uid;
    const mediaIds = d1(`SELECT id FROM media WHERE owner_uid = '${aUid}'`).map((r) => r.id);
    let slices;
    await check('A deletion completes across bounded slices (202 … 200)', async () => {
      slices = await deleteUntilDone(a);
      const last = slices[slices.length - 1];
      assert(last.status === 200 && last.state === 'deleted', JSON.stringify(slices.slice(-3)));
      return `${slices.length} invocations (${slices.filter((x) => x.status === 202).length} × 202)`;
    });
    await check('A: Auth account gone (sign-in refused)', async () => {
      try { await sdkAuth.signInWithEmailAndPassword(sdkAuth.getAuth(sdkApp.initializeApp(config, 'sts-recheck-a')), state.users.a.email, state.users.a.password); }
      catch (e) { return e.code; }
      throw new Error('sign-in still works');
    });
    await check('A: private and public data deleted', async () => {
      const gone = [`users/${aUid}`, `publicProfiles/${aUid}`, `userLookup/${aUid}`, `travelPosts/${state.ids.post1}`, `travelPosts/${state.ids.post2}`,
        `follows/${aUid}___${b.uid}`, `follows/${b.uid}___${aUid}`, `postLikes/${state.ids.bPost}___${aUid}`, `postLikes/${state.ids.post2}___${b.uid}`];
      const present = [];
      for (const p of gone) if (await adminGet(p)) present.push(p.split('/')[0]);
      assert(!present.length, `still present: ${present.join(',')}`);
      assert((await adminQuery('travelPosts', 'authorId', 'EQUAL', aUid)).length === 0, 'posts by A remain');
      return `${gone.length} documents absent`;
    });
    await check('A: media revoked and bytes deleted (D1), legacy Storage proven never provisioned', async () => {
      const rows = mediaIds.length ? d1(`SELECT status, kv_delete_pending FROM media WHERE owner_uid = '${aUid}'`) : [];
      assert(rows.every((r) => r.status === 'removed' && r.kv_delete_pending === 0), JSON.stringify(rows));
      const rec = await adminGet(`legacyMediaCleanup/${aUid}`);
      assert(rec && rec.status === 'verified_absent' && rec.proof === 'bucket-not-provisioned', JSON.stringify(rec));
      const job = await adminGet(`accountDeletions/${aUid}`);
      assert(job.status === 'completed', `job ${job.status}`);
      return `${rows.length} media rows removed+purged; proof bucket-not-provisioned; job completed`;
    });
    await check("B retains only B's data; counters and shared spaces are consistent", async () => {
      const bp = await adminGet(`travelPosts/${state.ids.bPost}`);
      const bProfile = await adminGet(`publicProfiles/${b.uid}`);
      const comment = await adminGet(`postComments/${state.ids.aComment}`);
      const reply = await adminGet(`postComments/${state.ids.bReply}`);
      const dm = await adminGet(`direct_chats/${state.ids.dm}`);
      const group = await adminGet(`groups/${state.ids.group}`);
      const problems = [];
      if (bp.authorId !== b.uid || bp.likeCount !== 0 || bp.commentCount !== 1) problems.push(`bPost ${JSON.stringify({ a: bp.authorId === b.uid, likeCount: bp.likeCount, commentCount: bp.commentCount })}`);
      if (bProfile.followersCount !== 0 || bProfile.followingCount !== 0) problems.push(`B follow counts ${bProfile.followersCount}/${bProfile.followingCount}`);
      if (!(comment.isDeleted === true && comment.text === '' && comment.authorName === 'Deleted User' && comment.replyCount === 1)) problems.push('A comment not tombstoned');
      if (!(reply && reply.authorId === b.uid && reply.text === 'thanks')) problems.push('B reply changed');
      if (!(dm && dm.participantInfo[aUid].name === 'Deleted User' && dm.participantInfo[b.uid].name === 'Live B' && dm.unreadCounts[aUid] === undefined)) problems.push('DM not anonymized');
      if (!(group && JSON.stringify(group.members) === JSON.stringify([b.uid]) && group.memberInfo[aUid] === undefined)) problems.push('group membership');
      const retainedByA = (await adminQuery('postComments', 'authorId', 'EQUAL', aUid)).filter((c) => !(c.data.isDeleted && c.data.authorName === 'Deleted User'));
      if (retainedByA.length) problems.push(`${retainedByA.length} non-anonymized A comments`);
      assert(!problems.length, problems.join('; '));
      return 'post/counters/comment tombstone/reply/DM/group as expected';
    });
    state.ids.aSlices = slices; save();
  },

  async 'seed-large'(key = 'l') {
    const b = await session('b');
    const l = state.users[key] ? await session(key) : await newUser(key);
    await check('large account L: 20 photo posts, 15 likes, 25 comments, follows, DM, group', async () => {
      state.ids[`${key}Images`] = state.ids[`${key}Images`] || [];
      for (let i = state.ids[`${key}Images`].length; i < 20; i++) {
        const up = await upload(l, 'post');
        assert(up.status === 200, `upload ${i}: ${up.status}`);
        await l.posts.createPost(postInput(l, [up.body.photoURL], `L post ${i}`));
        state.ids[`${key}Images`].push(up.body.photoURL); save();
      }
      state.ids.bPosts = state.ids.bPosts || [];
      while (state.ids.bPosts.length < 15) { state.ids.bPosts.push(await b.posts.createPost(postInput(b, [], `B post ${state.ids.bPosts.length}`))); save(); }
      for (const id of state.ids.bPosts) await l.posts.likePost(id, l.uid);
      for (let i = 0; i < 25; i++) await l.posts.addComment({ postId: state.ids.bPosts[0], authorId: l.uid, authorName: 'Live L', authorPhoto: null, text: `comment ${i}`, parentCommentId: null });
      await l.posts.followUser(l.uid, b.uid);
      await b.posts.followUser(b.uid, l.uid);
      const info = (n) => ({ name: n, initials: n.slice(-1) });
      const dm = await l.chat.getOrCreateDirectChat(l.uid, info('Live L'), b.uid, info('Live B'));
      for (let i = 0; i < 10; i++) await l.chat.sendDirectMessage(dm, l.uid, `message ${i}`, crypto.randomUUID(), [b.uid]);
      state.ids[`${key}Group`] = await b.chat.createGroup(b.uid, 'Large group', [b.uid, l.uid], { [b.uid]: info('Live B'), [l.uid]: info('Live L') });
      save();
      return `${state.ids[`${key}Images`].length} images, ${state.ids.bPosts.length} liked posts`;
    });
    await check("views: B views each of L's 20 images twice (shared, private max-age=300)", async () => {
      let ok = 0;
      for (let r = 0; r < 2; r++) for (const url of state.ids[`${key}Images`]) { const v = await view(b, url); if (v.status === 200 && v.cache === 'private, max-age=300') ok++; }
      assert(ok === 40, `${ok}/40`);
      return '40/40';
    });
  },

  async 'delete-large'(key = 'l') {
    const l = await session(key);
    const b = await session('b');
    await check('large account L: deletion completes across small slices', async () => {
      const slices = await deleteUntilDone(l, 400);
      const last = slices[slices.length - 1];
      assert(last.status === 200 && last.state === 'deleted', JSON.stringify(slices.slice(-3)));
      state.ids[`${key}Slices`] = slices.length; save();
      return `${slices.length} invocations (${slices.filter((x) => x.status === 202).length} × 202, ${slices.filter((x) => x.status >= 400).length} errors)`;
    });
    await check("large account L: B's posts keep exact counters; L's data and media gone", async () => {
      const counts = [];
      for (const id of state.ids.bPosts) { const p = await adminGet(`travelPosts/${id}`); counts.push(p.likeCount); }
      const first = await adminGet(`travelPosts/${state.ids.bPosts[0]}`);
      const rows = d1(`SELECT status, kv_delete_pending FROM media WHERE owner_uid = '${l.uid}'`);
      const left = (await adminQuery('travelPosts', 'authorId', 'EQUAL', l.uid)).length;
      assert(counts.every((c) => c === 0) && first.commentCount === 0 && left === 0 && rows.length === 20 && rows.every((r) => r.status === 'removed' && r.kv_delete_pending === 0)
        && (await adminGet(`publicProfiles/${b.uid}`)).followersCount === 0,
        JSON.stringify({ likeCounts: [...new Set(counts)], commentCount: first.commentCount, postsLeft: left, mediaRows: rows.length }));
      return 'likeCount 0 on 15 posts, commentCount 0, 20 media rows purged, follows released';
    });
  },

  async concurrency() {
    const b = await session('b');
    const cc = state.users.cc ? await session('cc') : await newUser('cc');
    let urls = [];
    await check('10 parallel uploads all succeed with distinct opaque IDs', async () => {
      const rs = await Promise.all(Array.from({ length: 10 }, () => upload(cc, 'post')));
      assert(rs.every((r) => r.status === 200), JSON.stringify(rs.map((r) => r.status)));
      urls = rs.map((r) => r.body.photoURL);
      assert(new Set(urls).size === 10, 'duplicate IDs');
      state.ids.ccPost = await cc.posts.createPost(postInput(cc, urls, 'parallel'));
      save();
      return '10/10';
    });
    await check('40 parallel views (owner and another user) return the right decision', async () => {
      const rs = await Promise.all([...urls, ...urls].map((u, i) => view(i % 2 ? b : cc, u)));
      const ok = rs.filter((r) => r.status === 200 && r.bytes && r.bytes.equals(PNG)).length;
      assert(ok === 20 && rs.length === 20, `${ok}/${rs.length}`);
      const more = await Promise.all(urls.flatMap((u) => [view(b, u), view(cc, u)]));
      assert(more.every((r) => r.status === 200), JSON.stringify(more.map((r) => r.status)));
      return '40/40 (20 + 20)';
    });
    await check('two simultaneous deletion starts: the lease admits one; the deletion then completes once', async () => {
      await sdkAuth.signInWithEmailAndPassword(cc.auth, state.users.cc.email, state.users.cc.password);
      const token = await cc.auth.currentUser.getIdToken(true);
      const call = () => fetch(`${API}/account/delete`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
      const [r1, r2] = await Promise.all([call(), call()]);
      const statuses = [r1.status, r2.status].sort();
      assert(statuses.includes(409) && (statuses.includes(202) || statuses.includes(200)), JSON.stringify([r1, r2]));
      let r = r1.status === 409 ? r2 : r1;
      for (let i = 0; i < 40 && r.status === 202; i++) r = await call();
      assert(r.status === 200 && r.body.status === 'deleted', JSON.stringify(r));
      return `first pair ${JSON.stringify(statuses)}; completed`;
    });
  },

  async 'start-user'(key) {
    const s = state.users[key] ? await session(key) : await newUser(key);
    await check(`${key}: create content with media`, async () => {
      if (!state.ids[`${key}Post`]) {
        const img = (await upload(s, 'post')).body.photoURL; // absent while media bindings are missing
        state.ids[`${key}Post`] = await s.posts.createPost(postInput(s, img ? [img] : [], `${key} post`));
        save();
      }
      return 'ok';
    });
    await check(`${key}: deletion started (stops at first non-202, blocked or 200)`, async () => {
      const slices = await deleteUntilDone(s);
      state.ids[`${key}Start`] = slices; save();
      return JSON.stringify(slices.slice(-1)[0]) + ` after ${slices.length} invocation(s)`;
    });
  },

  async 'continue-user'(key) {
    const s = await session(key).catch(() => null);
    await check(`${key}: continuation with the account's own token`, async () => {
      if (!s) return 'account already deleted (sign-in refused)';
      const slices = await deleteUntilDone(s, 40, false);
      return JSON.stringify(slices.slice(-1)[0]) + ` after ${slices.length} invocation(s)`;
    });
  },

  async 'stored-media'(cutoffIso) {
    const b = await session('b');
    await check('media stored before consolidation (URLs already in Firestore) still authorize correctly', async () => {
      const cutoff = Date.parse(cutoffIso);
      const rows = d1(`SELECT id, owner_uid FROM media WHERE status = 'active' AND created_at < ${cutoff} ORDER BY created_at DESC LIMIT 12`);
      assert(rows.length > 0, 'no stored media before the cutoff');
      let shared = 0, ownerOnly = 0;
      for (const r of rows) {
        const url = `${WORKER}/media/${r.id}`;
        const refs = await adminQuery('travelPosts', 'images', 'ARRAY_CONTAINS', url);
        const publicRef = refs.some((d) => d.data.authorId === r.owner_uid && d.data.visibility === 'public' && d.data.isArchived !== true);
        const v = await view(b, url);
        if (publicRef) { assert(v.status === 200 && v.cache === 'private, max-age=300', `shared ${v.status}`); shared++; }
        else { assert(v.status === 404, `unattached/private ${v.status}`); ownerOnly++; }
      }
      return `${rows.length} stored URLs: ${shared} shared 200, ${ownerOnly} denied 404`;
    });
  },

  async 'jobs-pending'() {
    await check('pending-finalization jobs (read-only)', async () => {
      const rows = await adminQuery('accountDeletions', 'pendingFinalization', 'EQUAL', true);
      const now = Date.now();
      return JSON.stringify(rows.map((r) => ({ status: r.data.status, unresolved: r.data.legacyMediaUnresolved === true, leaseLive: Number(r.data.leaseUntil || 0) > now, attempts: r.data.attempts, step: r.data.currentStep ?? null })));
    });
  },

  async 'job-status'(key) {
    await check(`${key}: deletion job progress (read-only)`, async () => {
      const job = await adminGet(`accountDeletions/${state.users[key].uid}`);
      return JSON.stringify(job && { status: job.status, attempts: job.attempts, completedSteps: (job.completedSteps || []).length, currentStep: job.currentStep ?? null, blockedOn: job.blockedOn ?? null, lastError: job.lastError ? job.lastError.step : null });
    });
  },

  async 'verify-deleted'(key) {
    const uid = state.users[key].uid;
    await check(`${key}: job completed, Auth gone, data and media removed`, async () => {
      const job = await adminGet(`accountDeletions/${uid}`);
      const rec = await adminGet(`legacyMediaCleanup/${uid}`);
      const rows = d1(`SELECT status, kv_delete_pending FROM media WHERE owner_uid = '${uid}'`);
      let signIn = 'refused';
      try { await sdkAuth.signInWithEmailAndPassword(sdkAuth.getAuth(sdkApp.initializeApp(config, `sts-recheck-${key}`)), state.users[key].email, state.users[key].password); signIn = 'WORKS'; } catch {}
      assert(job && job.status === 'completed' && signIn === 'refused' && !(await adminGet(`users/${uid}`)) && rows.every((r) => r.status === 'removed' && r.kv_delete_pending === 0)
        && rec && rec.status === 'verified_absent', JSON.stringify({ job: job && { status: job.status, attempts: job.attempts, blockedOn: job.blockedOn ?? null }, signIn, rows, rec: rec && rec.status }));
      return `job completed after ${job.attempts} attempt(s); ${rows.length} media rows purged`;
    });
  },
};

(async () => {
  const [phase, arg] = process.argv.slice(2);
  if (!phases[phase]) throw new Error(`phases: ${Object.keys(phases).join(', ')}`);
  await phases[phase](arg);
  report();
  await closeAll();
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('live test error:', String(e && e.message || e).replace(/ya29\.[\w.-]+/g, '<token>').slice(0, 300)); process.exit(1); });
