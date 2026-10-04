// Operator endpoints for the legacy-media migration tool (scripts/migrateLegacyMedia.ts).
// All require the ADMIN_DELETION_TOKEN bearer and are disabled (404) without it.
//   POST /admin/media/import          multipart: file, ownerUid, purpose → { id, url, sha256 }
//   GET  /admin/media/<id>/digest     → { id, status, owner, sha256 } of the stored bytes
//   GET  /admin/legacy-r2?prefix=&cursor=   → { keys, cursor } (only when R2 is bound)
//   GET  /admin/legacy-r2/object?key=       → bytes (only when R2 is bound)
// Nothing here deletes legacy objects.

import { MAX_UPLOAD_BYTES, mediaUrl, newMediaId, type D1Like, type KvLike, type MediaPurpose } from './media';

export interface AdminMediaDeps {
  adminToken: string | undefined;
  db?: D1Like;
  kv?: KvLike;
  r2?: R2Bucket;
  baseUrl: string;
  json(data: unknown, status?: number): Response;
  now?: () => number;
}

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleAdminMedia(request: Request, pathname: string, deps: AdminMediaDeps): Promise<Response | null> {
  if (!pathname.startsWith('/admin/media') && !pathname.startsWith('/admin/legacy-r2')) return null;
  if (!deps.adminToken) return deps.json({ error: 'Not found' }, 404);
  const presented = (request.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (!sameSecret(presented, deps.adminToken)) return deps.json({ error: 'Forbidden' }, 403);
  const now = deps.now ?? Date.now;

  if (request.method === 'POST' && pathname === '/admin/media/import') {
    if (!deps.db || !deps.kv) return deps.json({ error: 'Media storage is not configured.' }, 503);
    const form = await request.formData().catch(() => null);
    const file = form?.get('file') as File | null;
    const owner = String(form?.get('ownerUid') ?? '');
    const purpose = String(form?.get('purpose') ?? '') as MediaPurpose;
    if (!file || !/^[A-Za-z0-9]{1,128}$/.test(owner) || !['profile', 'post', 'journal'].includes(purpose)) {
      return deps.json({ error: 'Expected file, ownerUid and purpose' }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) return deps.json({ error: 'File too large. Maximum 2 MB.' }, 413);
    const bytes = await file.arrayBuffer();
    const id = newMediaId();
    const key = `m/${id}`;
    const t = now();
    await deps.db.prepare(
      `INSERT INTO media (id, owner_uid, kv_key, purpose, visibility, status, parent_id, content_type, size, created_at, updated_at, kv_delete_pending)
       VALUES (?, ?, ?, ?, 'inherit', 'pending', NULL, ?, ?, ?, ?, 0)`
    ).bind(id, owner, key, purpose, file.type || 'image/jpeg', file.size, t, t).run();
    await deps.kv.put(key, bytes);
    await deps.db.prepare(`UPDATE media SET status = 'active', updated_at = ? WHERE id = ?`).bind(now(), id).run();
    return deps.json({ id, url: mediaUrl(deps.baseUrl, id), sha256: await sha256Hex(bytes) });
  }

  const digest = pathname.match(/^\/admin\/media\/([0-9a-f]{32})\/digest$/);
  if (request.method === 'GET' && digest) {
    if (!deps.db || !deps.kv) return deps.json({ error: 'Media storage is not configured.' }, 503);
    const row = await deps.db.prepare(`SELECT id, status, owner_uid, kv_key FROM media WHERE id = ?`).bind(digest[1])
      .first<{ id: string; status: string; owner_uid: string; kv_key: string }>();
    if (!row) return deps.json({ error: 'Not found' }, 404);
    const bytes = await deps.kv.get(row.kv_key, 'arrayBuffer');
    return deps.json({ id: row.id, status: row.status, owner: row.owner_uid, sha256: bytes ? await sha256Hex(bytes) : null });
  }

  if (pathname.startsWith('/admin/legacy-r2')) {
    if (!deps.r2) return deps.json({ error: 'Legacy R2 is not bound.' }, 404);
    const url = new URL(request.url);
    if (request.method === 'GET' && pathname === '/admin/legacy-r2') {
      const page = await deps.r2.list({ prefix: url.searchParams.get('prefix') ?? '', cursor: url.searchParams.get('cursor') ?? undefined, limit: 500 });
      return deps.json({ keys: page.objects.map((o) => ({ key: o.key, size: o.size })), cursor: page.truncated ? page.cursor : null });
    }
    if (request.method === 'GET' && pathname === '/admin/legacy-r2/object') {
      const obj = await deps.r2.get(url.searchParams.get('key') ?? '');
      if (!obj) return deps.json({ error: 'Not found' }, 404);
      return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream' } });
    }
  }
  return deps.json({ error: 'Not found' }, 404);
}
