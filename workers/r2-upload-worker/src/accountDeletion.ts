// Trusted, retry-safe account deletion.
//
// Every step is idempotent and re-discovers its own work from the database, so
// a retry after any partial failure simply runs the whole plan again. Counter
// adjustments commit atomically with the relationship they belong to (with
// optimistic preconditions), so a retry can never decrement twice. The Firebase
// Auth identity is removed only after every data and media step has succeeded;
// until then the user can sign in and retry.
//
// Barrier: the job document accountDeletions/{uid} is created before any step
// runs and is never removed. Firestore and Storage rules and the upload
// endpoint refuse every write by that UID while it exists, so other devices,
// in-flight requests and still-valid tokens cannot recreate data.
//
// Attempts: each request owns the job under a unique attemptId and a lease
// that is renewed while it works. Job updates are conditional on that
// ownership; an attempt whose lease expired or was taken over stops at its
// next operation and can never overwrite a newer attempt's result.
//
// Bounded slices (Workers Free: 50 subrequests, 10 ms CPU per invocation):
// with a budget, each invocation runs steps until only the reserve is left,
// then records which steps completed (the persisted cursor), releases its
// lease and returns 'in_progress'; the next continuation or cron run resumes
// after the last completed step. Skipping completed steps is safe because the
// barrier exists before step 1 and firestore.rules refuse every later write
// that could re-create what a completed step removed — the user's own writes
// (notDeleting) and inbound links from others (deleting(), noDeletingIn,
// groupIdentityGuard for pendingMembers/memberInfo/unreadCounts). In-flight
// uploads re-check the barrier after storing and never activate.
//
// Other users' content is preserved: their comments, messages, likes and saves
// stay; only this user's own records are deleted, and where this user's
// contributions must remain inside someone else's space (chat messages, reply
// threads, notifications) their name/photo is replaced with "Deleted User".

import { StoreConflict, type DocStore, type StoredDoc, type StoreWrite } from './firestoreRest';
import { LegacyMediaInaccessible, type LegacyStorage, type PrefixDeleter } from './objectStores';
import { SliceExhausted, type SubrequestBudget } from './budget';
import { purgePending, revokeOwner, type D1Like, type KvLike } from './media';

export const DELETED_NAME = 'Deleted User';
const JOBS = 'accountDeletions';
export const LEASE_MS = 5 * 60 * 1000;
/** Renew once less than this much of the lease is left. */
const RENEW_WHEN_REMAINING_MS = LEASE_MS / 2;
/** Media sweeps after completion catch uploads that were already in flight. */
export const SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;
const COMMIT_CHUNK = 400;
const MAX_CONFLICT_RETRIES = 5;

export interface DeletionDeps {
  store: DocStore;
  /** Legacy R2 objects (only when the binding exists). */
  r2?: PrefixDeleter;
  /** Legacy Firebase Storage objects (inaccessible on Spark projects: recorded as unresolved). */
  firebaseStorage: LegacyStorage;
  /** KV media + D1 index (absent when the bindings are not configured). */
  media?: { db: D1Like; kv: KvLike; /** D1 query budget of this invocation (D1 Free: 50). */ queries?: SubrequestBudget };
  /** Invocation subrequest budget; without one the plan runs to completion in one call. */
  budget?: SubrequestBudget;
  /** Must treat an already-deleted user as success. */
  deleteAuthUser(uid: string): Promise<void>;
  authUserExists(uid: string): Promise<boolean>;
  now?: () => number;
  newAttemptId?: () => string;
}

export interface DeletionIdentity {
  uid: string;
  email: string | null;
}

export class DeletionInProgress extends Error {
  constructor() {
    super('Account deletion already in progress');
    this.name = 'DeletionInProgress';
  }
}

export class DeletionStepFailed extends Error {
  constructor(readonly step: string, readonly cause: unknown) {
    super(`Account deletion failed at step "${step}"`);
    this.name = 'DeletionStepFailed';
  }
}

/** This attempt's lease expired or another attempt took over; it must stop. */
export class DeletionAttemptLost extends Error {
  constructor(readonly reason: 'expired' | 'superseded') {
    super(`Account deletion attempt ${reason}`);
    this.name = 'DeletionAttemptLost';
  }
}

interface Ctx {
  uid: string;
  email: string | null;
  /** Lease-guarded and metered: stops (SliceExhausted) before the reserve is touched. */
  store: DocStore;
  /** Counted but not metered: for the partial commit that ends a slice. */
  rawStore: DocStore;
  deps: DeletionDeps;
  heartbeat: () => Promise<void>;
  /** Throws SliceExhausted unless `need` more calls fit before the reserve. */
  work: (need?: number) => void;
  flags: Record<string, unknown>;
}

/** Media cleanup still has queued deletes (e.g. KV daily quota): resume in a later slice. */
export class MediaCleanupPending extends Error {
  constructor(readonly remaining: number) {
    super(`${remaining} media deletions still pending`);
    this.name = 'MediaCleanupPending';
  }
}

type Step = { id: string; run: (ctx: Ctx) => Promise<void> };

// ── Helpers ───────────────────────────────────────────────────────────────────

const lastSegment = (path: string) => path.split('/').pop()!;
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

/** Build writes from fresh reads and commit; rebuild on precondition conflicts. null = nothing to do. */
async function atomically(store: DocStore, build: () => Promise<StoreWrite[] | null>): Promise<void> {
  for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
    const writes = await build();
    if (!writes || writes.length === 0) return;
    try {
      await store.commit(writes);
      return;
    } catch (e) {
      if (!(e instanceof StoreConflict)) throw e;
    }
  }
  throw new Error('Too many concurrent updates');
}

/** Decrement `field` on `target` by one, never below zero, only if the doc is unchanged since read. */
function decrement(target: StoredDoc | null, field: string): StoreWrite[] {
  if (!target || num(target.data[field]) <= 0) return [];
  return [{ kind: 'update', path: target.path, increment: { [field]: -1 }, updateTime: target.updateTime }];
}

async function commitChunked(store: DocStore, writes: StoreWrite[]): Promise<void> {
  for (let i = 0; i < writes.length; i += COMMIT_CHUNK) {
    await store.commit(writes.slice(i, i + COMMIT_CHUNK));
  }
}

/** All document paths in the subtree rooted at docPath, post-order (descendants first). */
async function collectTree(store: DocStore, docPath: string, out: string[] = []): Promise<string[]> {
  for (const collectionId of await store.listCollectionIds(docPath)) {
    for (const id of await store.listDocumentIds(`${docPath}/${collectionId}`)) {
      await collectTree(store, `${docPath}/${collectionId}/${id}`, out);
    }
  }
  out.push(docPath);
  return out;
}

/**
 * Deletes a subtree. If the slice runs out mid-walk, the documents collected so
 * far are deleted before stopping: in post-order every collected document's
 * descendants were collected before it, so parents left behind still lead the
 * next slice to whatever remains.
 */
async function deleteTree(store: DocStore, docPath: string, rawStore: DocStore = store): Promise<void> {
  const collected: string[] = [];
  try {
    await collectTree(store, docPath, collected);
  } catch (e) {
    if (e instanceof SliceExhausted && collected.length) {
      await commitChunked(rawStore, collected.map((path) => ({ kind: 'delete', path })));
    }
    throw e;
  }
  await commitChunked(store, collected.map((path) => ({ kind: 'delete', path })));
}

/** Remove a relationship document together with the counters it backs. */
async function removeEdge(
  store: DocStore,
  edgePath: string,
  counters: (edge: StoredDoc) => Promise<{ path: string; field: string }[]>
): Promise<void> {
  await atomically(store, async () => {
    const edge = await store.get(edgePath);
    if (!edge) return null; // removed by an earlier attempt
    const writes: StoreWrite[] = [{ kind: 'delete', path: edgePath, updateTime: edge.updateTime }];
    const seen = new Set<string>();
    for (const c of await counters(edge)) {
      if (seen.has(c.path)) continue;
      seen.add(c.path);
      writes.push(...decrement(await store.get(c.path), c.field));
    }
    return writes;
  });
}

function deleteOwned(collectionId: string, ownerField: string): Step['run'] {
  return async ({ uid, store, rawStore }) => {
    const docs = await store.query(collectionId, [{ field: ownerField, op: 'EQUAL', value: uid }]);
    for (const d of docs) await deleteTree(store, d.path, rawStore);
  };
}

// ── Steps ─────────────────────────────────────────────────────────────────────

// Likes and saves by anyone on a deleted post/journal would dangle; they go
// with the content (no counters to release), before the content itself so a
// retry can still discover them through the author's remaining documents.
function deleteOwnedContent(collectionId: 'travelPosts' | 'travelJournals'): Step['run'] {
  const kind = collectionId === 'travelPosts' ? 'post' : 'journal';
  return async ({ uid, store, rawStore }) => {
    for (const item of await store.query(collectionId, [{ field: 'authorId', op: 'EQUAL', value: uid }])) {
      const id = lastSegment(item.path);
      const likes = (await store.query('postLikes', [{ field: 'postId', op: 'EQUAL', value: id }]))
        .filter((l) => (l.data.targetType ?? kind) === kind); // legacy likes carry no targetType
      const saves = kind === 'post' ? await store.query('savedPosts', [{ field: 'postId', op: 'EQUAL', value: id }]) : [];
      await commitChunked(store, [...likes, ...saves].map((d): StoreWrite => ({ kind: 'delete', path: d.path })));
      await deleteTree(store, item.path, rawStore);
    }
  };
}

const removeLikes: Step['run'] = async ({ uid, store }) => {
  for (const like of await store.query('postLikes', [{ field: 'userId', op: 'EQUAL', value: uid }])) {
    await removeEdge(store, like.path, async (edge) => {
      const targetId = String(edge.data.postId ?? '');
      if (!targetId) return [];
      let kind = edge.data.targetType as string | undefined;
      if (kind !== 'post' && kind !== 'journal') {
        kind = (await store.get(`travelPosts/${targetId}`)) ? 'post' : 'journal';
      }
      return [{ path: `${kind === 'post' ? 'travelPosts' : 'travelJournals'}/${targetId}`, field: 'likeCount' }];
    });
  }
};

const removeSaves: Step['run'] = async ({ uid, store }) => {
  for (const saved of await store.query('savedPosts', [{ field: 'userId', op: 'EQUAL', value: uid }])) {
    await removeEdge(store, saved.path, async (edge) =>
      edge.data.postId ? [{ path: `travelPosts/${edge.data.postId}`, field: 'saveCount' }] : []
    );
  }
};

const removeFollows: Step['run'] = async ({ uid, store }) => {
  for (const f of await store.query('follows', [{ field: 'followerId', op: 'EQUAL', value: uid }])) {
    await removeEdge(store, f.path, async (edge) =>
      edge.data.followingId ? [{ path: `publicProfiles/${edge.data.followingId}`, field: 'followersCount' }] : []
    );
  }
  for (const f of await store.query('follows', [{ field: 'followingId', op: 'EQUAL', value: uid }])) {
    await removeEdge(store, f.path, async (edge) =>
      edge.data.followerId ? [{ path: `publicProfiles/${edge.data.followerId}`, field: 'followingCount' }] : []
    );
  }
};

// Own comments on own posts disappear with the post. Own comments on other
// users' posts become anonymous tombstones (preserving replies by others) and
// release their counters exactly once, guarded by the isDeleted transition.
const removeComments: Step['run'] = async ({ uid, store }) => {
  for (const c of await store.query('postComments', [{ field: 'authorId', op: 'EQUAL', value: uid }])) {
    const postId = String(c.data.postId ?? '');
    const post = postId ? await store.get(`travelPosts/${postId}`) : null;
    if (!post || post.data.authorId === uid) {
      await store.commit([{ kind: 'delete', path: c.path }]);
      continue;
    }
    await atomically(store, async () => {
      const comment = await store.get(c.path);
      if (!comment) return null;
      const wasDeleted = comment.data.isDeleted === true;
      if (wasDeleted && comment.data.text === '' && comment.data.authorName === DELETED_NAME && comment.data.authorPhoto == null) {
        return null;
      }
      const writes: StoreWrite[] = [{
        kind: 'update',
        path: comment.path,
        set: { isDeleted: true, text: '', authorName: DELETED_NAME, authorPhoto: null },
        serverTime: ['updatedAt'],
        updateTime: comment.updateTime,
      }];
      if (!wasDeleted) {
        writes.push(...decrement(await store.get(`travelPosts/${postId}`), 'commentCount'));
        const parentId = comment.data.parentCommentId;
        if (typeof parentId === 'string' && parentId) {
          writes.push(...decrement(await store.get(`postComments/${parentId}`), 'replyCount'));
        }
      }
      return writes;
    });
  }
};

const removeOwnedPublicTrips: Step['run'] = async ({ uid, store, rawStore }) => {
  for (const trip of await store.query('publicTrips', [{ field: 'ownerUid', op: 'EQUAL', value: uid }])) {
    await deleteTree(store, `trips/${lastSegment(trip.path)}`, rawStore); // members subcollection
    await deleteTree(store, trip.path, rawStore);
  }
  const pending = await store.query('tripJoinRequests', [
    { field: 'ownerUid', op: 'EQUAL', value: uid },
    { field: 'status', op: 'EQUAL', value: 'pending' },
  ]);
  await commitChunked(store, pending.map((r) => ({ kind: 'update', path: r.path, set: { status: 'cancelled' }, serverTime: ['updatedAt'] })));
};

const removeOwnedTravelGroups: Step['run'] = async ({ uid, store, rawStore }) => {
  for (const group of await store.query('travelGroups', [{ field: 'ownerUid', op: 'EQUAL', value: uid }])) {
    await deleteTree(store, group.path, rawStore);
  }
  const pending = await store.query('groupJoinRequests', [
    { field: 'ownerUid', op: 'EQUAL', value: uid },
    { field: 'status', op: 'EQUAL', value: 'pending' },
  ]);
  await commitChunked(store, pending.map((r) => ({ kind: 'update', path: r.path, set: { status: 'cancelled' }, serverTime: ['updatedAt'] })));
};

// Membership in other users' public trips (trips/{id}/members) and community
// groups (travelGroups/{id}/members); each removal releases one memberCount.
const removeMemberships: Step['run'] = async ({ uid, store }) => {
  const members = await store.query('members', [{ field: 'uid', op: 'EQUAL', value: uid }], { allDescendants: true });
  for (const m of members) {
    const [root, parentId] = m.path.split('/');
    const counterPath = root === 'trips' ? `publicTrips/${parentId}` : root === 'travelGroups' ? `travelGroups/${parentId}` : null;
    if (!counterPath) continue;
    await removeEdge(store, m.path, async () => [{ path: counterPath, field: 'memberCount' }]);
  }
};

const removeJoinRequests: Step['run'] = async ({ uid, store }) => {
  for (const col of ['tripJoinRequests', 'groupJoinRequests']) {
    const requests = await store.query(col, [{ field: 'requestorUid', op: 'EQUAL', value: uid }]);
    await commitChunked(store, requests.map((r) => ({ kind: 'delete', path: r.path })));
  }
};

const removeNotifications: Step['run'] = async ({ uid, store }) => {
  const own = await store.query('notifications', [{ field: 'userId', op: 'EQUAL', value: uid }]);
  await commitChunked(store, own.map((n) => ({ kind: 'delete', path: n.path })));
  // Notifications delivered to other users stay, without this user's identity.
  const sent = await store.query('notifications', [{ field: 'actorId', op: 'EQUAL', value: uid }]);
  await commitChunked(
    store,
    sent
      .filter((n) => n.data.actorName !== DELETED_NAME || n.data.actorPhoto != null)
      .map((n) => ({ kind: 'update', path: n.path, set: { actorName: DELETED_NAME, actorPhoto: null } }))
  );
};

const removeStoryViews: Step['run'] = async ({ uid, store }) => {
  for (const story of await store.query('travelStories', [{ field: 'viewerIds', op: 'ARRAY_CONTAINS', value: uid }])) {
    await atomically(store, async () => {
      const current = await store.get(story.path);
      const viewers = (current?.data.viewerIds as unknown[] | undefined) ?? [];
      if (!current || !viewers.includes(uid)) return null;
      return [{ kind: 'update', path: current.path, set: { viewerIds: viewers.filter((v) => v !== uid) }, updateTime: current.updateTime }];
    });
  }
};

// Messages this user sent stay visible to the other participants (documented
// in the privacy policy) but no longer carry the user's name.
const anonymizeSentMessages: Step['run'] = async ({ uid, store }) => {
  const sent = await store.query('messages', [{ field: 'senderId', op: 'EQUAL', value: uid }], { allDescendants: true });
  await commitChunked(
    store,
    sent
      .filter((m) => m.path.startsWith('groups/') && typeof m.data.senderName === 'string' && m.data.senderName !== DELETED_NAME)
      .map((m) => ({ kind: 'update', path: m.path, set: { senderName: DELETED_NAME } }))
  );
};

const leaveGroupChats: Step['run'] = async ({ uid, store, rawStore }) => {
  for (const group of await store.query('groups', [{ field: 'members', op: 'ARRAY_CONTAINS', value: uid }])) {
    let emptied = false;
    await atomically(store, async () => {
      const current = await store.get(group.path);
      const members = (current?.data.members as unknown[] | undefined) ?? [];
      if (!current || !members.includes(uid)) return null;
      const remaining = members.filter((m) => m !== uid);
      emptied = remaining.length === 0;
      if (emptied) return null; // nobody left to preserve it for — deleted below
      const last = current.data.lastMessage as Record<string, unknown> | null | undefined;
      const set: Record<string, unknown> = { members: remaining };
      if (last && last.senderId === uid) set['lastMessage.senderName'] = DELETED_NAME;
      return [{
        kind: 'update',
        path: current.path,
        set,
        remove: [`memberInfo.${uid}`, `unreadCounts.${uid}`],
        updateTime: current.updateTime,
      }];
    });
    if (emptied) await deleteTree(store, group.path, rawStore);
  }
};

// Groups another user is still creating can list this user as a pending
// member (with name and unread entry). Remove the UID and its identity fields;
// the group, its creator and other members are untouched. Conditional on the
// group's updateTime, so a concurrent resume by the creator is re-read, never lost.
const leavePendingGroups: Step['run'] = async ({ uid, store }) => {
  for (const group of await store.query('groups', [{ field: 'pendingMembers', op: 'ARRAY_CONTAINS', value: uid }])) {
    await atomically(store, async () => {
      const current = await store.get(group.path);
      if (!current) return null;
      const pending = (current.data.pendingMembers as unknown[] | undefined) ?? [];
      const info = current.data.memberInfo as Record<string, unknown> | undefined;
      const unread = current.data.unreadCounts as Record<string, unknown> | undefined;
      if (!pending.includes(uid) && info?.[uid] === undefined && unread?.[uid] === undefined) return null;
      return [{
        kind: 'update',
        path: current.path,
        set: { pendingMembers: pending.filter((m) => m !== uid) },
        remove: [`memberInfo.${uid}`, `unreadCounts.${uid}`],
        updateTime: current.updateTime,
      }];
    });
  }
};

const anonymizeDirectChats: Step['run'] = async ({ uid, store }) => {
  for (const chat of await store.query('direct_chats', [{ field: 'participants', op: 'ARRAY_CONTAINS', value: uid }])) {
    const info = (chat.data.participantInfo as Record<string, Record<string, unknown>> | undefined)?.[uid];
    const unread = (chat.data.unreadCounts as Record<string, unknown> | undefined)?.[uid];
    if (info?.name === DELETED_NAME && unread === undefined) continue;
    // participants keeps the UID so the other user's read access is unchanged.
    await store.commit([{
      kind: 'update',
      path: chat.path,
      set: { [`participantInfo.${uid}`]: { name: DELETED_NAME, initials: '?' } },
      remove: [`unreadCounts.${uid}`],
    }]);
  }
};

const emailAliasId = (email: string) => email.trim().toLowerCase().replace(/%/g, '%25').replace(/\//g, '%2F');

const removeDirectory: Step['run'] = async ({ uid, email, store }) => {
  const [lookup, profile] = await Promise.all([store.get(`userLookup/${uid}`), store.get(`users/${uid}`)]);
  const emails = new Set<string>();
  for (const e of [email, lookup?.data.email, profile?.data.email]) {
    if (typeof e === 'string' && e.trim()) emails.add(emailAliasId(e));
  }
  // Recovery runs without the user's token email, and stored emails may be
  // stale, so also discover every alias this UID still owns.
  const owned = await store.query('userLookupByEmail', [{ field: 'uid', op: 'EQUAL', value: uid }]);
  for (const doc of owned) emails.add(lastSegment(doc.path));
  for (const alias of emails) {
    const aliasDoc = await store.get(`userLookupByEmail/${alias}`);
    // Never remove an alias another account has since claimed.
    if (aliasDoc && aliasDoc.data.uid === uid) {
      await store.commit([{ kind: 'delete', path: aliasDoc.path, updateTime: aliasDoc.updateTime }]);
    }
  }
  await store.commit([{ kind: 'delete', path: `userLookup/${uid}` }]);
};

// Runs last among data steps so anything the client wrote during cleanup is caught.
const deletePrivateData: Step['run'] = async ({ uid, store, rawStore }) => {
  for (const root of [`users/${uid}`, `blocks/${uid}`, `nearbyTravelers/${uid}`, `travelerReputation/${uid}`, `publicProfiles/${uid}`, `moderators/${uid}`]) {
    await deleteTree(store, root, rawStore);
  }
};

const r2Prefixes = (uid: string) => [`profile_photos/${uid}/`, `post_photos/${uid}/`];
const storagePrefixes = (uid: string) => [`profile_photos/${uid}/`, `trip_covers/${uid}/`, `journals/${uid}/`];
/** Single objects written by the earlier Swift app (profile_images/{uid}.jpg). */
export const legacyStorageObjects = (uid: string) => [`profile_images/${uid}.jpg`];
const LEGACY = 'legacyMediaCleanup';
/** Rows deleted from KV per slice (D1 Free allows 50 queries per invocation). */
const MEDIA_PURGE_PER_SLICE = 20;
/** Objects to purge now: revokeOwner (1) + purgePending (2 + n) must fit the D1 query budget with 2 to spare. */
function mediaPurgeLimit(media: NonNullable<DeletionDeps['media']>): number {
  return media.queries ? Math.min(MEDIA_PURGE_PER_SLICE, media.queries.remaining() - 5) : MEDIA_PURGE_PER_SLICE;
}

// KV media: revocation (D1 status 'removed') is immediate; bytes are deleted in
// bounded batches. The step completes only when no queued KV delete remains.
const deleteKvMedia: Step['run'] = async ({ uid, deps, work }) => {
  if (!deps.media) return; // no media bindings configured: no KV media can exist
  const limit = mediaPurgeLimit(deps.media);
  if (limit < 1) throw new SliceExhausted(); // D1 query budget used up in this invocation
  const now = (deps.now ?? Date.now)();
  await revokeOwner(deps.media.db, uid, now);
  work(0);
  const { remaining } = await purgePending(deps.media.db, deps.media.kv, { owner: uid, limit });
  if (remaining > 0) throw new MediaCleanupPending(remaining);
};

const deleteR2Media: Step['run'] = async ({ uid, deps, heartbeat }) => {
  if (!deps.r2) return;
  await deps.r2.deletePrefixes(r2Prefixes(uid), heartbeat);
};

/**
 * Legacy Firebase Storage. Deletion is only recorded as done when a fresh
 * listing/lookup proves absence. If Storage is inaccessible (Spark projects
 * lost access in 2026) the objects are recorded as UNRESOLVED — that record is
 * not evidence of deletion and stays an open item for operators.
 */
const deleteFirebaseMedia: Step['run'] = async ({ uid, deps, store, work, flags }) => {
  const fs = deps.firebaseStorage;
  const prefixes = storagePrefixes(uid);
  const objects = legacyStorageObjects(uid);
  const before = () => work(1);
  const record = (set: Record<string, unknown>) =>
    store.commit([{ kind: 'update', path: `${LEGACY}/${uid}`, set: { uid, prefixes, objects, ...set, updatedAtMs: (deps.now ?? Date.now)() }, mustExist: false }])
      .catch(async (e) => {
        if (!(e instanceof StoreConflict)) throw e;
        await store.commit([{ kind: 'update', path: `${LEGACY}/${uid}`, set: { ...set, updatedAtMs: (deps.now ?? Date.now)() } }]);
      });
  try {
    await fs.deletePrefixes(prefixes, before);
    await fs.deleteObjects(objects, before);
    if (!(await fs.verifyAbsent(prefixes, objects, before))) throw new Error('legacy media still listed after delete');
    await record({ status: 'verified_absent', store: fs.name, reason: null });
  } catch (e) {
    if (!(e instanceof LegacyMediaInaccessible)) throw e;
    await record({ status: 'unresolved', store: fs.name, reason: `inaccessible (${e.status})` });
    flags.legacyMediaUnresolved = true;
  }
};

export const DELETION_STEPS: readonly Step[] = [
  // Relationships first: each removal releases a counter on someone else's document.
  { id: 'likes', run: removeLikes },
  { id: 'saves', run: removeSaves },
  { id: 'follows', run: removeFollows },
  { id: 'comments', run: removeComments },
  // Owned social content.
  { id: 'posts', run: deleteOwnedContent('travelPosts') },
  { id: 'journals', run: deleteOwnedContent('travelJournals') },
  { id: 'stories', run: deleteOwned('travelStories', 'authorId') },
  { id: 'storyViews', run: removeStoryViews },
  // Community.
  { id: 'publicTrips', run: removeOwnedPublicTrips },
  { id: 'travelGroups', run: removeOwnedTravelGroups },
  { id: 'memberships', run: removeMemberships },
  { id: 'joinRequests', run: removeJoinRequests },
  { id: 'activityFeed', run: deleteOwned('activityFeed', 'actorUid') },
  { id: 'placeReviews', run: deleteOwned('user_place_reviews', 'userId') },
  { id: 'notifications', run: removeNotifications },
  // Chats: anonymize messages before leaving, so a retry can still find them.
  { id: 'sentMessages', run: anonymizeSentMessages },
  { id: 'groupChats', run: leaveGroupChats },
  { id: 'pendingGroups', run: leavePendingGroups },
  { id: 'directChats', run: anonymizeDirectChats },
  // Identity and private data.
  { id: 'directory', run: removeDirectory },
  { id: 'privateData', run: deletePrivateData },
  // Media: current KV media, then legacy stores.
  { id: 'media', run: deleteKvMedia },
  { id: 'r2Media', run: deleteR2Media },
  { id: 'firebaseMedia', run: deleteFirebaseMedia },
];

// ── Job bookkeeping ───────────────────────────────────────────────────────────

interface Attempt {
  id: string;
  leaseUntil: number;
}

interface Acquired {
  state: 'acquired' | 'completed';
  completedSteps: string[];
  flags: Record<string, unknown>;
}

async function acquireLease(store: DocStore, uid: string, now: number, attempt: Attempt): Promise<Acquired> {
  const path = `${JOBS}/${uid}`;
  for (let i = 0; i < MAX_CONFLICT_RETRIES; i++) {
    const job = await store.get(path);
    if (job?.data.status === 'completed') return { state: 'completed', completedSteps: [], flags: {} };
    if (job?.data.status === 'in_progress' && num(job.data.leaseUntil) > now) throw new DeletionInProgress();
    const leaseUntil = now + LEASE_MS;
    const set = { uid, status: 'in_progress', attemptId: attempt.id, leaseUntil, currentStep: null, lastError: null };
    const write: StoreWrite = job
      ? { kind: 'update', path, set, increment: { attempts: 1 }, serverTime: ['updatedAt'], updateTime: job.updateTime }
      : { kind: 'update', path, set: { ...set, attempts: 1, startedAtMs: now }, serverTime: ['startedAt', 'updatedAt'], mustExist: false };
    try {
      await store.commit([write]);
      attempt.leaseUntil = leaseUntil;
      const completed = Array.isArray(job?.data.completedSteps) ? (job!.data.completedSteps as string[]) : [];
      return { state: 'acquired', completedSteps: completed, flags: job?.data.legacyMediaUnresolved ? { legacyMediaUnresolved: true } : {} };
    } catch (e) {
      if (!(e instanceof StoreConflict)) throw e;
    }
  }
  throw new DeletionInProgress();
}

/**
 * Updates the job only while this attempt still owns an unexpired lease, and
 * renews the lease — or releases it (`release`) when a slice ends or the
 * attempt finishes. Conditional on the document's updateTime, so it can never
 * overwrite a newer attempt's result.
 */
async function updateOwnJob(
  store: DocStore,
  uid: string,
  attempt: Attempt,
  now: () => number,
  set: Record<string, unknown>,
  release = false
): Promise<void> {
  const path = `${JOBS}/${uid}`;
  for (let i = 0; i < MAX_CONFLICT_RETRIES; i++) {
    const job = await store.get(path);
    if (!job || job.data.attemptId !== attempt.id || job.data.status !== 'in_progress') {
      throw new DeletionAttemptLost('superseded');
    }
    if (now() > num(job.data.leaseUntil)) throw new DeletionAttemptLost('expired');
    const ending = release || (set.status !== undefined && set.status !== 'in_progress');
    const leaseUntil = ending ? 0 : now() + LEASE_MS;
    try {
      await store.commit([{ kind: 'update', path, set: { ...set, leaseUntil }, serverTime: ['updatedAt'], updateTime: job.updateTime }]);
      attempt.leaseUntil = leaseUntil;
      return;
    } catch (e) {
      if (!(e instanceof StoreConflict)) throw e;
    }
  }
  throw new DeletionAttemptLost('superseded');
}

/** Lease-guarded and (with a budget) metered view of the store for plan steps. */
function guarded(store: DocStore, heartbeat: () => Promise<void>, work: (need?: number) => void): DocStore {
  const before = async () => { work(1); await heartbeat(); };
  return {
    get: async (p) => { await before(); return store.get(p); },
    getMany: async (ps) => { await before(); return store.getMany(ps); },
    query: async (c, f, o) => { await before(); return store.query(c, f, o); },
    listDocumentIds: async (c) => { await before(); return store.listDocumentIds(c); },
    listCollectionIds: async (d) => { await before(); return store.listCollectionIds(d); },
    commit: async (w) => { await before(); return store.commit(w); },
  };
}

function safeMessage(e: unknown): string {
  return (e instanceof Error ? `${e.name}: ${e.message}` : 'Unknown error').slice(0, 200);
}

/** Calls needed to finish: pre-auth marker (2), Auth removal (1), completion (2), plus conflict retries. */
const AUTH_PHASE_CALLS = 7;

export type DeletionResult = { status: 'deleted' } | { status: 'in_progress'; completedSteps: number; totalSteps: number };

/**
 * Runs the deletion plan — the whole plan without a budget, or one bounded
 * slice with one. Throws DeletionInProgress when another attempt holds the
 * lease, DeletionAttemptLost when this attempt lost its lease, or
 * DeletionStepFailed (Auth untouched, barrier in place, safe to retry).
 */
export async function deleteAccount(identity: DeletionIdentity, deps: DeletionDeps): Promise<DeletionResult> {
  const now = deps.now ?? Date.now;
  const { uid } = identity;
  const { store, budget } = deps;
  const attempt: Attempt = { id: deps.newAttemptId?.() ?? crypto.randomUUID(), leaseUntil: 0 };
  const work = (need = 1) => { budget?.ensureWork(need); };

  // Creating/claiming the job document also raises the persistent barrier.
  const acquired = await acquireLease(store, uid, now(), attempt);
  if (acquired.state === 'completed') {
    await deps.deleteAuthUser(uid); // idempotent; covers a lost response after completion
    return { status: 'deleted' };
  }

  const heartbeat = async () => {
    if (now() > attempt.leaseUntil) throw new DeletionAttemptLost('expired');
    if (attempt.leaseUntil - now() < RENEW_WHEN_REMAINING_MS) await updateOwnJob(store, uid, attempt, now, {});
  };
  const flags: Record<string, unknown> = { ...acquired.flags };
  const ctx: Ctx = { uid, email: identity.email, store: guarded(store, heartbeat, work), rawStore: store, deps, heartbeat, work, flags };
  const done = new Set(acquired.completedSteps.filter((id) => DELETION_STEPS.some((s) => s.id === id)));
  const progress = () => DELETION_STEPS.filter((s) => done.has(s.id)).map((s) => s.id);
  const pause = async (current: string | null): Promise<DeletionResult> => {
    await updateOwnJob(store, uid, attempt, now, { completedSteps: progress(), currentStep: current, ...flags }, true);
    return { status: 'in_progress', completedSteps: done.size, totalSteps: DELETION_STEPS.length };
  };
  const fail = async (step: string, e: unknown): Promise<never> => {
    if (e instanceof DeletionAttemptLost) throw e;
    // Conditional: a lost attempt cannot mark a newer attempt's job failed.
    await updateOwnJob(store, uid, attempt, now, {
      status: 'failed',
      completedSteps: progress(),
      lastError: { step, message: safeMessage(e) },
      ...flags,
    }).catch(() => {});
    throw new DeletionStepFailed(step, e);
  };

  for (const step of DELETION_STEPS) {
    if (done.has(step.id)) continue; // persisted cursor: completed in an earlier slice
    try {
      await step.run(ctx);
      done.add(step.id);
    } catch (e) {
      if (e instanceof SliceExhausted || e instanceof MediaCleanupPending) return pause(step.id);
      await fail(step.id, e);
    }
  }

  // Only start the Auth phase if it can finish in this invocation.
  if (budget && budget.remaining() < AUTH_PHASE_CALLS + 2) return pause('auth');

  try {
    // Re-verifies ownership and renews the lease immediately before Auth removal.
    // Durable markers, written before Auth is touched: media cleanup finished
    // (drives the late-media sweep) and finalization is pending (drives
    // recovery). Neither depends on the final bookkeeping write below.
    await updateOwnJob(store, uid, attempt, now, {
      currentStep: 'auth',
      completedSteps: progress(),
      mediaClearedAtMs: now(),
      pendingFinalization: true,
      ...flags,
    });
    await deps.deleteAuthUser(uid);
  } catch (e) {
    await fail('auth', e);
  }

  // The account is gone; if this bookkeeping write fails the scheduled
  // finalizePendingDeletions() completes the job, so it is not reported.
  await updateOwnJob(store, uid, attempt, now, {
    status: 'completed',
    currentStep: null,
    completedSteps: [...progress(), 'auth'],
    completedAtMs: now(),
    pendingFinalization: false,
  }).catch(() => {});
  return { status: 'deleted' };
}

/**
 * Removes media for accounts whose deletion cleared media within the window.
 * Uploads that passed the barrier check before deletion began, but landed
 * after the media steps listed their prefixes, are cleaned up here. Keyed on
 * mediaClearedAtMs (written before Auth removal), not on job completion.
 */
export async function sweepRecentlyDeletedMedia(deps: DeletionDeps, windowMs = SWEEP_WINDOW_MS): Promise<number> {
  const now = deps.now ?? Date.now;
  const work = (need = 1) => { deps.budget?.ensureWork(need); };
  work(1);
  const jobs = await deps.store.query(JOBS, [{ field: 'mediaClearedAtMs', op: 'GREATER_THAN', value: now() - windowMs }]);
  let swept = 0;
  for (const job of jobs) {
    const uid = lastSegment(job.path);
    if (deps.media && mediaPurgeLimit(deps.media) >= 1) {
      await revokeOwner(deps.media.db, uid, now());
      await purgePending(deps.media.db, deps.media.kv, { owner: uid, limit: mediaPurgeLimit(deps.media) });
    }
    if (deps.r2) await deps.r2.deletePrefixes(r2Prefixes(uid));
    try {
      await deps.firebaseStorage.deletePrefixes(storagePrefixes(uid), () => work(1));
      await deps.firebaseStorage.deleteObjects(legacyStorageObjects(uid), () => work(1));
    } catch (e) {
      if (!(e instanceof LegacyMediaInaccessible)) throw e; // recorded as unresolved by the deletion step
    }
    swept++;
  }
  return swept;
}

/**
 * Claims a job pending finalization for this recovery run: a conditional write
 * on fresh state that takes the lease exactly like a user retry would. Refuses
 * when the job is completed, no longer pending, or held by a live attempt.
 */
async function claimForRecovery(store: DocStore, uid: string, now: () => number, attempt: Attempt): Promise<boolean> {
  const path = `${JOBS}/${uid}`;
  const job = await store.get(path);
  if (!job || job.data.pendingFinalization !== true || job.data.status === 'completed') return false;
  if (job.data.status === 'in_progress' && num(job.data.leaseUntil) > now()) return false;
  const leaseUntil = now() + LEASE_MS;
  try {
    await store.commit([{
      kind: 'update',
      path,
      set: { status: 'in_progress', attemptId: attempt.id, leaseUntil, currentStep: 'finalization', lastError: null },
      serverTime: ['updatedAt'],
      updateTime: job.updateTime,
    }]);
    attempt.leaseUntil = leaseUntil;
    return true;
  } catch (e) {
    if (e instanceof StoreConflict) return false; // a retry or another cron run got there first
    throw e;
  }
}

/** Calls one recovery needs: claim (2), lookup (1), fence (2), delete (1), completion (2). */
const FINALIZE_CALLS = 8;

/**
 * Completes jobs that reached Auth removal but whose final bookkeeping never
 * landed (or whose Auth removal failed after all data and media were gone),
 * without needing the deleted user to sign in again.
 *
 * Fencing: the run first claims the job lease (claimForRecovery), so user
 * retries and other cron runs are refused while it works; it then re-verifies
 * ownership with a conditional lease renewal immediately before removing Auth,
 * and stops if the lease was lost. Jobs held by a live attempt are skipped.
 */
export async function finalizePendingDeletions(deps: DeletionDeps): Promise<number> {
  const now = deps.now ?? Date.now;
  const { store, budget } = deps;
  budget?.ensureWork(1);
  const pending = await store.query(JOBS, [{ field: 'pendingFinalization', op: 'EQUAL', value: true }]);
  let finalized = 0;
  for (const listed of pending) {
    if (budget && budget.remaining() < FINALIZE_CALLS + 2) break; // next cron run continues
    const uid = lastSegment(listed.path);
    const attempt: Attempt = { id: `recovery-${deps.newAttemptId?.() ?? crypto.randomUUID()}`, leaseUntil: 0 };
    if (!(await claimForRecovery(store, uid, now, attempt))) continue;
    try {
      if (await deps.authUserExists(uid)) {
        // Fence: still the owner with a live lease right before the destructive call.
        await updateOwnJob(store, uid, attempt, now, { currentStep: 'auth' });
        await deps.deleteAuthUser(uid);
      }
      await updateOwnJob(store, uid, attempt, now, {
        status: 'completed',
        currentStep: null,
        pendingFinalization: false,
        completedAtMs: num(listed.data.completedAtMs) || now(),
        recoveredBy: 'scheduled-finalization',
      });
      finalized++;
    } catch (e) {
      if (e instanceof DeletionAttemptLost) continue;
      // Release the claim so a later run or a user retry can take over.
      await updateOwnJob(store, uid, attempt, now, {
        status: 'failed',
        lastError: { step: 'finalization', message: safeMessage(e) },
      }).catch(() => {});
    }
  }
  return finalized;
}

async function incompleteJobs(deps: DeletionDeps): Promise<StoredDoc[]> {
  deps.budget?.ensureWork(2);
  return [
    ...(await deps.store.query(JOBS, [{ field: 'status', op: 'EQUAL', value: 'failed' }])),
    ...(await deps.store.query(JOBS, [{ field: 'status', op: 'EQUAL', value: 'in_progress' }])),
  ];
}

/**
 * Continues deletions that stopped before reaching Auth removal (a failed
 * step, a lost lease, a paused slice, or a Worker request that ran out of
 * subrequests), so a started deletion completes without the user retrying.
 * Runs the normal plan through deleteAccount, whose lease acquisition fences
 * it against retries and other cron runs; jobs held by a live attempt are
 * skipped. With a budget, at most one slice per job and stops at the reserve.
 */
export async function resumeIncompleteDeletions(deps: DeletionDeps, jobs?: StoredDoc[]): Promise<number> {
  const now = deps.now ?? Date.now;
  const candidates = jobs ?? (await incompleteJobs(deps));
  let resumed = 0;
  for (const job of candidates) {
    if (job.data.pendingFinalization === true) continue; // finalizePendingDeletions owns these
    if (job.data.status === 'in_progress' && num(job.data.leaseUntil) > now()) continue;
    if (deps.budget && deps.budget.remaining() < 12) break; // not enough for a useful slice
    try {
      const r = await deleteAccount({ uid: lastSegment(job.path), email: null }, deps);
      if (r.status === 'deleted') resumed++;
    } catch {
      // Recorded on the job (or another party holds it); the next run continues.
    }
  }
  return resumed;
}

/** A started deletion is reported as stalled once it has run this long without completing. */
export const STALLED_AFTER_MS = 6 * 60 * 60 * 1000;

export interface StalledDeletion {
  uid: string;
  status: string;
  currentStep: string | null;
  lastErrorStep: string | null;
  attempts: number;
  pendingFinalization: boolean;
  ageMs: number;
}

function stalledFrom(jobs: StoredDoc[], now: number, stalledAfterMs: number): StalledDeletion[] {
  const stalled: StalledDeletion[] = [];
  for (const job of jobs) {
    const started = num(job.data.startedAtMs) || Date.parse(String(job.data.startedAt ?? '')) || 0;
    const ageMs = started ? now - started : Number.POSITIVE_INFINITY;
    if (ageMs < stalledAfterMs) continue;
    const lastError = job.data.lastError as { step?: string } | null | undefined;
    stalled.push({
      uid: lastSegment(job.path),
      status: String(job.data.status),
      currentStep: (job.data.currentStep as string | null | undefined) ?? null,
      lastErrorStep: lastError?.step ?? null,
      attempts: num(job.data.attempts),
      pendingFinalization: job.data.pendingFinalization === true,
      ageMs,
    });
  }
  return stalled;
}

/**
 * Deletions that started more than `stalledAfterMs` ago and are still not
 * complete (persistent outage, missing credentials, a plan step that keeps
 * failing). Retries alone cannot guarantee completion; these need an operator
 * (see docs/release-hardening.md, "Stalled deletion runbook"). UIDs only — no
 * email or profile data.
 */
export async function listStalledDeletions(deps: DeletionDeps, stalledAfterMs = STALLED_AFTER_MS): Promise<StalledDeletion[]> {
  return stalledFrom(await incompleteJobs(deps), (deps.now ?? Date.now)(), stalledAfterMs);
}

/** Legacy media recorded as unresolved (inaccessible store): open items, not deletions. */
export async function listUnresolvedLegacyMedia(deps: DeletionDeps): Promise<{ uid: string; store: string; reason: string }[]> {
  deps.budget?.ensureWork(1);
  const rows = await deps.store.query(LEGACY, [{ field: 'status', op: 'EQUAL', value: 'unresolved' }]);
  return rows.map((r) => ({ uid: lastSegment(r.path), store: String(r.data.store), reason: String(r.data.reason) }));
}

export interface MaintenanceResult {
  finalized: number;
  resumed: number;
  swept: number;
  stalled: number;
  /** True when the invocation's budget ended the run early; the next run continues. */
  budgetLimited: boolean;
}

/**
 * Cron entry: finish stranded jobs, continue stalled deletions (one bounded
 * slice), sweep late media, then report deletions that are still stuck as a
 * structured warning (`account_deletion_stalled`) for log-based alerting. With
 * a budget every phase stops at the reserve and the next run picks up.
 */
export async function runScheduledMaintenance(deps: DeletionDeps): Promise<MaintenanceResult> {
  const result: MaintenanceResult = { finalized: 0, resumed: 0, swept: 0, stalled: 0, budgetLimited: false };
  const phase = async (run: () => Promise<void>) => {
    try { await run(); } catch (e) {
      if (e instanceof SliceExhausted) { result.budgetLimited = true; return; }
      throw e;
    }
  };
  let jobs: StoredDoc[] = [];
  await phase(async () => { result.finalized = await finalizePendingDeletions(deps); });
  await phase(async () => {
    jobs = await incompleteJobs(deps);
    result.resumed = await resumeIncompleteDeletions(deps, jobs);
  });
  await phase(async () => { result.swept = await sweepRecentlyDeletedMedia(deps); });
  const stalledJobs = stalledFrom(jobs, (deps.now ?? Date.now)(), STALLED_AFTER_MS);
  result.stalled = stalledJobs.length;
  if (stalledJobs.length) {
    console.warn(JSON.stringify({ event: 'account_deletion_stalled', count: stalledJobs.length, jobs: stalledJobs }));
  }
  if (deps.budget && deps.budget.remaining() < DEFAULT_RESERVE_FOR_REPORT) result.budgetLimited = true;
  return result;
}

const DEFAULT_RESERVE_FOR_REPORT = 1;
