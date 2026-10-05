// Shared test fakes: Worker module loader, in-memory Firestore DocStore,
// a real SQLite-backed D1 (node:sqlite, real migration SQL) and a KV fake.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));

const transpile = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
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

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** In-memory DocStore with Firestore commit semantics (preconditions, transforms). */
class MemoryStore {
  constructor() { this.docs = new Map(); this.clock = 0; this.calls = 0; this.failGetMany = 0; }
  async get(p) { this.calls++; const d = this.docs.get(p); return d ? { path: p, data: clone(d.data), updateTime: d.updateTime } : null; }
  async getMany(ps) {
    this.calls++;
    if (this.failGetMany > 0) { this.failGetMany--; throw new Error('Firestore unavailable'); }
    return ps.map((p) => { const d = this.docs.get(p); return d ? { path: p, data: clone(d.data), updateTime: d.updateTime } : null; });
  }
  async query(collectionId, filters, opts = {}) {
    this.calls++;
    const out = [];
    for (const [p, d] of this.docs) {
      const segs = p.split('/');
      if (segs[segs.length - 2] !== collectionId) continue;
      if (!opts.allDescendants && segs.slice(0, -2).join('/') !== (opts.parent || '')) continue;
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
    this.calls++;
    const ids = new Set();
    for (const p of this.docs.keys()) if (p.startsWith(col + '/')) ids.add(p.slice(col.length + 1).split('/')[0]);
    const sorted = [...ids].sort();
    return opts.limit ? sorted.slice(0, opts.limit) : sorted;
  }
  async listCollectionIds(docPath, opts = {}) {
    this.calls++;
    const ids = new Set();
    for (const p of this.docs.keys()) if (p.startsWith(docPath + '/')) ids.add(p.slice(docPath.length + 1).split('/')[0]);
    const sorted = [...ids].sort();
    return opts.limit ? sorted.slice(0, opts.limit) : sorted;
  }
  async commit(writes) {
    this.calls++;
    const { StoreConflict } = worker('firestoreRest');
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
  seed(p, data) { this.docs.set(p, { data: clone(data), updateTime: String(++this.clock) }); }
}

/** D1 surface over node:sqlite, with the real migration applied, query counting and failure injection. */
function d1Fake() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(root, 'workers/r2-upload-worker/migrations/0001_media.sql'), 'utf8'));
  const state = { queries: 0, fail: 0, failWrites: 0 };
  const api = {
    state,
    raw: db,
    prepare(sql) {
      const stmt = (values) => ({
        bind: (...v) => stmt(v),
        async first() { hit(sql); const r = db.prepare(sql).get(...values); return r ? { ...r } : null; },
        async run() { hit(sql); const r = db.prepare(sql).run(...values); return { meta: { changes: Number(r.changes) } }; },
        async all() { hit(sql); return { results: db.prepare(sql).all(...values).map((r) => ({ ...r })) }; },
      });
      return stmt([]);
    },
    row(id) { const r = db.prepare('SELECT * FROM media WHERE id = ?').get(id); return r ? { ...r } : null; },
  };
  function hit(sql) {
    state.queries++;
    if (state.fail > 0) { state.fail--; throw new Error('D1 unavailable'); }
    if (state.failWrites > 0 && /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) { state.failWrites--; throw new Error('D1 rows-written quota exceeded'); }
  }
  return api;
}

/** KV fake: put/get/delete with daily-quota style failure injection. */
function kvFake() {
  const map = new Map();
  const state = { putQuota: Infinity, deleteQuota: Infinity, failGet: 0 };
  return {
    map, state,
    async get(key) { if (state.failGet > 0) { state.failGet--; throw new Error('KV unavailable'); } const v = map.get(key); return v ? v.slice(0) : null; },
    async put(key, value) { if (state.putQuota-- <= 0) throw new Error('KV put quota exceeded'); map.set(key, value); },
    async delete(key) { if (state.deleteQuota-- <= 0) throw new Error('KV delete quota exceeded'); map.delete(key); },
  };
}

module.exports = { root, worker, transpile, MemoryStore, d1Fake, kvFake };
