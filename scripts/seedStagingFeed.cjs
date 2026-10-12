#!/usr/bin/env node
// Realistic demo feed for STAGING (solotravelsoul-staging) — physical-phone testing.
//
//   node --no-warnings scripts/seedStagingFeed.cjs plan                 # dry run (default): checks targets, prints what would be created
//   node --no-warnings scripts/seedStagingFeed.cjs seed --apply         # create or complete the feed (idempotent)
//   node --no-warnings scripts/seedStagingFeed.cjs verify               # read-only checks + authorized media views
//   node --no-warnings scripts/seedStagingFeed.cjs cleanup              # dry run: what cleanup would delete (manifest only)
//   node --no-warnings scripts/seedStagingFeed.cjs cleanup --apply --confirm sts-demo-feed-v1
//
// Content: scripts/stagingFeedContent.cjs (fictional "(Demo)" travelers, #demo posts and journals).
// Photos: generated locally by scripts/stagingFeedImages.py (no third-party images).
//
// Writes go through the app's own packages/firebase modules with the Firebase client SDK, signed
// in as each demo account (real security rules), and photos through the staging Worker's
// POST /media/upload (real KV/D1 media and access rules). The Firebase CLI owner login is used
// read-only (Auth lookup, Firestore REST reads) and `wrangler d1 execute` for D1 reads.
// Before every run it verifies the Firebase project and the Worker are staging; it never reads
// apps/mobile/.env (production settings).
//
// State (outside the repo, default %LOCALAPPDATA%\SoloTravelSoul\staging-demo-feed, or STS_FEED_DIR):
//   manifest.json      every account, document and media item created, keyed by stable content keys
//   credentials.json   demo account emails and generated passwords (0600; never printed)
//   images/            the generated photos
// Reruns resume from the manifest and never duplicate content. Cleanup deletes only manifest
// accounts, through the app's own account deletion (POST /account/delete with each account's
// own token), then verifies every manifest document and media row is gone.
/* global __dirname */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ts = require('typescript');
const C = require('./stagingFeedContent.cjs');

const ROOT = path.resolve(__dirname, '..');
const PROJECT = 'solotravelsoul-staging';
const WEB_APP_ID = '1:927322372618:web:9947970efca34c09ccbdf3';
const WORKER_NAME = 'solotravelsoul-r2-upload-staging';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const sh = (args, cwd = ROOT) => execFileSync(npx, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
const scrub = (s) => String(s).replace(/ya29\.[\w.-]+/g, '<token>').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>');

const args = process.argv.slice(2);
const phase = args[0] || 'plan';
const APPLY = args.includes('--apply');
const DIR = process.env.STS_FEED_DIR || path.join(process.env.LOCALAPPDATA || path.join(require('os').homedir(), '.local'), 'SoloTravelSoul', 'staging-demo-feed');
if (path.resolve(DIR).startsWith(ROOT)) throw new Error('State directory must be outside the repository.');
const MANIFEST = path.join(DIR, 'manifest.json');
const CREDS = path.join(DIR, 'credentials.json');
const IMAGES = path.join(DIR, 'images');
const emailFor = (key) => `${C.SEED_ID}-${key}@example.test`;
const VIEWER = { key: 'v1', name: 'QA Viewer (Demo)' };

// ── Target verification (every run) ───────────────────────────────────────────
function stagingTargets() {
  for (const k of ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID', 'GCLOUD_PROJECT']) {
    if (process.env[k] && process.env[k] !== PROJECT) throw new Error(`${k} is set to a non-staging project; refusing.`);
  }
  const toml = fs.readFileSync(path.join(ROOT, 'workers/r2-upload-worker/wrangler.toml'), 'utf8');
  const staging = toml.slice(toml.indexOf('[env.staging]'));
  const val = (k) => (staging.match(new RegExp(`${k}\\s*=\\s*"([^"]+)"`)) || [])[1];
  const worker = val('MEDIA_PUBLIC_ORIGIN');
  if (!/^https:\/\/solotravelsoul-r2-upload-staging\.[a-z0-9-]+\.workers\.dev$/.test(worker || '')) throw new Error('staging Worker origin not configured');
  if (val('FIREBASE_PROJECT_ID') !== PROJECT) throw new Error('staging Worker is not bound to the staging Firebase project');
  if (val('name') !== WORKER_NAME) throw new Error('unexpected staging Worker name');
  const iso = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'scripts/checkStagingIsolation.cjs')], { encoding: 'utf8' });
  if (iso.status !== 0) throw new Error(`staging isolation check failed (exit ${iso.status})`);
  const config = JSON.parse(sh(['firebase', 'apps:sdkconfig', 'WEB', WEB_APP_ID, '--project', PROJECT, '--json'])).result.sdkConfig;
  if (config.projectId !== PROJECT) throw new Error('Firebase web config is not the staging project');
  return { worker, config };
}

// ── State ─────────────────────────────────────────────────────────────────────
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const emptyManifest = () => ({ seedId: C.SEED_ID, project: PROJECT, worker: null, createdAt: new Date().toISOString(), updatedAt: null,
  accounts: {}, media: {}, posts: {}, journals: {}, follows: {}, likes: {}, comments: {}, cleanedAt: null });
let manifest = readJson(MANIFEST, null);
let creds = readJson(CREDS, { seedId: C.SEED_ID, accounts: {} });
function save() {
  fs.mkdirSync(DIR, { recursive: true });
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(CREDS, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

// ── App modules bound to one Firebase client app per account ─────────────────
let sdkApp, sdkAuth, sdkFs, CONFIG, WORKER;
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
let shared;
const sessions = {};
async function session(key) {
  if (sessions[key]) return sessions[key];
  const c = creds.accounts[key];
  const app = sdkApp.initializeApp(CONFIG, `sts-feed-${key}`);
  const auth = sdkAuth.getAuth(app);
  const db = sdkFs.initializeFirestore(app, { localCache: sdkFs.memoryLocalCache() });
  const cred = await sdkAuth.signInWithEmailAndPassword(auth, c.email, c.password);
  const claims = (await cred.user.getIdTokenResult()).claims;
  if (claims.aud !== PROJECT) throw new Error('signed-in token is not for the staging project');
  const overrides = { 'firebase/firestore': { ...sdkFs, initializeFirestore: () => db, getFirestore: () => db }, '@solotravelsoul/shared': shared, './config': { app }, './auth': { auth }, './firestore': { db } };
  const dir = path.join(ROOT, 'packages/firebase/src');
  const cache = {};
  const mods = {};
  for (const f of ['posts', 'firestore']) mods[f] = loadTs(path.join(dir, `${f}.ts`), { ...overrides, ...(f === 'firestore' ? {} : { './firestore': { db } }) }, cache);
  const s = { key, uid: cred.user.uid, app, auth, ...mods, token: () => cred.user.getIdToken() };
  return (sessions[key] = s);
}
async function closeAll() { for (const s of Object.values(sessions)) await sdkApp.deleteApp(s.app).catch(() => {}); }

// ── Owner (read-only) and D1 reads ────────────────────────────────────────────
let ownerToken;
async function owner() {
  if (ownerToken) return ownerToken;
  const ft = path.join(process.env.APPDATA || '', 'npm/node_modules/firebase-tools/lib');
  const { configstore } = require(path.join(ft, 'configstore.js'));
  ownerToken = (await require(path.join(ft, 'auth.js')).getAccessToken(configstore.get('tokens').refresh_token, [])).access_token;
  return ownerToken;
}
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const fsValue = (v) => (v == null ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'booleanValue' in v ? v.booleanValue
  : 'doubleValue' in v ? v.doubleValue : 'nullValue' in v ? null : 'arrayValue' in v ? (v.arrayValue.values || []).map(fsValue)
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fsValue(x)])) : 'timestampValue' in v ? v.timestampValue : v);
async function adminGet(p) {
  const r = await fetch(`${FS}/${p}`, { headers: { Authorization: `Bearer ${await owner()}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`read ${p.split('/')[0]}: ${r.status}`);
  return Object.fromEntries(Object.entries((await r.json()).fields || {}).map(([k, v]) => [k, fsValue(v)]));
}
async function adminQuery(collectionId, field, value) {
  const r = await fetch(`${FS}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${await owner()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } }) });
  if (!r.ok) throw new Error(`query ${collectionId}: ${r.status}`);
  return (await r.json()).filter((x) => x.document).map((x) => x.document.name.split('/documents/')[1]);
}
async function authUsersByEmail(emails) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST',
    headers: { Authorization: `Bearer ${await owner()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emails }) });
  if (!r.ok) throw new Error(`auth lookup ${r.status}`);
  return ((await r.json()).users || []).map((u) => ({ email: u.email, uid: u.localId }));
}
function d1(sql) {
  const out = sh(['wrangler', 'd1', 'execute', 'solotravelsoul-media-staging', '--env', 'staging', '--remote', '--json', '--command', JSON.stringify(sql)], path.join(ROOT, 'workers/r2-upload-worker'));
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}

// ── Worker calls ──────────────────────────────────────────────────────────────
async function upload(s, file, purpose) {
  const bytes = fs.readFileSync(file);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), path.basename(file));
  form.append('purpose', purpose);
  const r = await fetch(`${WORKER}/media/upload`, { method: 'POST', headers: { Authorization: `Bearer ${await s.token()}` }, body: form });
  const body = await r.json().catch(() => ({}));
  if (r.status !== 200 || !/\/media\/[0-9a-f]{32}$/.test(body.photoURL || '')) throw new Error(`upload ${path.basename(file)}: ${r.status} ${body.code || ''}`);
  return { url: body.photoURL, id: body.photoURL.split('/').pop(), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
async function view(s, url) {
  const r = await fetch(url, { headers: s ? { Authorization: `Bearer ${await s.token()}` } : {} });
  await r.arrayBuffer();
  return { status: r.status, cache: r.headers.get('cache-control') };
}

// ── Plan ──────────────────────────────────────────────────────────────────────
const travelerByKey = Object.fromEntries(C.TRAVELERS.map((t) => [t.key, t]));
const initials = (name) => name.replace(/\(Demo\)/, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
function plannedLikes() {
  const out = [];
  C.POSTS.forEach((p, i) => C.likesFor(p, i).forEach((by) => out.push({ key: `${p.key}:${by}`, target: 'post', item: p.key, by })));
  for (const [j, bys] of Object.entries(C.JOURNAL_LIKES)) bys.forEach((by) => out.push({ key: `${j}:${by}`, target: 'journal', item: j, by }));
  return out;
}
function imageSpec() {
  const images = [];
  for (const p of C.POSTS) p.scenes.forEach((scene, i) => images.push({ name: `${p.key}-${i}.jpg`, scene, label: `DEMO · ${p.loc}`, seed: `${C.SEED_ID}:${p.key}:${i}` }));
  for (const j of C.JOURNALS) j.scenes.forEach((scene, i) => images.push({ name: `${j.key}-${i}.jpg`, scene, label: `DEMO · ${j.loc}`, seed: `${C.SEED_ID}:${j.key}:${i}` }));
  const avatars = C.TRAVELERS.map((t) => ({ name: `${t.key}-avatar.jpg`, initials: initials(t.name), seed: `${C.SEED_ID}:${t.key}:avatar` }));
  return { images, avatars };
}
function summary() {
  const likes = plannedLikes();
  const spec = imageSpec();
  return { accounts: C.TRAVELERS.length + 1, travelers: C.TRAVELERS.length, viewer: 1, posts: C.POSTS.length, journals: C.JOURNALS.length,
    photos: spec.images.length, avatars: spec.avatars.length, follows: C.FOLLOWS.length, likes: likes.length, comments: C.COMMENTS.length };
}
function done() {
  const m = manifest || emptyManifest();
  return { accounts: Object.keys(m.accounts).length, media: Object.keys(m.media).length, posts: Object.keys(m.posts).length, journals: Object.keys(m.journals).length,
    follows: Object.keys(m.follows).length, likes: Object.keys(m.likes).length, comments: Object.keys(m.comments).length };
}

// ── Seed ──────────────────────────────────────────────────────────────────────
async function ensureAccount(key, name, profile) {
  if (manifest.accounts[key]) return session(key);
  const email = emailFor(key);
  if (!creds.accounts[key]) {
    const existing = await authUsersByEmail([email]);
    if (existing.length) throw new Error(`${key}: account exists in staging Auth but not in the manifest — refusing to duplicate (restore the state directory).`);
    creds.accounts[key] = { email, password: crypto.randomBytes(18).toString('base64url') };
    save();
  }
  const app = sdkApp.initializeApp(CONFIG, `sts-feed-create-${key}`);
  let uid;
  try {
    uid = (await sdkAuth.createUserWithEmailAndPassword(sdkAuth.getAuth(app), email, creds.accounts[key].password)).user.uid;
  } catch (e) {
    if (e.code !== 'auth/email-already-in-use') throw e;
    uid = (await sdkAuth.signInWithEmailAndPassword(sdkAuth.getAuth(app), email, creds.accounts[key].password)).user.uid; // resumed run
  }
  await sdkApp.deleteApp(app);
  const s = await session(key);
  if (!(await s.firestore.getUserProfile(s.uid))) await s.firestore.createUserProfile(s.uid, { email, name });
  manifest.accounts[key] = { uid, email, displayName: name, role: profile ? 'traveler' : 'viewer', docs: [`users/${uid}`, `publicProfiles/${uid}`] };
  save();
  return s;
}

async function seedProfiles() {
  const spec = imageSpec();
  for (const t of C.TRAVELERS) {
    const s = await ensureAccount(t.key, t.name, true);
    const mKey = `${t.key}-avatar`;
    if (!manifest.media[mKey]) {
      const up = await upload(s, path.join(IMAGES, `${t.key}-avatar.jpg`), 'profile');
      manifest.media[mKey] = { ...up, owner: t.key, purpose: 'profile', file: `${t.key}-avatar.jpg` };
      save();
    }
    await s.firestore.updateUserProfile(s.uid, { name: t.name, bio: t.bio, city: t.city, country: t.country, photoURL: manifest.media[mKey].url,
      travelStyles: t.styles, interests: t.interests, countriesVisited: t.visited, languages: ['English'], profileVisibility: 'public', showInNearbyTravelers: false });
    const profile = await s.firestore.getUserProfile(s.uid);
    await s.firestore.upsertPublicProfile(s.uid, { ...profile, profileVisibility: 'public' });
  }
  if (spec.avatars.length !== C.TRAVELERS.length) throw new Error('avatar spec mismatch');
  // Viewer for emulator UI checks: private profile, no content.
  const v = await ensureAccount(VIEWER.key, VIEWER.name, false);
  const vp = await v.firestore.getUserProfile(v.uid);
  await v.firestore.upsertPublicProfile(v.uid, { ...vp, profileVisibility: 'private' });
}

async function uploadFor(s, item, kind, ownerKey) {
  const urls = [];
  for (let i = 0; i < item.scenes.length; i++) {
    const mKey = `${item.key}-${i}`;
    if (!manifest.media[mKey]) {
      const up = await upload(s, path.join(IMAGES, `${mKey}.jpg`), kind);
      manifest.media[mKey] = { ...up, owner: ownerKey, purpose: kind, file: `${mKey}.jpg` };
      save();
    }
    urls.push(manifest.media[mKey].url);
  }
  return urls;
}
const demoKey = (k) => `${C.SEED_ID}:${k}`;
async function adopt(collection, key) {
  const hits = await adminQuery(collection, 'demoKey', demoKey(key));
  if (hits.length > 1) throw new Error(`${key}: ${hits.length} documents carry this key — resolve before continuing`);
  return hits[0] || null;
}

async function seedPosts() {
  for (const p of C.POSTS) {
    if (manifest.posts[p.key]) continue;
    const s = await session(p.by);
    const t = travelerByKey[p.by];
    const images = await uploadFor(s, p, 'post', p.by);
    let docPath = await adopt('travelPosts', p.key);
    if (!docPath) {
      const id = await s.posts.createPost({ authorId: s.uid, authorName: t.name, authorPhoto: manifest.media[`${p.by}-avatar`].url, caption: p.caption, body: '',
        location: p.loc, country: p.country, tripId: null, images, hashtags: ['demo', ...p.tags], postType: images.length > 1 ? 'carousel' : p.type,
        visibility: 'public', demoKey: demoKey(p.key) });
      docPath = `travelPosts/${id}`;
    }
    manifest.posts[p.key] = { id: docPath.split('/')[1], path: docPath, by: p.by, media: p.scenes.map((_, i) => `${p.key}-${i}`) };
    save();
  }
}

const readTime = (body) => Math.max(1, Math.ceil(body.split(/\s+/).filter(Boolean).length / 200));
async function seedJournals() {
  let synced = 0;
  for (const j of C.JOURNALS) {
    if (manifest.journals[j.key]) {
      // Existing journal: sync its text in place (author's own update, same rules as the app).
      const s = await session(j.by);
      const cur = await s.posts.getJournal(manifest.journals[j.key].id);
      if (cur && (cur.body !== j.body || cur.readTimeMinutes !== readTime(j.body))) {
        await s.posts.updateJournal(manifest.journals[j.key].id, { body: j.body, readTimeMinutes: readTime(j.body) });
        synced++;
      }
      continue;
    }
    const s = await session(j.by);
    const t = travelerByKey[j.by];
    const urls = await uploadFor(s, j, 'journal', j.by);
    let docPath = await adopt('travelJournals', j.key);
    if (!docPath) {
      const id = await s.posts.createJournal({ authorId: s.uid, authorName: t.name, authorPhoto: manifest.media[`${j.by}-avatar`].url, title: j.title, subtitle: j.subtitle,
        coverImageURL: urls[0], body: j.body, images: urls.slice(1), location: j.loc, country: j.country, tripId: null, hashtags: ['demo', ...j.tags],
        readTimeMinutes: readTime(j.body), visibility: 'public', demoKey: demoKey(j.key) });
      docPath = `travelJournals/${id}`;
    }
    manifest.journals[j.key] = { id: docPath.split('/')[1], path: docPath, by: j.by, media: j.scenes.map((_, i) => `${j.key}-${i}`) };
    save();
  }
  return synced;
}

async function seedFollows() {
  for (const [a, b] of C.FOLLOWS) {
    const key = `${a}>${b}`;
    if (manifest.follows[key]) continue;
    const s = await session(a);
    const to = manifest.accounts[b].uid;
    await s.posts.followUser(s.uid, to); // idempotent: deterministic edge ID
    manifest.follows[key] = { path: `follows/${s.uid}___${to}` };
    save();
  }
}

async function seedLikes() {
  for (const l of plannedLikes()) {
    if (manifest.likes[l.key]) continue;
    const s = await session(l.by);
    const target = l.target === 'post' ? manifest.posts[l.item] : manifest.journals[l.item];
    if (l.target === 'post') await s.posts.likePost(target.id, s.uid); else await s.posts.likeJournal(target.id, s.uid); // idempotent
    manifest.likes[l.key] = { path: `postLikes/${target.id}___${s.uid}`, target: l.target, item: l.item, by: l.by };
    save();
  }
}

async function seedComments() {
  for (const [postKey, cKey, by, text, replyTo] of C.COMMENTS) {
    if (manifest.comments[cKey]) continue;
    const s = await session(by);
    let docPath = await adopt('postComments', cKey);
    if (!docPath) {
      const id = await s.posts.addComment({ postId: manifest.posts[postKey].id, authorId: s.uid, authorName: travelerByKey[by].name,
        authorPhoto: manifest.media[`${by}-avatar`].url, text, parentCommentId: replyTo ? manifest.comments[replyTo].id : null, demoKey: demoKey(cKey) });
      docPath = `postComments/${id}`;
    }
    manifest.comments[cKey] = { id: docPath.split('/')[1], path: docPath, post: postKey, by, replyTo: replyTo || null };
    save();
  }
}

function generateImages() {
  fs.mkdirSync(IMAGES, { recursive: true });
  const spec = imageSpec();
  const missing = [...spec.images, ...spec.avatars].filter((i) => !fs.existsSync(path.join(IMAGES, i.name)));
  if (!missing.length) return 0;
  const specFile = path.join(DIR, 'image-spec.json');
  fs.writeFileSync(specFile, JSON.stringify(spec));
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(__dirname, 'stagingFeedImages.py'), specFile, IMAGES], { stdio: ['ignore', 'pipe', 'inherit'] });
  return missing.length;
}

// ── Verify ────────────────────────────────────────────────────────────────────
async function verify() {
  const problems = [];
  const expectLikes = {};
  for (const l of Object.values(manifest.likes)) expectLikes[`${l.target}:${l.item}`] = (expectLikes[`${l.target}:${l.item}`] || 0) + 1;
  const expectComments = {};
  for (const c of Object.values(manifest.comments)) expectComments[c.post] = (expectComments[c.post] || 0) + 1;
  for (const [k, p] of Object.entries(manifest.posts)) {
    const d = await adminGet(p.path);
    if (!d) { problems.push(`post ${k} missing`); continue; }
    if (d.visibility !== 'public' || d.isArchived || d.likeCount !== (expectLikes[`post:${k}`] || 0) || d.commentCount !== (expectComments[k] || 0) || !d.hashtags.includes('demo'))
      problems.push(`post ${k}: ${JSON.stringify({ v: d.visibility, likes: d.likeCount, comments: d.commentCount })}`);
  }
  for (const [k, j] of Object.entries(manifest.journals)) {
    const d = await adminGet(j.path);
    if (!d || d.likeCount !== (expectLikes[`journal:${k}`] || 0) || !d.coverImageURL) problems.push(`journal ${k}`);
  }
  const followers = {}, following = {};
  for (const key of Object.keys(manifest.follows)) { const [a, b] = key.split('>'); following[a] = (following[a] || 0) + 1; followers[b] = (followers[b] || 0) + 1; }
  for (const t of C.TRAVELERS) {
    const a = manifest.accounts[t.key];
    const pub = await adminGet(`publicProfiles/${a.uid}`);
    if (!pub || pub.profileVisibility !== 'public' || pub.followersCount !== (followers[t.key] || 0) || pub.followingCount !== (following[t.key] || 0) || !/\(Demo\)$/.test(pub.displayName))
      problems.push(`profile ${t.key}: ${JSON.stringify(pub && { vis: pub.profileVisibility, followers: pub.followersCount, following: pub.followingCount })}`);
    if (await adminGet(`accountDeletions/${a.uid}`)) problems.push(`${t.key} has a deletion barrier`);
  }
  for (const group of ['follows', 'likes', 'comments']) for (const [k, x] of Object.entries(manifest[group])) if (!(await adminGet(x.path))) problems.push(`${group} ${k} missing`);
  const ids = Object.values(manifest.media).map((m) => m.id);
  const rows = d1(`SELECT id, status FROM media WHERE id IN (${ids.map((i) => `'${i}'`).join(',')})`);
  if (rows.length !== ids.length || rows.some((r) => r.status !== 'active')) problems.push(`media rows ${rows.length}/${ids.length} active ${rows.filter((r) => r.status === 'active').length}`);
  // Authorized views through the Worker, as the viewer account (not an author).
  const v = await session(VIEWER.key);
  let shared = 0;
  for (const m of Object.values(manifest.media)) {
    const r = await view(v, m.url);
    if (r.status === 200 && (m.purpose === 'profile' || r.cache === 'private, max-age=300')) shared++; else problems.push(`view ${m.file}: ${r.status} ${r.cache}`);
  }
  const anon = await view(null, Object.values(manifest.media)[0].url);
  if (anon.status !== 401) problems.push(`anonymous view ${anon.status}`);
  return { problems, views: `${shared}/${ids.length}`, anonymous: anon.status };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanup() {
  const accounts = Object.entries(manifest.accounts);
  const docPaths = [...accounts.flatMap(([, a]) => a.docs), ...['posts', 'journals', 'follows', 'likes', 'comments'].flatMap((g) => Object.values(manifest[g]).map((x) => x.path))];
  const ids = Object.values(manifest.media).map((m) => m.id);
  const plan = { accounts: accounts.length, documents: docPaths.length, media: ids.length };
  if (!APPLY) return { mode: 'dry-run', wouldDelete: plan, how: 'POST /account/delete with each demo account\'s own token' };
  if (args[args.indexOf('--confirm') + 1] !== C.SEED_ID || !args.includes('--confirm')) throw new Error(`cleanup --apply also needs --confirm ${C.SEED_ID}`);
  const results = {};
  for (const [key] of accounts) {
    const c = creds.accounts[key];
    const app = sdkApp.initializeApp(CONFIG, `sts-feed-del-${key}`);
    let token;
    try { token = await (await sdkAuth.signInWithEmailAndPassword(sdkAuth.getAuth(app), c.email, c.password)).user.getIdToken(true); }
    catch (e) { results[key] = `sign-in refused (${e.code})`; await sdkApp.deleteApp(app); continue; }
    let last;
    for (let i = 0; i < 60; i++) {
      const r = await fetch(`${WORKER}/account/delete`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      last = { status: r.status, state: (await r.json().catch(() => ({}))).status };
      if (r.status !== 202) break;
    }
    results[key] = last;
    await sdkApp.deleteApp(app);
    if (!(last && last.status === 200 && last.state === 'deleted')) throw new Error(`${key}: deletion did not complete ${JSON.stringify(last)} — not retried automatically`);
  }
  const remaining = [];
  for (const p of docPaths) { const d = await adminGet(p); if (d && !(p.startsWith('postComments/') && d.isDeleted)) remaining.push(p.split('/')[0]); }
  const rows = d1(`SELECT status, kv_delete_pending FROM media WHERE id IN (${ids.map((i) => `'${i}'`).join(',')})`);
  const authLeft = await authUsersByEmail(accounts.map(([, a]) => a.email));
  manifest.cleanedAt = new Date().toISOString();
  save();
  return { mode: 'applied', deleted: results, documentsRemaining: remaining.length, remainingKinds: [...new Set(remaining)],
    mediaRows: rows.length, mediaNotPurged: rows.filter((r) => r.status !== 'removed' || r.kv_delete_pending).length, authAccountsLeft: authLeft.length };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  if (!['plan', 'seed', 'verify', 'cleanup'].includes(phase)) throw new Error('phases: plan | seed --apply | verify | cleanup [--apply --confirm <seedId>]');
  const t = stagingTargets();
  WORKER = t.worker; CONFIG = t.config;
  const page = await fetch(`${WORKER}/account-deletion`);
  if (page.status !== 200 || !(await page.text()).includes('SoloTravelSoul')) throw new Error('staging Worker is not serving');
  if (manifest && manifest.seedId !== C.SEED_ID) throw new Error(`manifest is for ${manifest.seedId}, content is ${C.SEED_ID}`);
  console.log(JSON.stringify({ project: PROJECT, worker: WORKER_NAME, seedId: C.SEED_ID, stateDir: '<local state directory>', manifest: !!manifest }));
  if (phase === 'plan' || (phase === 'seed' && !APPLY)) {
    const existing = manifest ? [] : await authUsersByEmail([...C.TRAVELERS.map((x) => emailFor(x.key)), emailFor(VIEWER.key)]);
    console.log(JSON.stringify({ mode: 'dry-run', planned: summary(), alreadyCreated: done(), unmanagedExistingAccounts: existing.length }));
    if (phase === 'seed') console.log('Add --apply to create.');
    return;
  }
  sdkApp = require('firebase/app'); sdkAuth = require('firebase/auth'); sdkFs = require('firebase/firestore');
  shared = loadTs(path.join(ROOT, 'packages/shared/index.ts'), {});
  if (phase === 'seed') {
    if (manifest && manifest.cleanedAt) throw new Error('this manifest was cleaned up; move the state directory aside to seed again');
    manifest = manifest || emptyManifest();
    manifest.worker = WORKER_NAME;
    save();
    const generated = generateImages();
    await seedProfiles();
    await seedPosts();
    const journalTextSynced = await seedJournals();
    await seedFollows();
    await seedLikes();
    await seedComments();
    console.log(JSON.stringify({ generatedImages: generated, journalTextSynced, created: done() }));
    const v = await verify();
    console.log(JSON.stringify({ verify: v.problems.length ? 'FAIL' : 'PASS', views: v.views, anonymous: v.anonymous, problems: v.problems }));
    if (v.problems.length) process.exitCode = 1;
  } else if (phase === 'verify') {
    if (!manifest) throw new Error('no manifest');
    const v = await verify();
    console.log(JSON.stringify({ counts: done(), verify: v.problems.length ? 'FAIL' : 'PASS', views: v.views, anonymous: v.anonymous, problems: v.problems }));
    if (v.problems.length) process.exitCode = 1;
  } else {
    if (!manifest) throw new Error('no manifest: nothing to clean up');
    console.log(JSON.stringify(await cleanup()));
  }
})().catch((e) => { console.error('seedStagingFeed error:', scrub(e && e.message || e).slice(0, 400)); process.exitCode = 1; })
  .finally(async () => { await closeAll(); process.exit(process.exitCode || 0); });
