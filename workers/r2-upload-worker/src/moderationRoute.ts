// POST /moderation/remove-media {"targetType": "post" | "journal", "targetId": "..."}
// Deletes the R2 photos of a post/journal a moderator has already removed
// (visibility 'removed'). Public R2 URLs are bearer links, so hiding the
// document alone would leave the media reachable.
//
// Coordination with restores and edits (no destructive step before a claim):
//   1. Claim: a conditional write on fresh state records which URLs this run
//      will delete (`mediaRemoval`: token, urls, lease). Rules refuse any
//      visibility change while the claim's lease is live, and authors cannot
//      edit removed content, so the claimed revision cannot be restored mid-way.
//   2. Delete exactly the claimed objects.
//   3. Finalize only while the claim token is still ours, removing only the
//      claimed URLs from the document — anything added later is preserved.
// A run that fails after claiming leaves the claim to expire; a retry then
// re-claims and repeats the (idempotent) object deletion.

import type { VerifiedToken } from './auth';
import { StoreConflict, type DocStore, type StoredDoc } from './firestoreRest';

export const MEDIA_REMOVAL_LEASE_MS = 2 * 60 * 1000;
const MAX_CONFLICT_RETRIES = 5;

export interface ModerationRouteDeps {
  verify(token: string): Promise<VerifiedToken>;
  store: DocStore | null;
  bucket: Pick<R2Bucket, 'delete'>;
  publicBaseUrl: string;
  json(data: unknown, status?: number): Response;
  now?: () => number;
}

interface MediaRemoval {
  state: 'in_progress' | 'done';
  token: string;
  by: string;
  urls: string[];
  leaseUntilMs: number;
}

/** 'inactive' when the caller's own account is being deleted or is suspended. */
async function callerStatus(store: DocStore, uid: string): Promise<'active' | 'inactive' | 'unknown'> {
  try {
    const [deleting, suspended] = await Promise.all([store.get(`accountDeletions/${uid}`), store.get(`accountSuspensions/${uid}`)]);
    return deleting || suspended ? 'inactive' : 'active';
  } catch {
    return 'unknown';
  }
}

export async function handleRemoveMedia(request: Request, deps: ModerationRouteDeps): Promise<Response> {
  const store = deps.store;
  if (!store) return deps.json({ error: 'Moderation is not configured.', code: 'moderation/unavailable' }, 503);
  const now = deps.now ?? Date.now;
  const authHeader = request.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return deps.json({ error: 'Missing Authorization: Bearer <token>' }, 401);
  let uid: string;
  try {
    ({ uid } = await deps.verify(authHeader.slice(7)));
  } catch {
    return deps.json({ error: 'Authentication failed' }, 403);
  }

  // Caller checks fail closed: any read error stops before destructive work.
  let isModerator: boolean;
  try {
    isModerator = !!(await store.get(`moderators/${uid}`));
  } catch {
    return deps.json({ error: 'Could not verify moderator access.', code: 'moderation/unavailable' }, 503);
  }
  if (!isModerator) return deps.json({ error: 'Moderators only', code: 'moderation/forbidden' }, 403);
  const status = await callerStatus(store, uid);
  if (status === 'unknown') return deps.json({ error: 'Could not verify moderator access.', code: 'moderation/unavailable' }, 503);
  if (status === 'inactive') return deps.json({ error: 'This moderator account is suspended or being deleted.', code: 'moderation/inactive' }, 403);

  const body = (await request.json().catch(() => null)) as { targetType?: unknown; targetId?: unknown } | null;
  const type = body?.targetType;
  const id = typeof body?.targetId === 'string' ? body.targetId : '';
  if ((type !== 'post' && type !== 'journal') || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return deps.json({ error: 'Expected {"targetType": "post"|"journal", "targetId": "..."}' }, 400);
  }
  const path = `${type === 'post' ? 'travelPosts' : 'travelJournals'}/${id}`;
  const base = deps.publicBaseUrl.replace(/\/$/, '') + '/';

  // Only objects under the author's own upload prefix are ever deleted.
  const deletable = (doc: StoredDoc) => {
    const prefix = `post_photos/${String(doc.data.authorId)}/`;
    const urls = [...((doc.data.images as unknown[] | undefined) ?? []), doc.data.coverImageURL];
    return urls.filter(
      (u): u is string => typeof u === 'string' && u.startsWith(base) && u.slice(base.length).startsWith(prefix) && !u.includes('..')
    );
  };

  // ── 1. Claim on fresh state ──────────────────────────────────────────
  let claim: MediaRemoval | null = null;
  for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES && !claim; attempt++) {
    const target = await store.get(path);
    if (!target) return deps.json({ error: 'Not found' }, 404);
    if (target.data.visibility !== 'removed') {
      return deps.json({ error: 'Remove the content before deleting its media.', code: 'moderation/not-removed' }, 409);
    }
    const existing = target.data.mediaRemoval as MediaRemoval | undefined;
    if (existing?.state === 'in_progress' && existing.leaseUntilMs > now()) {
      return deps.json({ error: 'Media removal already in progress.', code: 'moderation/in-progress' }, 409);
    }
    const urls = deletable(target);
    if (urls.length === 0) return deps.json({ removed: 0 });
    const candidate: MediaRemoval = {
      state: 'in_progress',
      token: crypto.randomUUID(),
      by: uid,
      urls,
      leaseUntilMs: now() + MEDIA_REMOVAL_LEASE_MS,
    };
    try {
      await store.commit([{ kind: 'update', path, set: { mediaRemoval: candidate }, updateTime: target.updateTime }]);
      claim = candidate;
    } catch (e) {
      if (!(e instanceof StoreConflict)) throw e;
    }
  }
  if (!claim) return deps.json({ error: 'The item kept changing; try again.', code: 'moderation/conflict' }, 409);

  // ── 2. Delete exactly the claimed objects ────────────────────────────
  try {
    await deps.bucket.delete(claim.urls.map((u) => u.slice(base.length)));
  } catch {
    return deps.json({ error: 'Could not delete the media; it can be retried shortly.', code: 'moderation/retry' }, 500);
  }

  // ── 3. Finalize only while the claim is still ours ───────────────────
  for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
    const current = await store.get(path);
    if (!current) return deps.json({ removed: claim.urls.length });
    const held = current.data.mediaRemoval as MediaRemoval | undefined;
    if (held?.token !== claim.token) return deps.json({ removed: claim.urls.length, superseded: true });
    const claimed = new Set(claim.urls);
    const set: Record<string, unknown> = {
      images: ((current.data.images as unknown[] | undefined) ?? []).filter((u) => !(typeof u === 'string' && claimed.has(u))),
      mediaRemoval: { ...claim, state: 'done', leaseUntilMs: 0 },
      mediaRemovedBy: uid,
      mediaRemovedAtMs: now(),
    };
    if (typeof current.data.coverImageURL === 'string' && claimed.has(current.data.coverImageURL)) set.coverImageURL = null;
    try {
      await store.commit([{ kind: 'update', path, set, updateTime: current.updateTime }]);
      return deps.json({ removed: claim.urls.length });
    } catch (e) {
      if (!(e instanceof StoreConflict)) throw e;
    }
  }
  return deps.json({ error: 'Media deleted; bookkeeping will be completed on retry.', code: 'moderation/retry' }, 500);
}
