// Thin front Worker for the Durable Object host (workers/r2-upload-worker/src/edge.ts).
//   node --no-warnings tests/release/edge.cjs
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { root, transpile } = require('./lib/fakes.cjs');

const SRC = path.join(root, 'workers/r2-upload-worker/src');
const cache = {};
function load(name, overrides) {
  if (cache[name]) return cache[name];
  const m = { exports: {} };
  cache[name] = m.exports;
  new Function('module', 'exports', 'require', transpile(path.join(SRC, `${name}.ts`)))(m, m.exports, (n) => {
    if (n in overrides) return overrides[n];
    if (n.startsWith('./')) return load(n.slice(2), overrides);
    return require(n);
  });
  return (cache[name] = m.exports);
}
class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
const edgeMod = load('edge', { 'cloudflare:workers': { DurableObject } });
const edge = edgeMod.default;

/** Fake namespace: records object names and forwarded requests; can be told to fail. */
function namespace({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    idFromName: (name) => ({ name }),
    get: (id) => ({
      fetch: async (req) => { calls.push({ name: id.name, method: req.method, url: req.url, bodyUsed: req.bodyUsed }); if (fail) throw new Error('Durable Object exceeded daily limit'); return new Response('from-object', { status: 299 }); },
      maintenance: async (t) => { calls.push({ name: id.name, rpc: 'maintenance', t }); },
    }),
  };
}
const W = 'https://api.test';
const jwt = (sub) => `x.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.y`;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('only public API routes are forwarded; internal and unknown paths answer 404 without reaching an object', async () => {
  const ns = namespace();
  const env = { API: ns };
  for (const [m, p] of [['GET', '/maintenance'], ['GET', '/__proof/burn'], ['POST', '/media/0123'], ['GET', '/media/upload/x'], ['DELETE', '/account/delete'], ['GET', '/admin/anything']]) {
    const r = await edge.fetch(new Request(W + p, { method: m }), env);
    assert.equal(r.status, 404, `${m} ${p}`);
  }
  assert.equal(ns.calls.length, 0);
  assert.equal((await edge.fetch(new Request(`${W}/account-deletion`), env)).status, 200, 'static page served by the front');
  assert.equal((await edge.fetch(new Request(`${W}/media/upload`, { method: 'OPTIONS' }), env)).status, 200);
  assert.equal(ns.calls.length, 0);
  for (const [m, p] of [['GET', `/media/${'a'.repeat(32)}`], ['POST', '/media/upload'], ['POST', '/moderation/remove-media'], ['POST', '/account/delete'], ['GET', '/admin/deletion-status'], ['POST', '/admin/account-deletion']]) {
    const r = await edge.fetch(new Request(W + p, { method: m, body: m === 'POST' ? 'x' : undefined }), env);
    assert.equal(r.status, 299, `${m} ${p} forwarded`);
  }
  assert.ok(ns.calls.every((c) => c.bodyUsed === false), 'the front never reads request bodies');
});

test('object names are bounded and chosen by the server; one account maps to one object; views shard by media id', async () => {
  const names = new Set();
  for (let i = 0; i < 2000; i++) {
    names.add(edgeMod.objectNameFor('POST', '/account/delete', `Bearer ${jwt(`user-${i}`)}`, 8));
    names.add(edgeMod.objectNameFor('GET', `/media/${i.toString(16).padStart(32, '0')}`, null, 8));
  }
  // Hostile input never produces a new name.
  for (const auth of [null, 'Bearer ', 'Bearer a.b.c', `Bearer ${jwt('x'.repeat(10000))}`, `Bearer ${jwt({ $ne: 1 })}`, 'Basic abc']) names.add(edgeMod.objectNameFor('POST', '/media/upload', auth, 8));
  assert.deepEqual([...names].sort(), Array.from({ length: 8 }, (_, i) => `api-${i}`).sort());
  const a = edgeMod.objectNameFor('POST', '/account/delete', `Bearer ${jwt('alice')}`, 8);
  assert.equal(edgeMod.objectNameFor('POST', '/media/upload', `Bearer ${jwt('alice')}`, 8), a, "one account's requests share an object");
  assert.equal(edgeMod.routingSubject(`Bearer ${jwt('alice')}`), 'alice');
  assert.equal(edgeMod.routingSubject('Bearer not-a-jwt'), '');
  const ns = namespace();
  await edge.fetch(new Request(`${W}/media/upload`, { method: 'POST', body: 'x' }), { API: ns, API_SHARDS: '100000' });
  assert.ok(/^api-([0-9]|[1-5][0-9]|6[0-3])$/.test(ns.calls[0].name), 'shard count is capped at 64');
});

test('object unavailable (daily limit, overload, reset): fail closed with 503 no-store, nothing served', async () => {
  const r = await edge.fetch(new Request(`${W}/media/${'b'.repeat(32)}`, { headers: { Authorization: 'Bearer t' } }), { API: namespace({ fail: true }) });
  assert.equal(r.status, 503);
  assert.match(r.headers.get('Cache-Control'), /no-store/);
  assert.equal((await r.json()).code, 'service/unavailable');
});

test('cron reaches maintenance only through RPC on the fixed maintenance object', async () => {
  const ns = namespace();
  const waits = [];
  await edge.scheduled({ scheduledTime: 1234 }, { API: ns }, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.deepEqual(ns.calls, [{ name: 'maintenance', rpc: 'maintenance', t: 1234 }]);
  const src = fs.readFileSync(path.join(SRC, 'edge.ts'), 'utf8');
  assert.ok(!/formData\(|\.json\(\)|\.text\(\)|arrayBuffer\(|verifyFirebaseToken/.test(src.split('export default')[1]), 'front does no body parsing or token verification');
});

test('staging is the Durable Object host on its existing hostname; production config has no Durable Object; one schedule', () => {
  const toml = fs.readFileSync(path.join(root, 'workers/r2-upload-worker/wrangler.toml'), 'utf8');
  const [prod, staging] = toml.split('[env.staging]');
  const settings = (t) => t.split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join('\n');
  assert.ok(!/durable_objects|migrations|edge\.ts/.test(settings(prod)), 'production section unchanged: plain Worker, no Durable Object');
  assert.match(settings(prod), /^main\s*=\s*"src\/index\.ts"/m);
  assert.match(staging, /^name = "solotravelsoul-r2-upload-staging"/m, 'existing staging hostname kept');
  assert.match(staging, /^main = "src\/edge\.ts"/m);
  assert.match(staging, /\[\[env\.staging\.durable_objects\.bindings\]\]\s*name = "API"\s*class_name = "ApiShard"/);
  assert.match(staging, /\[\[env\.staging\.migrations\]\]\s*tag = "v1"\s*new_sqlite_classes = \["ApiShard"\]/);
  assert.equal((staging.match(/crons = \[/g) || []).length, 1, 'exactly one staging schedule');
  assert.ok(!fs.existsSync(path.join(root, 'workers/r2-upload-worker/wrangler.do-staging.toml')), 'proof config retired');
});

test('emulator wiring is ignored for anything but demo-* projects; emulator tokens are refused elsewhere', () => {
  const index = load('index', { 'cloudflare:workers': { DurableObject } });
  const hosts = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8188', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9189', STORAGE_EMULATOR_HOST: '127.0.0.1:9188' };
  assert.deepEqual(index.emulatorsFor({ FIREBASE_PROJECT_ID: 'solotravelsoul-staging', ...hosts }), {});
  assert.deepEqual(index.emulatorsFor({ FIREBASE_PROJECT_ID: 'solotravelsoul-57a9e', ...hosts }), {});
  assert.deepEqual(index.emulatorsFor({ FIREBASE_PROJECT_ID: 'demo-x', ...hosts }), { firestore: hosts.FIRESTORE_EMULATOR_HOST, auth: hosts.FIREBASE_AUTH_EMULATOR_HOST, storage: hosts.STORAGE_EMULATOR_HOST });
  const auth = load('auth', {});
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const tok = (project) => `${enc({ alg: 'none' })}.${enc({ iss: `https://securetoken.google.com/${project}`, aud: project, sub: 'u', exp: now + 600, auth_time: now })}.`;
  assert.throws(() => auth.verifyEmulatorToken(tok('solotravelsoul-staging'), 'solotravelsoul-staging'), /demo projects/);
  assert.equal(auth.verifyEmulatorToken(tok('demo-x'), 'demo-x').uid, 'u');
  assert.throws(() => auth.verifyEmulatorToken(tok('demo-y'), 'demo-x'), /issuer|audience/);
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} edge checks passed`);
})();
