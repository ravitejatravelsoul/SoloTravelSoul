// Offline checks for the staging demo feed (scripts/seedStagingFeed.cjs, scripts/stagingFeedContent.cjs).
// No network: content invariants and the seeder's safety guards.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { root, transpile } = require('./lib/fakes.cjs');
const C = require(path.join(root, 'scripts/stagingFeedContent.cjs'));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const moderation = (() => {
  const m = { exports: {} };
  new Function('module', 'exports', 'require', transpile(path.join(root, 'packages/shared/src/moderation.ts')))(m, m.exports, require);
  return m.exports;
})();
const seeder = fs.readFileSync(path.join(root, 'scripts/seedStagingFeed.cjs'), 'utf8');

test('content: 8 fictional demo travelers, 24 photo posts, 4 photo journals, unique stable keys', () => {
  assert.equal(C.SEED_ID, 'sts-demo-feed-v1');
  assert.equal(C.TRAVELERS.length, 8);
  assert.equal(C.POSTS.length, 24);
  assert.equal(C.JOURNALS.length, 4);
  for (const t of C.TRAVELERS) {
    assert.match(t.name, / \(Demo\)$/);
    assert.match(t.bio, /^Demo profile \(fictional\)\./);
  }
  const keys = [...C.TRAVELERS, ...C.POSTS, ...C.JOURNALS].map((x) => x.key).concat(C.COMMENTS.map((c) => c[1]));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(C.POSTS.every((p) => p.scenes.length >= 1 && p.scenes.length <= 10));
  assert.ok(C.JOURNALS.every((j) => j.scenes.length >= 2 && /^Demo journal/.test(j.subtitle) && /demo journal written for testing/.test(j.body)));
  assert.ok(new Set(C.POSTS.map((p) => p.loc)).size >= 15, 'several destinations');
  assert.ok(C.POSTS.every((p) => !['hotel'].includes(p.type)), 'no hotel reviews');
});

test('content passes the app text filter and length limits (rules clean())', () => {
  const texts = [...C.TRAVELERS.flatMap((t) => [t.name, t.bio, t.city]), ...C.POSTS.flatMap((p) => [p.caption, p.loc, p.country]),
    ...C.JOURNALS.flatMap((j) => [j.title, j.subtitle, j.body, j.loc]), ...C.COMMENTS.map((c) => c[3])];
  for (const t of texts) assert.equal(moderation.containsBlockedTerm(t), false, t.slice(0, 40));
  const rules = new RegExp(moderation.BLOCKED_TERMS_RULES_PATTERN.replace('(?is)', ''), 'is');
  for (const t of texts) assert.equal(rules.test(t), false, t.slice(0, 40));
  assert.ok(C.POSTS.every((p) => p.caption.length <= 500));
  assert.ok(C.COMMENTS.every((c) => c[3].length > 0 && c[3].length <= 500));
});

test('relationships: no self-follows or self-likes, unique edges, replies follow their parent on the same post', () => {
  const keys = new Set(C.TRAVELERS.map((t) => t.key));
  const edges = C.FOLLOWS.map(([a, b]) => `${a}>${b}`);
  assert.equal(new Set(edges).size, edges.length);
  assert.ok(C.FOLLOWS.every(([a, b]) => a !== b && keys.has(a) && keys.has(b)));
  let likes = 0;
  C.POSTS.forEach((p, i) => {
    const l = C.likesFor(p, i);
    likes += l.length;
    assert.ok(l.length >= 1 && !l.includes(p.by) && new Set(l).size === l.length && l.every((k) => keys.has(k)), p.key);
  });
  for (const [j, bys] of Object.entries(C.JOURNAL_LIKES)) assert.ok(!bys.includes(C.JOURNALS.find((x) => x.key === j).by));
  assert.ok(likes >= 60);
  const seen = new Map();
  for (const [post, key, by, , replyTo] of C.COMMENTS) {
    assert.ok(C.POSTS.some((p) => p.key === post) && keys.has(by), key);
    if (replyTo) assert.equal(seen.get(replyTo), post, `${key} replies to an earlier comment on the same post`);
    seen.set(key, post);
  }
});

test('seeder guards: staging project and Worker verified every run, never reads apps/mobile/.env, state outside the repo', () => {
  assert.match(seeder, /const PROJECT = 'solotravelsoul-staging';/);
  assert.match(seeder, /function stagingTargets\(\)/);
  assert.match(seeder, /const t = stagingTargets\(\);/);
  assert.match(seeder, /checkStagingIsolation\.cjs/);
  assert.match(seeder, /config\.projectId !== PROJECT/);
  assert.match(seeder, /claims\.aud !== PROJECT/);
  assert.match(seeder, /FIREBASE_PROJECT_ID'\) !== PROJECT/);
  assert.doesNotMatch(seeder, /apps\/mobile\/\.env['"`]|dotenv|readDotenv/);
  assert.match(seeder, /State directory must be outside the repository/);
  assert.doesNotMatch(seeder, /console\.log\([^)]*password/i);
  assert.doesNotMatch(seeder, /firebase-admin/);
});

test('seeder writes through the app modules and the Worker; reruns resume; cleanup is manifest-only and dry run by default', () => {
  for (const fn of ['createPost', 'createJournal', 'followUser', 'likePost', 'likeJournal', 'addComment', 'upsertPublicProfile']) assert.match(seeder, new RegExp(`\\.${fn}\\(`));
  assert.match(seeder, /\/media\/upload/);
  assert.match(seeder, /hashtags: \['demo', \.\.\.p\.tags\]/);
  assert.match(seeder, /hashtags: \['demo', \.\.\.j\.tags\]/);
  assert.match(seeder, /refusing to duplicate/);
  assert.match(seeder, /await adopt\('travelPosts', p\.key\)/);
  assert.match(seeder, /if \(manifest\.posts\[p\.key\]\) continue;/);
  assert.match(seeder, /if \(!APPLY\) return \{ mode: 'dry-run'/);
  assert.match(seeder, /cleanup --apply also needs --confirm/);
  assert.match(seeder, /\/account\/delete/);
  assert.match(seeder, /not retried automatically/);
  // Cleanup acts only on manifest accounts.
  assert.match(seeder, /const accounts = Object\.entries\(manifest\.accounts\);/);
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} staging feed checks passed`);
})();
