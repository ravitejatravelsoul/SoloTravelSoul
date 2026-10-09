// Behaviour tests: chat send queue and the DM/group chat hooks (no React renderer needed).
//   node tests/release/chatQueue.cjs
// A send the rules refuse (e.g. suspended account) is dropped and reported, never replayed after
// unsuspension; transient failures still retry and deliver.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function load(file, deps) {
  const m = { exports: {} };
  const src = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(src, { module: m, exports: m.exports, console: { error() {}, log() {}, warn() {} }, process: { env: {} }, Date, Math,
    require: (n) => { if (n in deps) return deps[n]; throw Error('Unexpected ' + n); } }, { filename: file });
  return m.exports;
}

// Values from the VM context have other prototypes; compare plain copies.
const deepEqual = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, m);
const err = (code) => Object.assign(new Error(code), { code });
const denied = () => err('permission-denied');

/** Fake backend: refuses every write while the sender is suspended, otherwise delivers (or fails as told). */
function backend() {
  const b = { suspended: false, offline: false, failNext: null, delivered: [] };
  const write = (kind) => async (...a) => {
    if (b.offline) throw err('unavailable');
    if (b.failNext) { const e = b.failNext; b.failNext = null; throw e; }
    if (b.suspended) throw denied();
    b.delivered.push(`${kind}:${a[kind === 'dm' ? 3 : 4]}`); // clientId
  };
  b.sendDirectMessage = write('dm');
  b.sendGroupMessage = write('group');
  return b;
}

function queueModule(be) {
  const data = new Map();
  const storage = { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); } };
  const lock = load('apps/mobile/utils/queueLock.ts', {});
  return load('apps/mobile/utils/chatQueue.ts', { './queueLock': lock, '@react-native-async-storage/async-storage': { default: storage },
    '@solotravelsoul/firebase': { sendDirectMessage: (...a) => be.sendDirectMessage(...a), sendGroupMessage: (...a) => be.sendGroupMessage(...a) } });
}

const dm = (id) => ({ type: 'dm.send', chatId: 'u_v', senderId: 'u', text: 'hi', clientId: id, otherUids: ['v'] });
const group = (id) => ({ type: 'group.send', groupId: 'g', senderId: 'u', senderName: 'U', text: 'hi', clientId: id });

/** Minimal hook runtime: state persists across renders; effects run once on mount (stable deps in these tests). */
function renderHook(make) {
  const states = [];
  let idx = 0, mounted = false;
  const effects = [];
  const react = {
    useState: (init) => { const i = idx++; if (!(i in states)) states[i] = init; return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; },
    useEffect: (fn) => { if (!mounted) effects.push(fn); },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  };
  const hook = make(react);
  const render = () => { idx = 0; const r = hook(); if (!mounted) { mounted = true; for (const e of effects) e(); } return r; };
  render();
  return render;
}

function chatHook(kind, be, cq, net) {
  const toasts = [];
  const authUser = { uid: 'u' };
  const auth = (sel) => sel({ user: authUser });
  auth.getState = () => ({ user: authUser });
  const firebase = kind === 'dm'
    ? { subscribeToDirectMessages: () => () => {}, sendDirectMessage: (...a) => be.sendDirectMessage(...a), markDirectChatRead: async () => {} }
    : { subscribeToGroupMessages: () => () => {}, sendGroupMessage: (...a) => be.sendGroupMessage(...a), markGroupRead: async () => {} };
  const render = renderHook((react) => {
    const mod = load(kind === 'dm' ? 'apps/mobile/hooks/useMessages.ts' : 'apps/mobile/hooks/useGroupChat.ts', {
      react, '@solotravelsoul/firebase': firebase, '@/utils/chatQueue': cq,
      '@/stores/authStore': { useAuthStore: auth },
      '@/hooks/useNetworkState': { useNetworkState: () => ({ isConnected: !net.offline }) },
      '@/stores/uiStore': { useUIStore: { getState: () => ({ addToast: (m, t) => toasts.push([t, m]) }) } },
      '@/hooks/useSyncEngine': { useSyncEngine: () => ({ notifyEnqueued() {} }) },
    });
    return kind === 'dm' ? () => mod.useMessages('u_v', ['v']) : () => mod.useGroupChat('g', 'U');
  });
  return { render, toasts };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('queue: suspended (permission denied) DM and group sends are dropped and reported; after unsuspension a new drain never delivers them', async () => {
  const be = backend();
  const cq = queueModule(be);
  const heard = [];
  cq.onChatOpsRejected((owner, ops) => heard.push([owner, ops.map((o) => o.clientId)]));
  await cq.enqueueChatOp('u', dm('d1'));
  await cq.enqueueChatOp('u', group('g1'));
  be.suspended = true;
  const r = await cq.processChatQueue('u');
  deepEqual([r.succeeded, r.failed, r.rejected.map((x) => `${x.type}:${x.clientId}`)], [0, 2, ['dm.send:d1', 'group.send:g1']]);
  assert.equal(await cq.getChatQueueSize('u'), 0, 'rejected sends are not kept for retry');
  deepEqual(heard, [['u', ['d1', 'g1']]]);
  be.suspended = false; // unsuspended
  for (let i = 0; i < 3; i++) await cq.processChatQueue('u');
  deepEqual(be.delivered, [], 'a refused message is never delivered later');
});

test('queue: a denial does not block other queued sends in the same drain', async () => {
  const be = backend();
  const cq = queueModule(be);
  await cq.enqueueChatOp('u', dm('a'));
  await cq.enqueueChatOp('u', group('b'));
  be.failNext = denied();
  const r = await cq.processChatQueue('u');
  deepEqual([r.succeeded, r.rejected.map((x) => x.clientId)], [1, ['a']]);
  deepEqual(be.delivered, ['group:b']);
  assert.equal(await cq.getChatQueueSize('u'), 0);
});

test('queue: transient failures keep the send and it is delivered on a later drain', async () => {
  const be = backend();
  const cq = queueModule(be);
  await cq.enqueueChatOp('u', dm('n1'));
  await cq.enqueueChatOp('u', group('n2'));
  be.offline = true; // network error: stop the drain, keep everything
  let r = await cq.processChatQueue('u');
  deepEqual([r.succeeded, r.failed, r.rejected.length, await cq.getChatQueueSize('u')], [0, 0, 0, 2]);
  be.offline = false;
  be.failNext = err('internal'); // other server error: retried, not dropped
  r = await cq.processChatQueue('u');
  deepEqual([r.succeeded, r.failed, r.rejected.length, await cq.getChatQueueSize('u')], [1, 1, 0, 1]);
  r = await cq.processChatQueue('u');
  deepEqual([r.succeeded, await cq.getChatQueueSize('u')], [1, 0]);
  deepEqual(be.delivered.sort(), ['dm:n1', 'group:n2']);
});

test('queue: ownership and single-flight are unchanged (per-user queues, one drain at a time)', async () => {
  const be = backend();
  const cq = queueModule(be);
  await cq.enqueueChatOp('u', dm('x'));
  await cq.enqueueChatOp('w', dm('y'));
  be.suspended = true;
  const [a, b] = await Promise.all([cq.processChatQueue('u'), cq.processChatQueue('u')]);
  assert.equal(a, b, 'concurrent callers share one drain');
  assert.equal(await cq.getChatQueueSize('w'), 1, "another user's queue is untouched");
});

for (const kind of ['dm', 'group']) {
  test(`${kind} hook online: a permission-denied send is removed, reported and not queued`, async () => {
    const be = backend();
    const cq = queueModule(be);
    const net = { offline: false };
    const h = chatHook(kind, be, cq, net);
    be.suspended = true;
    await h.render().sendMessage('blocked');
    deepEqual(h.render().messages, [], 'no pending bubble left behind');
    assert.equal(h.toasts.length, 1);
    assert.equal(h.toasts[0][0], 'error');
    assert.equal(await cq.getChatQueueSize('u'), 0, 'not queued for later delivery');
    be.suspended = false;
    await cq.processChatQueue('u');
    deepEqual(be.delivered, []);
  });

  test(`${kind} hook online: a transient failure queues the send and it is delivered later`, async () => {
    const be = backend();
    const cq = queueModule(be);
    const h = chatHook(kind, be, cq, { offline: false });
    be.failNext = err('unavailable');
    await h.render().sendMessage('later');
    assert.equal(h.render().messages.length, 1, 'still shown as pending');
    assert.equal(await cq.getChatQueueSize('u'), 1);
    await cq.processChatQueue('u');
    assert.equal(be.delivered.length, 1);
    assert.equal(await cq.getChatQueueSize('u'), 0);
  });

  test(`${kind} hook offline: queued send refused on reconnect (suspended) clears its bubble and is never delivered after unsuspension`, async () => {
    const be = backend();
    const cq = queueModule(be);
    const net = { offline: true };
    const h = chatHook(kind, be, cq, net);
    await h.render().sendMessage('offline');
    assert.equal(h.render().messages.length, 1);
    assert.equal(await cq.getChatQueueSize('u'), 1);
    net.offline = false;
    be.suspended = true;
    const r = await cq.processChatQueue('u');
    assert.equal(r.rejected.length, 1);
    deepEqual(h.render().messages, [], 'pending bubble removed after the rejection');
    be.suspended = false;
    await cq.processChatQueue('u');
    deepEqual(be.delivered, []);
  });
}

test('sync engine: rejected queued sends are reported to the user', async () => {
  const toasts = [];
  const state = { pendingOpsCount: 0, syncStatus: {}, setSyncStatus() {}, setPendingOpsCount() {} };
  const engine = load('apps/mobile/hooks/useSyncEngine.ts', {
    react: { useEffect() {}, useRef: (v) => ({ current: v }), useCallback: (f) => f },
    'react-native': { AppState: {} }, 'zustand/react/shallow': { useShallow: (f) => f },
    './useNetworkState': { useNetworkState: () => ({ isConnected: true }) },
    '@/stores/tripStore': { useTripStore: (f) => f(state) },
    '@/utils/syncQueue': { getQueueSize: async () => 0, processQueue: async () => ({ succeeded: 0, failed: 0 }) },
    '@/stores/authStore': { useAuthStore: { getState: () => ({ user: { uid: 'u' } }) } },
    '@/stores/uiStore': { useUIStore: { getState: () => ({ addToast: (m, t) => toasts.push([t, m]) }) } },
    '@/utils/chatQueue': { getChatQueueSize: async () => 0, processChatQueue: async () => ({ succeeded: 0, failed: 2, rejected: [{ type: 'dm.send', clientId: 'a' }, { type: 'group.send', clientId: 'b' }] }) },
    '@/utils/offlineCache': { getLatestSyncTime: async () => null, setLastSync: async () => {} },
  });
  await engine.useSyncEngine('u').sync();
  deepEqual(toasts.map((t) => t[0]), ['error']);
  assert.match(toasts[0][1], /2 queued messages were not sent/);
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} chat queue checks passed`);
})();
