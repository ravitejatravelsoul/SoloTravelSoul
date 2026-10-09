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

test('proof config is staging-only and isolated from production and the existing staging Worker', () => {
  const t = fs.readFileSync(path.join(root, 'workers/r2-upload-worker/wrangler.do-staging.toml'), 'utf8');
  assert.match(t, /^name = "solotravelsoul-api-do-staging"/m);
  assert.match(t, /new_sqlite_classes = \["ApiShard"\]/);
  assert.match(t, /FIREBASE_PROJECT_ID = "solotravelsoul-staging"/);
  assert.ok(!/solotravelsoul-57a9e|r2_buckets|"solotravelsoul-r2-upload"$/m.test(t), 'no production resource');
  const main = fs.readFileSync(path.join(root, 'workers/r2-upload-worker/wrangler.toml'), 'utf8');
  assert.ok(!/durable_objects|migrations\]\]/.test(main), 'existing Worker config unchanged (no Durable Objects)');
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} edge checks passed`);
})();
