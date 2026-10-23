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

function load(file, deps, extra = {}) {
  const m = { exports: {} };
  const src = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(src, { module: m, exports: m.exports, console: { error() {}, log() {}, warn() {} }, process: { env: {} }, Date, Math, Promise, setTimeout, clearTimeout, ...extra,
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
  // A fresh draft store per queue: the queue stashes texts it dropped there and the chat hooks hand them back to the composer.
  const draft = load('apps/mobile/utils/draftRestore.ts', {});
  const mod = load('apps/mobile/utils/chatQueue.ts', { './queueLock': lock, './draftRestore': draft, '@react-native-async-storage/async-storage': { default: storage },
    '@solotravelsoul/firebase': { sendDirectMessage: (...a) => be.sendDirectMessage(...a), sendGroupMessage: (...a) => be.sendGroupMessage(...a) } });
  mod.draft = draft;
  return mod;
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
      react, '@solotravelsoul/firebase': firebase, '@/utils/chatQueue': cq, '@/utils/draftRestore': cq.draft,
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
    assert.equal(h.render().restored.text, 'blocked', 'the refused text goes back to the composer');
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

  test(`${kind} hook: text of a queued send refused while the chat was closed is handed back when it is opened, once, and never delivered`, async () => {
    const be = backend();
    const cq = queueModule(be);
    await cq.enqueueChatOp('u', kind === 'dm' ? dm('z') : group('z')); // queued while offline; no chat screen is open
    be.suspended = true;
    const r = await cq.processChatQueue('u');
    assert.equal(r.rejected.length, 1);
    be.suspended = false;
    const opened = chatHook(kind, be, cq, { offline: false });
    assert.equal(opened.render().restored.text, 'hi', 'the text comes back when the chat is opened');
    assert.equal(opened.toasts.length, 1, 'with a message saying why');
    const again = chatHook(kind, be, cq, { offline: false });
    assert.equal(again.render().restored, null, 'it is handed back once');
    await cq.processChatQueue('u');
    deepEqual(be.delivered, [], 'and it was never delivered');
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
    assert.equal(h.render().restored.text, 'offline', 'and its text is back in the composer');
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

// ── Message-anomaly regressions (completion pass, 2026-10-23) ──────────────────────────────────────────────────────
// Observed on the emulator: a message sent while the connection was flapping neither appeared on the server nor
// stayed visible, and a queued message stayed pending until the app was relaunched. Causes found in the code:
//  1. the online path only queued a send AFTER the attempt failed; a send still in flight when the app was closed
//     existed only in memory and was lost;
//  2. one queued send that never answered blocked the whole drain, and with it every later sync;
//  3. a reopened chat did not show queued sends, so they looked lost until delivered.

/** Backend whose answers the test controls: delivery is idempotent per client id, like the real transaction. */
function controlledBackend() {
  const b = { hang: false, held: [], store: new Map(), writes: 0, offline: false, denied: false };
  const write = (kind) => (...a) => {
    const id = a[kind === 'dm' ? 3 : 4];
    b.writes++;
    const commit = () => { if (b.denied) throw denied(); if (!b.store.has(id)) b.store.set(id, `${kind}:${id}`); };
    if (b.offline) return Promise.reject(err('unavailable'));
    if (b.hang) return new Promise((resolve, reject) => b.held.push({ id, finish: () => { try { commit(); resolve(); } catch (e) { reject(e); } } }));
    try { commit(); return Promise.resolve(); } catch (e) { return Promise.reject(e); }
  };
  b.sendDirectMessage = write('dm');
  b.sendGroupMessage = write('group');
  return b;
}

/** A queue module over storage that survives a "restart" (a second module instance on the same data) and fake timers. */
function durableModule(be, data = new Map(), timers = fakeTimers()) {
  const storage = { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); } };
  const lock = load('apps/mobile/utils/queueLock.ts', {});
  const draft = load('apps/mobile/utils/draftRestore.ts', {});
  const mod = load('apps/mobile/utils/chatQueue.ts', { './queueLock': lock, './draftRestore': draft, '@react-native-async-storage/async-storage': { default: storage },
    '@solotravelsoul/firebase': { sendDirectMessage: (...a) => be.sendDirectMessage(...a), sendGroupMessage: (...a) => be.sendGroupMessage(...a) } }, timers);
  mod.draft = draft; mod.data = data; mod.timers = timers;
  return mod;
}
function fakeTimers() {
  const t = { now: 0, list: [] };
  t.setTimeout = (fn, ms) => { const h = { fn, at: t.now + ms, off: false }; t.list.push(h); return h; };
  t.clearTimeout = (h) => { if (h) h.off = true; };
  t.advance = async (ms) => { t.now += ms; for (const h of t.list.filter((x) => !x.off && x.at <= t.now)) { h.off = true; h.fn(); } for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return t;
}
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

for (const kind of ['dm', 'group']) {
  test(`${kind} anomaly 1: a send still in flight when the app is closed is on disk, and a relaunch delivers it exactly once`, async () => {
    const be = controlledBackend();
    const cq = durableModule(be);
    be.hang = true; // the connection dropped mid-send: the server never answers
    const net = { offline: false };
    const h = chatHook(kind, be, cq, net);
    const sending = h.render().sendMessage('in flight');
    await flush();
    assert.equal(h.render().messages.length, 1, 'shown as pending');
    assert.equal(await cq.getChatQueueSize('u'), 1, 'already saved on the device before the server answered');
    void sending; // the app is closed here: nothing more happens in this process
    // Relaunch: a new module instance over the same storage, connection back.
    be.hang = false;
    const relaunched = durableModule(be, cq.data);
    const r = await relaunched.processChatQueue('u');
    assert.equal(r.succeeded, 1);
    assert.equal(be.store.size, 1, 'delivered once');
    assert.equal(await relaunched.getChatQueueSize('u'), 0);
    await relaunched.processChatQueue('u');
    assert.equal(be.store.size, 1, 'a second drain adds nothing');
  });

  test(`${kind} anomaly 2: a send that never answers stops blocking after the time limit, stays queued, and the next drain delivers it once`, async () => {
    const be = controlledBackend();
    const timers = fakeTimers();
    const cq = durableModule(be, new Map(), timers);
    await cq.enqueueChatOp('u', kind === 'dm' ? dm('s1') : group('s1'));
    await cq.enqueueChatOp('u', kind === 'dm' ? dm('s2') : group('s2'));
    be.hang = true;
    const first = cq.processChatQueue('u');
    await flush();
    let settled = false; first.then(() => { settled = true; });
    await flush();
    assert.equal(settled, false, 'still waiting inside the limit');
    await timers.advance(cq.SEND_TIMEOUT_MS + 1);
    const r = await first;
    assert.equal(r.succeeded, 0);
    assert.equal(await cq.getChatQueueSize('u'), 2, 'nothing lost: both stay queued');
    be.hang = false; be.held.length = 0;
    const again = await cq.processChatQueue('u');
    assert.equal(again.succeeded, 2);
    assert.equal(be.store.size, 2, 'each delivered once');
  });

  test(`${kind} anomaly 3: a live send that times out stays queued; the late success and the retry together never duplicate it`, async () => {
    const be = controlledBackend();
    const timers = fakeTimers();
    const cq = durableModule(be, new Map(), timers);
    const op = kind === 'dm' ? dm('late') : group('late');
    be.hang = true;
    const live = cq.sendChatOp('u', op, true);
    await flush();
    await timers.advance(cq.SEND_TIMEOUT_MS + 1);
    assert.equal(await live, 'queued', 'neither sent nor lost');
    be.hang = false;
    await cq.processChatQueue('u'); // the retry delivers
    be.held.forEach((x) => x.finish()); // and the first attempt finally reaches the server as well
    await flush();
    assert.equal(be.store.size, 1, 'one message');
    assert.equal(await cq.getChatQueueSize('u'), 0);
  });

  test(`${kind} anomaly 4: queued sends are shown as pending when the chat is reopened (not hidden until delivered)`, async () => {
    const be = controlledBackend();
    const cq = durableModule(be);
    be.offline = true;
    await cq.enqueueChatOp('u', kind === 'dm' ? dm('q1') : group('q1'));
    const h = chatHook(kind, be, cq, { offline: true });
    await flush();
    const m = h.render().messages;
    assert.equal(m.length, 1, 'the queued message is visible');
    assert.equal(m[0].status, 'pending');
    assert.equal(m[0].text, 'hi');
  });

  test(`${kind} anomaly 5: a send that cannot be saved or delivered is handed back to the composer, never dropped silently`, async () => {
    const be = controlledBackend();
    const cq = durableModule(be);
    be.offline = true; // the attempt fails with a network error ...
    cq.data.set = () => { throw new Error('disk full'); }; // ... and storage is unusable
    const broken = { getItem: async () => null, setItem: async () => { throw new Error('disk full'); } };
    const lock = load('apps/mobile/utils/queueLock.ts', {});
    const draft = load('apps/mobile/utils/draftRestore.ts', {});
    const q2 = load('apps/mobile/utils/chatQueue.ts', { './queueLock': lock, './draftRestore': draft, '@react-native-async-storage/async-storage': { default: broken },
      '@solotravelsoul/firebase': { sendDirectMessage: (...a) => be.sendDirectMessage(...a), sendGroupMessage: (...a) => be.sendGroupMessage(...a) } }, fakeTimers());
    const result = await q2.sendChatOp('u', kind === 'dm' ? dm('x1') : group('x1'), true);
    assert.equal(result, 'failed');
  });

  test(`${kind} hook: when the send fails outright the bubble goes, the text returns to the composer once, with a message`, async () => {
    const be = controlledBackend();
    const cq = durableModule(be);
    const broken = { getItem: async () => null, setItem: async () => { throw new Error('disk full'); } };
    const lock = load('apps/mobile/utils/queueLock.ts', {});
    const q2 = load('apps/mobile/utils/chatQueue.ts', { './queueLock': lock, './draftRestore': cq.draft, '@react-native-async-storage/async-storage': { default: broken },
      '@solotravelsoul/firebase': { sendDirectMessage: (...a) => be.sendDirectMessage(...a), sendGroupMessage: (...a) => be.sendGroupMessage(...a) } }, fakeTimers());
    q2.draft = cq.draft;
    be.offline = true;
    const h = chatHook(kind, be, q2, { offline: false });
    await h.render().sendMessage('keep me');
    assert.equal(h.render().messages.length, 0);
    assert.equal(h.render().restored.text, 'keep me');
    assert.equal(h.toasts.length, 1);
  });

  test(`${kind} hook: rapid disconnect/reconnect with a send in flight: delivered exactly once, no duplicate bubble, draft untouched`, async () => {
    const be = controlledBackend();
    const timers = fakeTimers();
    const cq = durableModule(be, new Map(), timers);
    const net = { offline: false };
    const h = chatHook(kind, be, cq, net);
    be.hang = true;
    const sending = h.render().sendMessage('flap');
    await flush();
    net.offline = true; be.offline = true; // disconnect while in flight
    await timers.advance(1000);
    net.offline = false; be.offline = false; // reconnect
    await timers.advance(1000);
    be.hang = false;
    be.held.splice(0).forEach((x) => x.finish()); // the original attempt completes after the reconnect
    await sending;
    await cq.processChatQueue('u'); // the reconnect drain
    assert.equal(be.store.size, 1, 'exactly one message on the server');
    assert.equal(await cq.getChatQueueSize('u'), 0);
    assert.equal(h.render().messages.filter((m) => m.text === 'flap').length, 1, 'one bubble');
    assert.equal(h.render().restored, null, 'no draft was handed back');
  });

  test(`${kind} hook: permission-denied while another send is queued still follows the existing rule (dropped, text back once)`, async () => {
    const be = controlledBackend();
    const cq = durableModule(be);
    const h = chatHook(kind, be, cq, { offline: false });
    be.denied = true;
    await h.render().sendMessage('nope');
    assert.equal(h.render().restored.text, 'nope');
    assert.equal(h.toasts.length, 1);
    assert.equal(await cq.getChatQueueSize('u'), 0);
    be.denied = false;
    await cq.processChatQueue('u');
    assert.equal(be.store.size, 0, 'never delivered later');
  });
}

test('sync engine: queued sends are retried on a timer while connected, even with no new network event', async () => {
  const timers = [];
  let connected = true;
  const state = { pendingOpsCount: 1, syncStatus: { syncing: false }, setSyncStatus() {}, setPendingOpsCount() {} };
  let syncs = 0;
  const effects = [];
  const engine = load('apps/mobile/hooks/useSyncEngine.ts', {
    react: { useEffect: (fn, deps) => { effects.push({ fn, deps }); }, useRef: (v) => ({ current: v }), useCallback: (f) => f },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } }, 'zustand/react/shallow': { useShallow: (f) => f },
    './useNetworkState': { useNetworkState: () => ({ isConnected: connected }) },
    '@/stores/tripStore': { useTripStore: (f) => f(state) },
    '@/utils/syncQueue': { getQueueSize: async () => 0, processQueue: async () => ({ succeeded: 0, failed: 0 }) },
    '@/stores/authStore': { useAuthStore: { getState: () => ({ user: { uid: 'u' } }) } },
    '@/stores/uiStore': { useUIStore: { getState: () => ({ addToast() {} }) } },
    '@/utils/chatQueue': { getChatQueueSize: async () => 1, processChatQueue: async () => { syncs++; return { succeeded: 0, failed: 0, rejected: [] }; } },
    '@/utils/offlineCache': { getLatestSyncTime: async () => null, setLastSync: async () => {} },
  }, { setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearInterval() {} });
  engine.useSyncEngine('u');
  for (const e of effects) { const cleanup = e.fn(); void cleanup; }
  assert.ok(timers.some((t) => t.ms >= 10000 && t.ms <= 60000), 'a retry is scheduled while sends are pending and the connection is up');
  await timers.find((t) => t.ms >= 10000).fn();
  await flush();
  assert.equal(syncs, 1, 'the retry drains the queue');
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} chat queue checks passed`);
})();
