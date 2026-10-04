// Media on Workers Free: bytes in KV, a D1 index (opaque id, owner, purpose,
// lifecycle state, cleanup flags) and authorization from Firestore.
//
// Logical revocation vs physical deletion:
//   - Access is decided on every request from the *primary* sources: the D1 row
//     (must be 'active') and, in Firestore, the owner's deletion barrier and the
//     current state of the post/journal/profile that references the media. The
//     D1 row never grants access on its own, so a stale index cannot expose
//     content hidden in Firestore (privacy change, report auto-hide, moderator
//     removal, account deletion) — those take effect on the next request.
//   - Physically deleting bytes from KV is separate, retryable cleanup
//     (kv_delete_pending). It is not revocation, and KV propagation gives no
//     completion guarantee; bytes already downloaded by a client cannot be
//     recalled.
//   - Any failure to read D1 or Firestore fails closed: no bytes are served.
//
// Caching: no edge/Cache API caching. Media visible to other users is sent as
// `private, max-age=300` (device caches may keep it ≤ 5 minutes); owner-only,
// moderator and denied responses are `private, no-store`.
//
// D1 bindings without the Sessions API read from the primary database.

import type { VerifiedToken } from './auth';
import type { SubrequestBudget } from './budget';
import type { DocStore, StoredDoc } from './firestoreRest';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const PENDING_ORPHAN_MS = 60 * 60 * 1000;
export const UNATTACHED_ORPHAN_MS = 24 * 60 * 60 * 1000;
export type MediaPurpose = 'profile' | 'post' | 'journal';
const PURPOSES: readonly MediaPurpose[] = ['profile', 'post', 'journal'];

// ── Minimal D1 / KV surfaces (Cloudflare bindings implement these) ───────────

export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
export interface D1Like {
  prepare(query: string): D1Stmt;
}
export interface KvLike {
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  put(key: string, value: ArrayBuffer): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Charges every D1 query to the invocation's query budget (D1 Free: 50 per
 * invocation). The cap is hard: a query beyond it throws (fail closed) instead
 * of being sent.
 */
export function meteredD1(db: D1Like, queries: SubrequestBudget): D1Like {
  const wrap = (stmt: D1Stmt): D1Stmt => ({
    bind: (...values: unknown[]) => wrap(stmt.bind(...values)),
    first: async <T>() => { queries.spend(); return stmt.first<T>(); },
    run: async () => { queries.spend(); return stmt.run(); },
    all: async <T>() => { queries.spend(); return stmt.all<T>(); },
  });
  return { prepare: (q: string) => wrap(db.prepare(q)) };
}

/** D1 queries runMediaMaintenance uses: 4 fixed + 2 per checked row + 1 per purged object. */
export function maintenanceLimits(fetchRemaining: number, queryRemaining: number): { checkLimit: number; purgeLimit: number } {
  const purgeLimit = Math.max(0, Math.min(20, Math.floor((queryRemaining - 4) / 2)));
  const checkLimit = Math.max(0, Math.min(Math.floor((fetchRemaining - 10) / 3), Math.floor((queryRemaining - 4 - purgeLimit) / 2)));
  return { checkLimit, purgeLimit };
}

export interface MediaRow {
  id: string;
  owner_uid: string;
  kv_key: string;
  purpose: MediaPurpose;
  visibility: 'inherit' | 'owner_only';
  status: 'pending' | 'active' | 'removed' | 'failed';
  parent_id: string | null;
  content_type: string;
  size: number;
  created_at: number;
  updated_at: number;
  kv_delete_pending: number;
}

export interface MediaDeps {
  db: D1Like;
  kv: KvLike;
  store: DocStore;
  verify(token: string): Promise<VerifiedToken>;
  publicBaseUrl: string;
  json(data: unknown, status?: number): Response;
  now?: () => number;
}

const ID_RE = /^[0-9a-f]{32}$/;
export function newMediaId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const mediaUrl = (base: string, id: string) => `${base.replace(/\/$/, '')}/media/${id}`;
export function mediaIdFromUrl(base: string, url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const prefix = `${base.replace(/\/$/, '')}/media/`;
  if (!url.startsWith(prefix)) return null;
  const id = url.slice(prefix.length);
  return ID_RE.test(id) ? id : null;
}

const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };
const deny = (status = 404) => new Response(null, { status, headers: noStore });
const unavailable = () => new Response(null, { status: 503, headers: noStore });

async function bearer(request: Request, deps: MediaDeps): Promise<VerifiedToken | 'missing' | 'invalid'> {
  const h = request.headers.get('Authorization') ?? '';
  if (!h.startsWith('Bearer ')) return 'missing';
  try {
    return await deps.verify(h.slice(7));
  } catch {
    return 'invalid';
  }
}

/** Barrier docs for an account: deletion in progress/completed, or suspended. Throws if unreadable. */
async function restricted(store: DocStore, uid: string): Promise<boolean> {
  const [deleting, suspended] = await store.getMany([`accountDeletions/${uid}`, `accountSuspensions/${uid}`]);
  return !!deleting || !!suspended;
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function handleMediaUpload(request: Request, deps: MediaDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const who = await bearer(request, deps);
  if (who === 'missing') return deps.json({ error: 'Missing Authorization: Bearer <token>' }, 401);
  if (who === 'invalid') return deps.json({ error: 'Authentication failed' }, 403);
  const uid = who.uid;

  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return deps.json({ error: 'File too large. Maximum 2 MB.' }, 413);

  try {
    if (await restricted(deps.store, uid)) return deps.json({ error: 'This account cannot upload.', code: 'account/restricted' }, 403);
  } catch {
    return deps.json({ error: 'Uploads are temporarily unavailable.', code: 'uploads/unavailable' }, 503);
  }

  let form: FormData;
  try { form = await request.formData(); } catch { return deps.json({ error: 'Expected multipart/form-data body' }, 400); }
  const file = form.get('file') as File | null;
  const purpose = String(form.get('purpose') ?? '') as MediaPurpose;
  if (!file) return deps.json({ error: 'Missing "file" field in form data' }, 400);
  if (!PURPOSES.includes(purpose)) return deps.json({ error: 'purpose must be profile, post or journal' }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return deps.json({ error: 'File too large. Maximum 2 MB.' }, 413);
  if (!file.type.startsWith('image/')) return deps.json({ error: 'Only image files are accepted.' }, 415);

  const id = newMediaId();
  const key = `m/${id}`;
  const t = now();
  // 1. Index first: bytes never exist without a row that cleanup can find.
  try {
    await deps.db.prepare(
      `INSERT INTO media (id, owner_uid, kv_key, purpose, visibility, status, parent_id, content_type, size, created_at, updated_at, kv_delete_pending)
       VALUES (?, ?, ?, ?, 'inherit', 'pending', NULL, ?, ?, ?, ?, 0)`
    ).bind(id, uid, key, purpose, file.type, file.size, t, t).run();
  } catch {
    return deps.json({ error: 'Uploads are temporarily unavailable.', code: 'uploads/unavailable' }, 503);
  }
  // 2. Bytes.
  try {
    await deps.kv.put(key, await file.arrayBuffer());
  } catch {
    await deps.db.prepare(`UPDATE media SET status = 'failed', kv_delete_pending = 1, updated_at = ? WHERE id = ?`).bind(now(), id).run().catch(() => {});
    return deps.json({ error: 'Uploads are temporarily unavailable.', code: 'uploads/unavailable' }, 503);
  }
  // 3. Deletion may have started while this upload was in flight: never activate.
  let blocked: boolean;
  try { blocked = await restricted(deps.store, uid); } catch { blocked = true; }
  if (blocked) {
    await deps.db.prepare(`UPDATE media SET status = 'removed', kv_delete_pending = 1, updated_at = ? WHERE id = ?`).bind(now(), id).run().catch(() => {});
    try {
      await deps.kv.delete(key);
      await deps.db.prepare(`UPDATE media SET kv_delete_pending = 0 WHERE id = ?`).bind(id).run();
    } catch { /* left for the cleanup cron (kv_delete_pending) */ }
    return deps.json({ error: 'This account cannot upload.', code: 'account/restricted' }, 403);
  }
  // 4. Activate. If this write fails the row stays 'pending' (never served) and is cleaned up.
  try {
    await deps.db.prepare(`UPDATE media SET status = 'active', updated_at = ? WHERE id = ? AND status = 'pending'`).bind(now(), id).run();
  } catch {
    return deps.json({ error: 'Uploads are temporarily unavailable.', code: 'uploads/unavailable' }, 503);
  }
  return deps.json({ id, photoURL: mediaUrl(deps.publicBaseUrl, id) });
}

// ── View ──────────────────────────────────────────────────────────────────────

const parentCollection = (p: MediaPurpose) => (p === 'post' ? 'travelPosts' : p === 'journal' ? 'travelJournals' : 'users');

function attachedTo(row: MediaRow, parent: StoredDoc | null, url: string): boolean {
  if (!parent) return false;
  const d = parent.data;
  if (row.purpose === 'profile') return d.photoURL === url || d.coverPhotoURL === url;
  if (d.authorId !== row.owner_uid) return false;
  const images = Array.isArray(d.images) ? d.images : [];
  return images.includes(url) || (row.purpose === 'journal' && d.coverImageURL === url);
}

/** Finds the post/journal that now references this media (binding is a hint, re-checked every view). */
async function resolveParent(deps: MediaDeps, row: MediaRow, url: string): Promise<StoredDoc | null> {
  const coll = parentCollection(row.purpose);
  const hits = [
    ...(await deps.store.query(coll, [{ field: 'images', op: 'ARRAY_CONTAINS', value: url }])),
    ...(row.purpose === 'journal' ? await deps.store.query(coll, [{ field: 'coverImageURL', op: 'EQUAL', value: url }]) : []),
  ];
  return hits.find((h) => h.data.authorId === row.owner_uid) ?? null;
}

export type ViewDecision = { allow: false } | { allow: true; shared: boolean };

/** Authorization from primary state only (D1 row + Firestore). Throws when a source cannot be read. */
export async function authorizeView(deps: MediaDeps, row: MediaRow, viewer: string): Promise<ViewDecision> {
  if (row.status !== 'active') return { allow: false };
  const isOwner = viewer === row.owner_uid;
  const url = mediaUrl(deps.publicBaseUrl, row.id);
  const coll = parentCollection(row.purpose);
  const parentPath = row.purpose === 'profile' ? `users/${row.owner_uid}` : row.parent_id ? `${coll}/${row.parent_id}` : null;
  const paths = [`accountDeletions/${row.owner_uid}`, ...(isOwner ? [] : [`moderators/${viewer}`]), ...(parentPath ? [parentPath] : [])];
  const docs = await deps.store.getMany(paths);
  if (docs[0]) return { allow: false }; // owner's account is being deleted: nobody, not even the owner
  const isModerator = !isOwner && !!docs[1];
  let parent = parentPath ? docs[docs.length - 1] : null;
  if (row.purpose !== 'profile' && !attachedTo(row, parent, url)) {
    parent = await resolveParent(deps, row, url);
    if (parent) {
      const parentId = parent.path.split('/').pop()!;
      await deps.db.prepare(`UPDATE media SET parent_id = ? WHERE id = ?`).bind(parentId, row.id).run().catch(() => {});
    }
  }
  if (isOwner) return { allow: true, shared: false };
  if (row.visibility === 'owner_only') return isModerator ? { allow: true, shared: false } : { allow: false };
  if (!attachedTo(row, parent, url)) return { allow: false };
  if (isModerator) return { allow: true, shared: false };
  if (row.purpose === 'profile') return { allow: true, shared: true }; // as before: any signed-in user
  const d = parent!.data;
  const visible = d.visibility === 'public' && d.isArchived !== true; // mirrors firestore.rules visible()
  return visible ? { allow: true, shared: true } : { allow: false };
}

export async function handleMediaView(request: Request, id: string, deps: MediaDeps): Promise<Response> {
  if (!ID_RE.test(id)) return deny();
  const who = await bearer(request, deps);
  if (who === 'missing') return deny(401);
  if (who === 'invalid') return deny(403);
  let row: MediaRow | null;
  try {
    row = await deps.db.prepare(`SELECT * FROM media WHERE id = ?`).bind(id).first<MediaRow>();
  } catch {
    return unavailable();
  }
  if (!row || row.status !== 'active') return deny();
  let decision: ViewDecision;
  try {
    decision = await authorizeView(deps, row, who.uid);
  } catch {
    return unavailable();
  }
  if (!decision.allow) return deny();
  let bytes: ArrayBuffer | null;
  try { bytes = await deps.kv.get(row.kv_key, 'arrayBuffer'); } catch { return unavailable(); }
  if (!bytes) return deny(); // not yet propagated, or physically deleted
  return new Response(bytes, {
    headers: {
      'Content-Type': row.content_type || 'image/jpeg',
      'Cache-Control': decision.shared ? 'private, max-age=300' : 'private, no-store',
      Vary: 'Authorization',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// ── Revocation bookkeeping and physical cleanup ───────────────────────────────

/** Marks rows removed (never served again) and queues their bytes for deletion. Throws on D1 failure. */
export async function revokeIds(db: D1Like, ids: string[], now: number): Promise<void> {
  for (const id of ids) {
    await db.prepare(`UPDATE media SET status = 'removed', kv_delete_pending = 1, updated_at = ? WHERE id = ? AND status != 'removed'`).bind(now, id).run();
  }
}

export async function revokeOwner(db: D1Like, uid: string, now: number): Promise<void> {
  await db.prepare(`UPDATE media SET status = 'removed', kv_delete_pending = 1, updated_at = ? WHERE owner_uid = ? AND status != 'removed'`).bind(now, uid).run();
  // Rows that were already removed but whose bytes were never confirmed deleted stay pending.
}

/**
 * Deletes queued KV bytes (optionally for one owner), up to `limit`. Returns how
 * many are still pending. KV delete success is not proof of global absence
 * (propagation); it clears the pending flag because KV accepted the delete.
 */
export async function purgePending(db: D1Like, kv: KvLike, opts: { owner?: string; limit: number }): Promise<{ deleted: number; remaining: number }> {
  const where = opts.owner ? `kv_delete_pending = 1 AND owner_uid = ?` : `kv_delete_pending = 1`;
  const params = opts.owner ? [opts.owner] : [];
  const { results } = await db.prepare(`SELECT id, kv_key FROM media WHERE ${where} LIMIT ?`).bind(...params, opts.limit).all<{ id: string; kv_key: string }>();
  let deleted = 0;
  for (const r of results) {
    try {
      await kv.delete(r.kv_key);
    } catch {
      break; // KV daily delete quota or outage: stays pending for the next run
    }
    await db.prepare(`UPDATE media SET kv_delete_pending = 0 WHERE id = ?`).bind(r.id).run();
    deleted++;
  }
  const left = await db.prepare(`SELECT COUNT(*) AS n FROM media WHERE ${where}`).bind(...params).first<{ n: number }>();
  return { deleted, remaining: Number(left?.n ?? 0) };
}

/**
 * Cron maintenance within a call allowance: abandoned uploads, unattached
 * media no longer referenced in Firestore, and queued KV deletes.
 */
export async function runMediaMaintenance(
  deps: Pick<MediaDeps, 'db' | 'kv' | 'store' | 'publicBaseUrl' | 'now'>,
  opts: { checkLimit: number; purgeLimit: number }
): Promise<{ abandoned: number; orphaned: number; purged: number }> {
  const now = (deps.now ?? Date.now)();
  // Upload never activated (crash between index and activation).
  const abandoned = await deps.db.prepare(
    `UPDATE media SET status = 'removed', kv_delete_pending = 1, updated_at = ? WHERE status IN ('pending', 'failed') AND created_at < ?`
  ).bind(now, now - PENDING_ORPHAN_MS).run();
  // Active but unreferenced after a grace period (post never created, photo replaced, image detached).
  const { results } = await deps.db.prepare(
    // Each active row is re-checked at most once per grace period (updated_at is bumped when still referenced).
    `SELECT * FROM media WHERE status = 'active' AND updated_at < ? ORDER BY updated_at ASC LIMIT ?`
  ).bind(now - UNATTACHED_ORPHAN_MS, opts.checkLimit).all<MediaRow>();
  let orphaned = 0;
  for (const row of results) {
    const url = mediaUrl(deps.publicBaseUrl, row.id);
    let referenced: boolean;
    if (row.purpose === 'profile') {
      const [user] = await deps.store.getMany([`users/${row.owner_uid}`]);
      referenced = attachedTo(row, user, url);
    } else {
      const coll = parentCollection(row.purpose);
      const [bound] = row.parent_id ? await deps.store.getMany([`${coll}/${row.parent_id}`]) : [null];
      referenced = attachedTo(row, bound, url) || !!(await resolveParent(deps as MediaDeps, row, url));
    }
    if (referenced) {
      await deps.db.prepare(`UPDATE media SET updated_at = ? WHERE id = ?`).bind(now, row.id).run();
    } else {
      await revokeIds(deps.db, [row.id], now);
      orphaned++;
    }
  }
  const { deleted } = await purgePending(deps.db, deps.kv, { limit: opts.purgeLimit });
  return { abandoned: Number((abandoned as { meta?: { changes?: number } })?.meta?.changes ?? 0), orphaned, purged: deleted };
}
