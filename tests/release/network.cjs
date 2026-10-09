// Behaviour tests: live connectivity (useNetworkState) and how the offline banner, chat hooks
// and sync engine react to a disconnect/reconnect while the app stays in the foreground.
//   node tests/release/network.cjs
// Uses a minimal hook runtime (state, refs, memoised callbacks, effects with deps and cleanups).
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
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── Minimal React-like runtime ────────────────────────────────────────────────
function runtime() {
  const comps = [];
  let current = null;
  let dirty = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const slot = (init) => { const c = current; const i = c.i++; if (!(i in c.slots)) c.slots[i] = init(); return c.slots[i]; };
  const react = {
    useState(init) {
      const c = current;
      const s = slot(() => ({ v: typeof init === 'function' ? init() : init }));
      return [s.v, (next) => { if (!c.alive) { c.lateSets++; return; } const v = typeof next === 'function' ? next(s.v) : next; if (!Object.is(v, s.v)) { s.v = v; dirty = true; } }];
    },
    useRef(init) { return slot(() => ({ current: init })); },
    useMemo(fn, deps) { const s = slot(() => ({})); if (!s.deps || !same(s.deps, deps)) { s.v = fn(); s.deps = deps; } return s.v; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const s = slot(() => ({})); if (!s.deps || deps === undefined || !same(s.deps, deps)) current.pending.push([s, fn, deps]); },
  };
  function render(c) {
    current = c; c.i = 0; c.pending = [];
    c.value = c.fn();
    current = null;
    for (const [s, fn, deps] of c.pending) { if (s.cleanup) s.cleanup(); s.deps = deps; s.cleanup = fn() || null; }
  }
  return {
    react,
    mount(fn) { const c = { fn, slots: [], alive: true, lateSets: 0 }; comps.push(c); render(c); return c; },
    unmount(c) { c.alive = false; for (const s of c.slots) if (s && s.cleanup) s.cleanup(); comps.splice(comps.indexOf(c), 1); },
    async flush() { for (let n = 0; n < 30; n++) { await tick(); if (!dirty) return; dirty = false; for (const c of [...comps]) render(c); } throw Error('did not settle'); },
  };
}

// ── Fakes ─────────────────────────────────────────────────────────────────────
function fakeNetwork() {
  const n = { listeners: new Set(), appListeners: new Set(), checks: [], online: true, removed: { net: 0, app: 0 } };
  n.expoNetwork = {
    getNetworkStateAsync: () => new Promise((resolve) => n.checks.push(resolve)),
    addNetworkStateListener: (l) => { n.listeners.add(l); return { remove: () => { n.listeners.delete(l); n.removed.net++; } }; },
  };
  n.AppState = { addEventListener: (_e, l) => { n.appListeners.add(l); return { remove: () => { n.appListeners.delete(l); n.removed.app++; } }; } };
  n.emit = (online) => { n.online = online; for (const l of [...n.listeners]) l({ type: online ? 'WIFI' : 'NONE', isConnected: online, isInternetReachable: online }); };
  n.resolveChecks = (online = n.online) => { for (const r of n.checks.splice(0)) r({ isConnected: online, isInternetReachable: online }); };
  n.foreground = () => { for (const l of [...n.appListeners]) l('active'); };
  return n;
}

function networkHook(rt, net) {
  return load('apps/mobile/hooks/useNetworkState.ts', { react: rt.react, 'react-native': { AppState: net.AppState }, 'expo-network': net.expoNetwork }).useNetworkState;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('initial check applies; a live disconnect and reconnect are seen without backgrounding', async () => {
  const rt = runtime(); const net = fakeNetwork();
  const useNetworkState = networkHook(rt, net);
  const c = rt.mount(() => useNetworkState());
  net.resolveChecks(true); await rt.flush();
  assert.equal(c.value.isConnected, true);
  net.emit(false); await rt.flush();
  assert.equal(c.value.isConnected, false, 'disconnect seen while in the foreground');
  net.emit(true); await rt.flush();
  assert.equal(c.value.isConnected, true);
  assert.equal(net.appListeners.size, 1, 'one AppState subscription, not re-subscribed per render');
  assert.equal(net.listeners.size, 1, 'one live subscription');
});

test('a stale check that started before a newer event never overwrites it', async () => {
  const rt = runtime(); const net = fakeNetwork();
  const useNetworkState = networkHook(rt, net);
  const c = rt.mount(() => useNetworkState()); // mount check pending
  net.emit(false); await rt.flush(); // newer event: offline
  net.resolveChecks(true); await rt.flush(); // older check answers "connected"
  assert.equal(c.value.isConnected, false);
  assert.equal(c.value.isChecking, false);
  // A check started after the event (foreground / recheck) still applies.
  net.foreground(); await rt.flush();
  net.resolveChecks(true); await rt.flush();
  assert.equal(c.value.isConnected, true);
  const re = c.value.recheck(); net.emit(false); net.resolveChecks(true); await re; await rt.flush();
  assert.equal(c.value.isConnected, false, 'recheck superseded by a newer event');
});

test('unmount removes both subscriptions and ignores a check finishing later', async () => {
  const rt = runtime(); const net = fakeNetwork();
  const useNetworkState = networkHook(rt, net);
  const c = rt.mount(() => useNetworkState());
  rt.unmount(c);
  assert.deepEqual(net.removed, { net: 1, app: 1 });
  assert.equal(net.listeners.size + net.appListeners.size, 0);
  const before = c.lateSets;
  net.resolveChecks(false); await tick();
  assert.equal(c.lateSets, before, 'no state update after unmount');
});

// ── Banner, chat hook and sync engine together ─────────────────────────────────
function app(net) {
  const rt = runtime();
  const data = new Map();
  const storage = { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); } };
  const be = { delivered: [], snapshot: null, inFlight: null, refuse: false };
  const write = async (...a) => {
    if (be.refuse) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    if (!net.online) throw Object.assign(new Error('offline'), { code: 'unavailable' });
    if (be.hold) { await new Promise((r) => { be.inFlight = r; }); be.hold = false; }
    const id = a[3];
    if (!be.delivered.includes(id)) be.delivered.push(id); // server writes are idempotent per clientId
    be.snapshot && be.snapshot(be.delivered.map((clientId) => ({ id: clientId, clientId, senderId: 'u', text: 't', sentAt: new Date(), status: 'sent' })));
  };
  const firebase = { subscribeToDirectMessages: (_c, cb) => { be.snapshot = cb; return () => {}; }, sendDirectMessage: write, markDirectChatRead: async () => {} };
  const lock = load('apps/mobile/utils/queueLock.ts', {});
  const cq = load('apps/mobile/utils/chatQueue.ts', { './queueLock': lock, '@react-native-async-storage/async-storage': { default: storage }, '@solotravelsoul/firebase': { sendDirectMessage: write, sendGroupMessage: async () => {} } });
  const netMod = load('apps/mobile/hooks/useNetworkState.ts', { react: rt.react, 'react-native': { AppState: net.AppState }, 'expo-network': net.expoNetwork });
  const user = { uid: 'u' };
  const auth = (sel) => sel({ user }); auth.getState = () => ({ user });
  const toasts = [];
  const ui = { useUIStore: { getState: () => ({ addToast: (m) => toasts.push(m) }) } };
  const trip = { pendingOpsCount: 0, syncStatus: {}, setSyncStatus() {}, setPendingOpsCount(n) { trip.pendingOpsCount = n; } };
  const sync = load('apps/mobile/hooks/useSyncEngine.ts', {
    react: rt.react, 'react-native': { AppState: net.AppState }, 'zustand/react/shallow': { useShallow: (f) => f },
    './useNetworkState': netMod, '@/stores/tripStore': { useTripStore: (f) => f(trip) },
    '@/utils/syncQueue': { processQueue: async () => ({ succeeded: 0, failed: 0 }), getQueueSize: async () => 0 },
    '@/utils/chatQueue': cq, '@/stores/authStore': { useAuthStore: auth }, '@/stores/uiStore': ui,
    '@/utils/offlineCache': { getLatestSyncTime: async () => null, setLastSync: async () => {} },
  });
  const chat = load('apps/mobile/hooks/useMessages.ts', {
    react: rt.react, '@solotravelsoul/firebase': firebase, '@/utils/chatQueue': cq, '@/stores/authStore': { useAuthStore: auth },
    '@/hooks/useNetworkState': netMod, '@/stores/uiStore': ui, '@/hooks/useSyncEngine': sync,
  });
  const banner = rt.mount(() => netMod.useNetworkState().isConnected); // what the layout's banner reads
  const engine = rt.mount(() => sync.useSyncEngine('u')); // app-level sync engine
  const screen = rt.mount(() => chat.useMessages('u_v', ['v']));
  return { rt, be, cq, banner, engine, screen, toasts };
}

test('foreground disconnect → banner, queueing; reconnect → one drain, delivered exactly once', async () => {
  const net = fakeNetwork(); const a = app(net);
  net.resolveChecks(true); await a.rt.flush();
  assert.equal(a.banner.value, true);
  net.emit(false); await a.rt.flush();
  assert.equal(a.banner.value, false, 'offline banner shown without backgrounding');
  await a.screen.value.sendMessage('offline hello'); await a.rt.flush();
  assert.equal(await a.cq.getChatQueueSize('u'), 1, 'queued, not sent through the SDK');
  assert.equal(a.screen.value.messages.length, 1, 'pending bubble');
  net.emit(true); await a.rt.flush(); await tick(); await a.rt.flush();
  assert.equal(a.banner.value, true, 'banner hidden again');
  assert.equal(a.be.delivered.length, 1, 'delivered once after reconnect');
  assert.equal(await a.cq.getChatQueueSize('u'), 0);
  assert.equal(a.screen.value.messages.length, 1, 'one confirmed message, no leftover pending copy');
  net.emit(false); net.emit(true); await a.rt.flush(); await tick(); await a.rt.flush();
  assert.equal(a.be.delivered.length, 1, 'later reconnects do not resend');
});

test('a write already in flight when the network drops is not queued a second time', async () => {
  const net = fakeNetwork(); const a = app(net);
  net.resolveChecks(true); await a.rt.flush();
  a.be.hold = true;
  const sending = a.screen.value.sendMessage('in flight');
  await tick();
  net.emit(false); await a.rt.flush();
  net.emit(true); await a.rt.flush();
  a.be.inFlight(); await sending; await a.rt.flush(); await tick(); await a.rt.flush();
  assert.equal(await a.cq.getChatQueueSize('u'), 0, 'no queued copy');
  assert.equal(a.be.delivered.length, 1);
});

test('queued while offline, refused on reconnect (suspended): dropped, reported, never delivered after unsuspension', async () => {
  const net = fakeNetwork(); const a = app(net);
  net.resolveChecks(true); await a.rt.flush();
  net.emit(false); await a.rt.flush();
  await a.screen.value.sendMessage('queued while suspended'); await a.rt.flush();
  a.be.refuse = true;
  net.emit(true); await a.rt.flush(); await tick(); await a.rt.flush();
  assert.equal(await a.cq.getChatQueueSize('u'), 0);
  assert.equal(a.screen.value.messages.length, 0, 'pending bubble cleared');
  assert.ok(a.toasts.some((t) => /queued message was not sent/.test(t)));
  a.be.refuse = false;
  net.emit(false); net.emit(true); await a.rt.flush(); await tick(); await a.rt.flush();
  assert.equal(a.be.delivered.length, 0);
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} network checks passed`);
})();
