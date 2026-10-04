// POST /moderation/remove-media {"targetType": "post" | "journal", "targetId": "..."}
// Deletes the R2 photos of a post/journal a moderator has already removed
// (visibility 'removed'). Public R2 URLs are bearer links, so hiding the
// document alone would leave the media reachable.

import type { VerifiedToken } from './auth';
import type { DocStore } from './firestoreRest';

export interface ModerationRouteDeps {
  verify(token: string): Promise<VerifiedToken>;
  store: DocStore | null;
  bucket: Pick<R2Bucket, 'delete'>;
  publicBaseUrl: string;
  json(data: unknown, status?: number): Response;
}

export async function handleRemoveMedia(request: Request, deps: ModerationRouteDeps): Promise<Response> {
  if (!deps.store) return deps.json({ error: 'Moderation is not configured.', code: 'moderation/unavailable' }, 503);
  const authHeader = request.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return deps.json({ error: 'Missing Authorization: Bearer <token>' }, 401);
  let uid: string;
  try {
    ({ uid } = await deps.verify(authHeader.slice(7)));
  } catch {
    return deps.json({ error: 'Authentication failed' }, 403);
  }
  if (!(await deps.store.get(`moderators/${uid}`))) return deps.json({ error: 'Moderators only', code: 'moderation/forbidden' }, 403);

  const body = (await request.json().catch(() => null)) as { targetType?: unknown; targetId?: unknown } | null;
  const type = body?.targetType;
  const id = typeof body?.targetId === 'string' ? body.targetId : '';
  if ((type !== 'post' && type !== 'journal') || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return deps.json({ error: 'Expected {"targetType": "post"|"journal", "targetId": "..."}' }, 400);
  }
  const path = `${type === 'post' ? 'travelPosts' : 'travelJournals'}/${id}`;
  const target = await deps.store.get(path);
  if (!target) return deps.json({ error: 'Not found' }, 404);
  if (target.data.visibility !== 'removed') {
    return deps.json({ error: 'Remove the content before deleting its media.', code: 'moderation/not-removed' }, 409);
  }

  // Only objects under the author's own upload prefix are deleted.
  const base = deps.publicBaseUrl.replace(/\/$/, '') + '/';
  const prefix = `post_photos/${String(target.data.authorId)}/`;
  const urls = [...((target.data.images as unknown[] | undefined) ?? []), target.data.coverImageURL].filter(
    (u): u is string => typeof u === 'string'
  );
  const keys = urls.filter((u) => u.startsWith(base)).map((u) => u.slice(base.length)).filter((k) => k.startsWith(prefix) && !k.includes('..'));
  if (keys.length) await deps.bucket.delete(keys);
  await deps.store.commit([{
    kind: 'update',
    path,
    set: { images: [], ...(type === 'journal' ? { coverImageURL: null } : {}), mediaRemovedBy: uid, mediaRemovedAtMs: Date.now() },
  }]);
  return deps.json({ removed: keys.length });
}
