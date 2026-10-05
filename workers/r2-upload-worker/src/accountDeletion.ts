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

import { StoreConflict, type CommitResult, type DocStore, type QueryFilter, type QueryOptions, type StoredDoc, type StoreWrite } from './firestoreRest';
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
  /**
   * 'required' (default): legacy stores must be bound and verified empty.
   * 'none': staging only (the Worker refuses it for the production project) —
   * an unbound R2 store is accepted and Firebase Storage is accepted as empty
   * only when an authenticated lookup shows its bucket was never provisioned.
   */
  legacyMode?: 'required' | 'none';
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
  /** Id of the running step; prefixes its cursor keys. */
  stepId: string;
  /** Resume positions (last fully handled document path), saved on the job when a slice ends. */
  cursors: Record<string, string>;
}

/** Media cleanup still has queued deletes (e.g. KV daily quota): resume in a later slice. */
export class MediaCleanupPending extends Error {
  constructor(readonly remaining: number) {
    super(`${remaining} media deletions still pending`);
    this.name = 'MediaCleanupPending';
  }
}

/**
 * A cleanup step cannot be completed or proven complete (store inaccessible,
 * binding missing). The step stays incomplete, Auth is kept, and later slices
 * and cron runs retry it.
 */
export class DeletionBlocked extends Error {
  constructor(readonly reason: string) {
    super(`deletion blocked: ${reason}`);
    this.name = 'DeletionBlocked';
  }
}

type Step = { id: string; run: (ctx: Ctx) => Promise<void> };

// ── Helpers ───────────────────────────────────────────────────────────────────

const lastSegment = (path: string) => path.split('/').pop()!;
const num = (v: unknown) => (typeof v === 'number' ? v : 0);
/** Results per query/listing call: one subrequest each. */
const PAGE = 100;

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

/**
 * Visits every match one page (one subrequest) at a time. `handle` gets a page
 * and returns how many of its documents are fully handled (all of them unless
 * it stops early); the cursor then moves past them, so a later slice resumes
 * after the last handled document instead of re-reading from the start. This
 * matters for documents a step changes but does not remove from the query
 * (tombstoned comments, anonymized messages). Steps stay idempotent, so
 * re-handling a partly handled document is safe. The cursor is cleared when
 * the iteration ends.
 */
async function eachPage(
  ctx: Ctx,
  sub: string,
  collectionId: string,
  filters: QueryFilter[],
  opts: Pick<QueryOptions, 'parent' | 'allDescendants'>,
  handle: (docs: StoredDoc[]) => Promise<unknown>
): Promise<void> {
  const key = `${ctx.stepId}:${sub}`;
  for (;;) {
    const after = ctx.cursors[key];
    const docs = await ctx.store.query(collectionId, filters, { ...opts, limit: PAGE, ...(after ? { startAfter: { path: after } } : {}) });
    if (docs.length) {
      await handle(docs);
      ctx.cursors[key] = docs[docs.length - 1].path;
      ctx.deps.budget?.markProgress();
    }
    if (docs.length < PAGE) break;
  }
  delete ctx.cursors[key];
}

/** eachPage, one document at a time: the cursor advances after each handled document. */
function eachMatch(
  ctx: Ctx,
  sub: string,
  collectionId: string,
  filters: QueryFilter[],
  opts: Pick<QueryOptions, 'parent' | 'allDescendants'>,
  handle: (doc: StoredDoc) => Promise<unknown>
): Promise<void> {
  const key = `${ctx.stepId}:${sub}`;
  return eachPage(ctx, sub, collectionId, filters, opts, async (docs) => {
    for (const d of docs) {
      await handle(d);
      ctx.cursors[key] = d.path;
      ctx.deps.budget?.markProgress();
    }
  });
}

const deleteAll = (store: DocStore, docs: StoredDoc[]) =>
  docs.length ? store.commit(docs.map((d): StoreWrite => ({ kind: 'delete', path: d.path }))) : Promise.resolve();

/**
 * Deletes a subtree one listing page at a time, children first. Each page of
 * documents is deleted in one commit once their own subtrees are empty. If the
 * slice ends mid-page, the documents already emptied are committed from the
 * reserve before stopping; parents still lead the next slice to what remains.
 * Listing the first page again makes progress because handled documents are gone.
 */
async function deleteTree(ctx: Ctx, ...docPaths: string[]): Promise<void> {
  for (const p of docPaths) await clearSubcollections(ctx, p);
  await ctx.store.commit(docPaths.map((path): StoreWrite => ({ kind: 'delete', path })));
}

async function clearSubcollections(ctx: Ctx, docPath: string): Promise<void> {
  for (;;) {
    const collections = await ctx.store.listCollectionIds(docPath, { limit: PAGE });
    if (!collections.length) return;
    for (const c of collections) await clearCollection(ctx, `${docPath}/${c}`); // emptied collections stop being listed
  }
}

async function clearCollection(ctx: Ctx, collectionPath: string): Promise<void> {
  for (;;) {
    const ids = await ctx.store.listDocumentIds(collectionPath, { limit: PAGE });
    if (!ids.length) return;
    const emptied: StoreWrite[] = [];
    try {
      for (const id of ids) {
        await clearSubcollections(ctx, `${collectionPath}/${id}`);
        emptied.push({ kind: 'delete', path: `${collectionPath}/${id}` });
      }
    } catch (e) {
      if (e instanceof SliceExhausted && emptied.length) await ctx.rawStore.commit(emptied);
      throw e;
    }
    await ctx.store.commit(emptied);
  }
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
  return (ctx) => eachMatch(ctx, 'owned', collectionId, [{ field: ownerField, op: 'EQUAL', value: ctx.uid }], {}, (d) => deleteTree(ctx, d.path));
}

// ── Steps ─────────────────────────────────────────────────────────────────────

// Likes and saves by anyone on a deleted post/journal would dangle; they go
// with the content (no counters to release), before the content itself so a
// retry can still discover them through the author's remaining documents.
function deleteOwnedContent(collectionId: 'travelPosts' | 'travelJournals'): Step['run'] {
  const kind = collectionId === 'travelPosts' ? 'post' : 'journal';
  return (ctx) => eachMatch(ctx, 'items', collectionId, [{ field: 'authorId', op: 'EQUAL', value: ctx.uid }], {}, async (item) => {
    const id = lastSegment(item.path);
    await eachPage(ctx, `likes:${id}`, 'postLikes', [{ field: 'postId', op: 'EQUAL', value: id }], {}, (likes) =>
      deleteAll(ctx.store, likes.filter((l) => (l.data.targetType ?? kind) === kind))); // legacy likes carry no targetType
    if (kind === 'post') {
      await eachPage(ctx, `saves:${id}`, 'savedPosts', [{ field: 'postId', op: 'EQUAL', value: id }], {}, (saves) => deleteAll(ctx.store, saves));
    }
    await deleteTree(ctx, item.path);
  });
}

const removeLikes: Step['run'] = (ctx) => {
  const { store } = ctx;
  return eachMatch(ctx, 'mine', 'postLikes', [{ field: 'userId', op: 'EQUAL', value: ctx.uid }], {}, (like) =>
    removeEdge(store, like.path, async (edge) => {
      const targetId = String(edge.data.postId ?? '');
      if (!targetId) return [];
      let kind = edge.data.targetType as string | undefined;
      if (kind !== 'post' && kind !== 'journal') {
        kind = (await store.get(`travelPosts/${targetId}`)) ? 'post' : 'journal';
      }
      return [{ path: `${kind === 'post' ? 'travelPosts' : 'travelJournals'}/${targetId}`, field: 'likeCount' }];
    }));
};

const removeSaves: Step['run'] = (ctx) =>
  eachMatch(ctx, 'mine', 'savedPosts', [{ field: 'userId', op: 'EQUAL', value: ctx.uid }], {}, (saved) =>
    removeEdge(ctx.store, saved.path, async (edge) =>
      edge.data.postId ? [{ path: `travelPosts/${edge.data.postId}`, field: 'saveCount' }] : []
    ));

const removeFollows: Step['run'] = async (ctx) => {
  await eachMatch(ctx, 'out', 'follows', [{ field: 'followerId', op: 'EQUAL', value: ctx.uid }], {}, (f) =>
    removeEdge(ctx.store, f.path, async (edge) =>
      edge.data.followingId ? [{ path: `publicProfiles/${edge.data.followingId}`, field: 'followersCount' }] : []
    ));
  await eachMatch(ctx, 'in', 'follows', [{ field: 'followingId', op: 'EQUAL', value: ctx.uid }], {}, (f) =>
    removeEdge(ctx.store, f.path, async (edge) =>
      edge.data.followerId ? [{ path: `publicProfiles/${edge.data.followerId}`, field: 'followingCount' }] : []
    ));
};

// Own comments on own posts disappear with the post. Own comments on other
// users' posts become anonymous tombstones (preserving replies by others) and
// release their counters exactly once, guarded by the isDeleted transition.
const removeComments: Step['run'] = (ctx) => {
  const { uid, store } = ctx;
  // One atomic unit per comment (≤ 6 work units: comment, post, parent, commit), so it fits any fresh slice.
  return eachMatch(ctx, 'mine', 'postComments', [{ field: 'authorId', op: 'EQUAL', value: uid }], {}, (c) =>
    atomically(store, async () => {
      const postId = String(c.data.postId ?? '');
      const [comment, post] = await Promise.all([store.get(c.path), postId ? store.get(`travelPosts/${postId}`) : Promise.resolve(null)]);
      if (!comment) return null;
      // Own comments on own (or missing) posts disappear with the post.
      if (!post || post.data.authorId === uid) return [{ kind: 'delete', path: comment.path, updateTime: comment.updateTime }];
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
        writes.push(...decrement(post, 'commentCount'));
        const parentId = comment.data.parentCommentId;
        if (typeof parentId === 'string' && parentId) {
          writes.push(...decrement(await store.get(`postComments/${parentId}`), 'replyCount'));
        }
      }
      return writes;
    }));
};

const cancelPending = (ctx: Ctx, sub: string, collectionId: string) =>
  eachPage(ctx, sub, collectionId, [
    { field: 'ownerUid', op: 'EQUAL', value: ctx.uid },
    { field: 'status', op: 'EQUAL', value: 'pending' },
  ], {}, (pending) => ctx.store.commit(pending.map((r): StoreWrite => ({ kind: 'update', path: r.path, set: { status: 'cancelled' }, serverTime: ['updatedAt'] }))));

const removeOwnedPublicTrips: Step['run'] = async (ctx) => {
  await eachMatch(ctx, 'trips', 'publicTrips', [{ field: 'ownerUid', op: 'EQUAL', value: ctx.uid }], {}, async (trip) => {
    await deleteTree(ctx, `trips/${lastSegment(trip.path)}`, trip.path); // members subcollection, then both roots in one commit
  });
  await cancelPending(ctx, 'requests', 'tripJoinRequests');
};

const removeOwnedTravelGroups: Step['run'] = async (ctx) => {
  await eachMatch(ctx, 'groups', 'travelGroups', [{ field: 'ownerUid', op: 'EQUAL', value: ctx.uid }], {}, (group) => deleteTree(ctx, group.path));
  await cancelPending(ctx, 'requests', 'groupJoinRequests');
};

// Membership in other users' public trips (trips/{id}/members) and community
// groups (travelGroups/{id}/members); each removal releases one memberCount.
const removeMemberships: Step['run'] = (ctx) =>
  eachMatch(ctx, 'members', 'members', [{ field: 'uid', op: 'EQUAL', value: ctx.uid }], { allDescendants: true }, async (m) => {
    const [root, parentId] = m.path.split('/');
    const counterPath = root === 'trips' ? `publicTrips/${parentId}` : root === 'travelGroups' ? `travelGroups/${parentId}` : null;
    if (!counterPath) return;
    await removeEdge(ctx.store, m.path, async () => [{ path: counterPath, field: 'memberCount' }]);
  });

const removeJoinRequests: Step['run'] = async (ctx) => {
  for (const col of ['tripJoinRequests', 'groupJoinRequests']) {
    await eachPage(ctx, col, col, [{ field: 'requestorUid', op: 'EQUAL', value: ctx.uid }], {}, (requests) => deleteAll(ctx.store, requests));
  }
};

const removeNotifications: Step['run'] = async (ctx) => {
  await eachPage(ctx, 'own', 'notifications', [{ field: 'userId', op: 'EQUAL', value: ctx.uid }], {}, (own) => deleteAll(ctx.store, own));
  // Notifications delivered to other users stay, without this user's identity.
  await eachPage(ctx, 'sent', 'notifications', [{ field: 'actorId', op: 'EQUAL', value: ctx.uid }], {}, async (sent) => {
    const writes = sent
      .filter((n) => n.data.actorName !== DELETED_NAME || n.data.actorPhoto != null)
      .map((n): StoreWrite => ({ kind: 'update', path: n.path, set: { actorName: DELETED_NAME, actorPhoto: null } }));
    if (writes.length) await ctx.store.commit(writes);
  });
};

const removeStoryViews: Step['run'] = (ctx) => {
  const { uid, store } = ctx;
  return eachMatch(ctx, 'viewed', 'travelStories', [{ field: 'viewerIds', op: 'ARRAY_CONTAINS', value: uid }], {}, (story) =>
    atomically(store, async () => {
      const current = await store.get(story.path);
      const viewers = (current?.data.viewerIds as unknown[] | undefined) ?? [];
      if (!current || !viewers.includes(uid)) return null;
      return [{ kind: 'update', path: current.path, set: { viewerIds: viewers.filter((v) => v !== uid) }, updateTime: current.updateTime }];
    }));
};

// Messages this user sent stay visible to the other participants (documented
// in the privacy policy) but no longer carry the user's name.
const anonymizeSentMessages: Step['run'] = (ctx) =>
  eachPage(ctx, 'sent', 'messages', [{ field: 'senderId', op: 'EQUAL', value: ctx.uid }], { allDescendants: true }, async (sent) => {
    const writes = sent
      .filter((m) => m.path.startsWith('groups/') && typeof m.data.senderName === 'string' && m.data.senderName !== DELETED_NAME)
      .map((m): StoreWrite => ({ kind: 'update', path: m.path, set: { senderName: DELETED_NAME } }));
    if (writes.length) await ctx.store.commit(writes);
  });

const leaveGroupChats: Step['run'] = (ctx) => {
  const { uid, store } = ctx;
  return eachMatch(ctx, 'groups', 'groups', [{ field: 'members', op: 'ARRAY_CONTAINS', value: uid }], {}, async (group) => {
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
    if (emptied) await deleteTree(ctx, group.path);
  });
};

// Groups another user is still creating can list this user as a pending
// member (with name and unread entry). Remove the UID and its identity fields;
// the group, its creator and other members are untouched. Conditional on the
// group's updateTime, so a concurrent resume by the creator is re-read, never lost.
const leavePendingGroups: Step['run'] = (ctx) => {
  const { uid, store } = ctx;
  return eachMatch(ctx, 'groups', 'groups', [{ field: 'pendingMembers', op: 'ARRAY_CONTAINS', value: uid }], {}, (group) =>
    atomically(store, async () => {
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
    }));
};

const anonymizeDirectChats: Step['run'] = (ctx) => {
  const { uid, store } = ctx;
  return eachMatch(ctx, 'chats', 'direct_chats', [{ field: 'participants', op: 'ARRAY_CONTAINS', value: uid }], {}, async (chat) => {
    const info = (chat.data.participantInfo as Record<string, Record<string, unknown>> | undefined)?.[uid];
    const unread = (chat.data.unreadCounts as Record<string, unknown> | undefined)?.[uid];
    if (info?.name === DELETED_NAME && unread === undefined) return;
    // participants keeps the UID so the other user's read access is unchanged.
    await store.commit([{
      kind: 'update',
      path: chat.path,
      set: { [`participantInfo.${uid}`]: { name: DELETED_NAME, initials: '?' } },
      remove: [`unreadCounts.${uid}`],
    }]);
  });
};

const emailAliasId = (email: string) => email.trim().toLowerCase().replace(/%/g, '%25').replace(/\//g, '%2F');

const removeDirectory: Step['run'] = async (ctx) => {
  const { uid, email, store } = ctx;
  const removeAlias = async (alias: string) => {
    const aliasDoc = await store.get(`userLookupByEmail/${alias}`);
    // Never remove an alias another account has since claimed.
    if (aliasDoc && aliasDoc.data.uid === uid) {
      await store.commit([{ kind: 'delete', path: aliasDoc.path, updateTime: aliasDoc.updateTime }]);
    }
  };
  const [lookup, profile] = await Promise.all([store.get(`userLookup/${uid}`), store.get(`users/${uid}`)]);
  const emails = new Set<string>();
  for (const e of [email, lookup?.data.email, profile?.data.email]) {
    if (typeof e === 'string' && e.trim()) emails.add(emailAliasId(e));
  }
  for (const alias of emails) await removeAlias(alias);
  // Recovery runs without the user's token email, and stored emails may be
  // stale, so also remove every alias this UID still owns.
  await eachMatch(ctx, 'aliases', 'userLookupByEmail', [{ field: 'uid', op: 'EQUAL', value: uid }], {}, (doc) => removeAlias(lastSegment(doc.path)));
  await store.commit([{ kind: 'delete', path: `userLookup/${uid}` }]);
};

// Runs last among data steps so anything the client wrote during cleanup is caught.
const deletePrivateData: Step['run'] = async (ctx) => {
  const { uid } = ctx;
  await deleteTree(ctx, `users/${uid}`, `blocks/${uid}`, `nearbyTravelers/${uid}`, `travelerReputation/${uid}`, `publicProfiles/${uid}`, `moderators/${uid}`);
};

const r2Prefixes = (uid: string) => [`profile_photos/${uid}/`, `post_photos/${uid}/`];
const storagePrefixes = (uid: string) => [`profile_photos/${uid}/`, `trip_covers/${uid}/`, `journals/${uid}/`];
/** Single objects written by the earlier Swift app (profile_images/{uid}.jpg). */
export const legacyStorageObjects = (uid: string) => [`profile_images/${uid}.jpg`];
const LEGACY = 'legacyMediaCleanup';
/** Rows deleted from KV per slice (D1 Free allows 50 queries per invocation). */
const MEDIA_PURGE_PER_SLICE = 20;
/**
 * Objects to purge now: revokeOwner (1) + purgePending (2 + n) must fit the D1
 * query budget with 2 to spare, and the CPU allowance (3 units + 1.5 per object).
 */
function mediaPurgeLimit(media: NonNullable<DeletionDeps['media']>, budget?: SubrequestBudget): number {
  const byQueries = media.queries ? media.queries.remaining() - 5 : MEDIA_PURGE_PER_SLICE;
  // Before this slice made progress, always allow one object, so a small allowance cannot live-lock.
  const byCpu = budget ? Math.max(budget.progressed ? 0 : 1, Math.floor((budget.workRemaining() - 3) / 1.5)) : MEDIA_PURGE_PER_SLICE;
  return Math.min(MEDIA_PURGE_PER_SLICE, byQueries, byCpu);
}
const mediaUnits = (limit: number) => 3 + Math.ceil(limit * 1.5);

// KV media: revocation (D1 status 'removed') is immediate; bytes are deleted in
// bounded batches. The step completes only when no queued KV delete remains.
const deleteKvMedia: Step['run'] = async ({ uid, deps, work }) => {
  // Missing bindings are not proof that no media exists: the step waits for them.
  if (!deps.media) throw new DeletionBlocked('media-bindings-missing');
  const limit = mediaPurgeLimit(deps.media, deps.budget);
  if (limit < 1) throw new SliceExhausted(); // D1 or CPU allowance used up in this invocation
  deps.budget?.useWork(mediaUnits(limit));
  const now = (deps.now ?? Date.now)();
  await revokeOwner(deps.media.db, uid, now);
  work(0);
  const { deleted, remaining } = await purgePending(deps.media.db, deps.media.kv, { owner: uid, limit });
  if (deleted > 0) deps.budget?.markProgress();
  if (remaining > 0) throw new MediaCleanupPending(remaining);
};

const deleteR2Media: Step['run'] = async ({ uid, deps, heartbeat }) => {
  if (!deps.r2) {
    if (deps.legacyMode === 'none') return; // staging no-legacy mode: never had an R2 bucket
    throw new DeletionBlocked('legacy-r2-unbound');
  }
  await deps.r2.deletePrefixes(r2Prefixes(uid), heartbeat);
};

/**
 * Legacy Firebase Storage. The step completes only when a fresh listing and
 * object lookup prove absence (recorded as `verified_absent`). If Storage is
 * inaccessible (Spark projects lost access in 2026) the objects are recorded
 * as UNRESOLVED for operators and the step stays incomplete (LegacyMediaBlocked):
 * Auth is kept and every later slice or cron run retries, so the deletion
 * finishes once access returns. An `unresolved` record is never evidence of deletion.
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
    // Staging no-legacy mode: proof of absence is an authenticated lookup
    // showing the bucket itself was never provisioned. Anything else (bucket
    // exists, access denied) takes the normal path below.
    if (deps.legacyMode === 'none' && !(await fs.bucketExists(before))) {
      await record({ status: 'verified_absent', store: fs.name, reason: null, proof: 'bucket-not-provisioned' });
      flags.legacyMediaUnresolved = false;
      return;
    }
    await fs.deletePrefixes(prefixes, before);
    await fs.deleteObjects(objects, before);
    if (!(await fs.verifyAbsent(prefixes, objects, before))) throw new Error('legacy media still listed after delete');
  } catch (e) {
    if (!(e instanceof LegacyMediaInaccessible)) throw e;
    await record({ status: 'unresolved', store: fs.name, reason: `inaccessible (${e.status})` });
    flags.legacyMediaUnresolved = true;
    throw new DeletionBlocked('legacy-media-inaccessible');
  }
  await record({ status: 'verified_absent', store: fs.name, reason: null, proof: 'listing-and-lookup' });
  flags.legacyMediaUnresolved = false;
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
  /** updateTime of this attempt's own last job write: the precondition for the next one. */
  updateTime?: string;
}

const firstUpdateTime = (r: CommitResult | void) => (r && r.updateTimes[0]) || undefined;

interface Acquired {
  state: 'acquired' | 'completed';
  completedSteps: string[];
  flags: Record<string, unknown>;
  cursors: Record<string, string>;
}

async function acquireLease(store: DocStore, uid: string, now: number, attempt: Attempt, prefetched?: StoredDoc | null): Promise<Acquired> {
  const path = `${JOBS}/${uid}`;
  for (let i = 0; i < MAX_CONFLICT_RETRIES; i++) {
    // The caller's fresh read of the job is reused once; the write is conditional on it.
    const job = i === 0 && prefetched !== undefined ? prefetched : await store.get(path);
    if (job?.data.status === 'completed') return { state: 'completed', completedSteps: [], flags: {}, cursors: {} };
    if (job?.data.status === 'in_progress' && num(job.data.leaseUntil) > now) throw new DeletionInProgress();
    const leaseUntil = now + LEASE_MS;
    const set = { uid, status: 'in_progress', attemptId: attempt.id, leaseUntil, currentStep: null, lastError: null };
    const write: StoreWrite = job
      ? { kind: 'update', path, set, increment: { attempts: 1 }, serverTime: ['updatedAt'], updateTime: job.updateTime }
      : { kind: 'update', path, set: { ...set, attempts: 1, startedAtMs: now }, serverTime: ['startedAt', 'updatedAt'], mustExist: false };
    try {
      attempt.updateTime = firstUpdateTime(await store.commit([write]));
      attempt.leaseUntil = leaseUntil;
      const completed = Array.isArray(job?.data.completedSteps) ? (job!.data.completedSteps as string[]) : [];
      const saved = job?.data.cursors;
      return {
        state: 'acquired',
        completedSteps: completed,
        flags: job?.data.legacyMediaUnresolved === true ? { legacyMediaUnresolved: true } : {},
        cursors: saved && typeof saved === 'object' ? { ...(saved as Record<string, string>) } : {},
      };
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
  const ending = release || (set.status !== undefined && set.status !== 'in_progress');
  // Fast path: the job is unchanged since this attempt's own last write (which
  // made it the owner with this lease), so that write's updateTime is a complete
  // precondition. Any other write in between fails it and falls back to the
  // read-and-check path below.
  if (attempt.updateTime) {
    if (now() > attempt.leaseUntil) throw new DeletionAttemptLost('expired');
    const leaseUntil = ending ? 0 : now() + LEASE_MS;
    try {
      const r = await store.commit([{ kind: 'update', path, set: { ...set, leaseUntil }, serverTime: ['updatedAt'], updateTime: attempt.updateTime }]);
      attempt.leaseUntil = leaseUntil;
      attempt.updateTime = firstUpdateTime(r);
      return;
    } catch (e) {
      if (!(e instanceof StoreConflict)) throw e;
      attempt.updateTime = undefined;
    }
  }
  for (let i = 0; i < MAX_CONFLICT_RETRIES; i++) {
    const job = await store.get(path);
    if (!job || job.data.attemptId !== attempt.id || job.data.status !== 'in_progress') {
      throw new DeletionAttemptLost('superseded');
    }
    if (now() > num(job.data.leaseUntil)) throw new DeletionAttemptLost('expired');
    const leaseUntil = ending ? 0 : now() + LEASE_MS;
    try {
      const r = await store.commit([{ kind: 'update', path, set: { ...set, leaseUntil }, serverTime: ['updatedAt'], updateTime: job.updateTime }]);
      attempt.leaseUntil = leaseUntil;
      attempt.updateTime = firstUpdateTime(r);
      return;
    } catch (e) {
      if (!(e instanceof StoreConflict)) throw e;
    }
  }
  throw new DeletionAttemptLost('superseded');
}

/** Lease-guarded and (with a budget) metered view of the store for plan steps. */
function guarded(store: DocStore, heartbeat: () => Promise<void>, work: (need?: number) => void, progress: () => void = () => {}): DocStore {
  const before = async (units = 1) => { work(units); await heartbeat(); };
  return {
    get: async (p) => { await before(); return store.get(p); },
    getMany: async (ps) => { await before(); return store.getMany(ps); },
    query: async (c, f, o) => { await before(); return store.query(c, f, o); },
    listDocumentIds: async (c, o) => { await before(); return store.listDocumentIds(c, o); },
    listCollectionIds: async (d, o) => { await before(); return store.listCollectionIds(d, o); },
    commit: async (w) => { await before(2); const r = await store.commit(w); progress(); return r; },
  };
}

function safeMessage(e: unknown): string {
  return (e instanceof Error ? `${e.name}: ${e.message}` : 'Unknown error').slice(0, 200);
}

/** Calls needed to finish: pre-auth marker (2), Auth removal (1), completion (2), plus conflict retries. */
const AUTH_PHASE_CALLS = 7;
/** CPU allowance the Auth phase needs: marker commit (2), Auth removal (1), completion commit (2). */
const AUTH_PHASE_UNITS = 5;

export type DeletionResult =
  | { status: 'deleted' }
  | { status: 'in_progress'; completedSteps: number; totalSteps: number }
  /** A step cannot finish until something outside the Worker changes (e.g. Storage access); retried automatically. */
  | { status: 'blocked'; step: string; reason: string; completedSteps: number; totalSteps: number };

/**
 * Runs the deletion plan — the whole plan without a budget, or one bounded
 * slice with one. Returns 'blocked' (Auth kept, retried by later slices and
 * cron) when legacy media cannot be verified absent. Throws DeletionInProgress
 * when another attempt holds the lease, DeletionAttemptLost when this attempt
 * lost its lease, or DeletionStepFailed (Auth untouched, barrier in place, safe to retry).
 */
export async function deleteAccount(identity: DeletionIdentity, deps: DeletionDeps, opts: { job?: StoredDoc | null } = {}): Promise<DeletionResult> {
  const now = deps.now ?? Date.now;
  const { uid } = identity;
  const { store, budget } = deps;
  const attempt: Attempt = { id: deps.newAttemptId?.() ?? crypto.randomUUID(), leaseUntil: 0 };
  const work = (need = 1) => { budget?.ensureWork(need); };

  // Creating/claiming the job document also raises the persistent barrier.
  const acquired = await acquireLease(store, uid, now(), attempt, opts.job);
  if (acquired.state === 'completed') {
    await deps.deleteAuthUser(uid); // idempotent; covers a lost response after completion
    return { status: 'deleted' };
  }

  const heartbeat = async () => {
    if (now() > attempt.leaseUntil) throw new DeletionAttemptLost('expired');
    if (attempt.leaseUntil - now() < RENEW_WHEN_REMAINING_MS) await updateOwnJob(store, uid, attempt, now, {});
  };
  const flags: Record<string, unknown> = { ...acquired.flags };
  const cursors = acquired.cursors;
  const ctx: Ctx = { uid, email: identity.email, store: guarded(store, heartbeat, work, () => budget?.markProgress()), rawStore: store, deps, heartbeat, work, flags, stepId: '', cursors };
  const done = new Set(acquired.completedSteps.filter((id) => DELETION_STEPS.some((s) => s.id === id)));
  // An earlier version marked the legacy step done while its media was unresolved: redo it.
  if (flags.legacyMediaUnresolved === true) done.delete('firebaseMedia');
  const progress = () => DELETION_STEPS.filter((s) => done.has(s.id)).map((s) => s.id);
  const pause = async (current: string | null, blocked?: string): Promise<DeletionResult> => {
    await updateOwnJob(store, uid, attempt, now, {
      completedSteps: progress(), currentStep: current, cursors, blockedOn: blocked ? current : null, ...flags,
    }, true);
    const counts = { completedSteps: done.size, totalSteps: DELETION_STEPS.length };
    return blocked && current ? { status: 'blocked', step: current, reason: blocked, ...counts } : { status: 'in_progress', ...counts };
  };
  const fail = async (step: string, e: unknown): Promise<never> => {
    if (e instanceof DeletionAttemptLost) throw e;
    // Conditional: a lost attempt cannot mark a newer attempt's job failed.
    await updateOwnJob(store, uid, attempt, now, {
      status: 'failed',
      completedSteps: progress(),
      cursors,
      lastError: { step, message: safeMessage(e) },
      ...flags,
    }).catch(() => {});
    throw new DeletionStepFailed(step, e);
  };

  for (const step of DELETION_STEPS) {
    if (done.has(step.id)) continue; // persisted cursor: completed in an earlier slice
    ctx.stepId = step.id;
    try {
      await step.run(ctx);
      done.add(step.id);
      budget?.markProgress();
      for (const key of Object.keys(cursors)) if (key.startsWith(`${step.id}:`)) delete cursors[key];
    } catch (e) {
      if (e instanceof SliceExhausted || e instanceof MediaCleanupPending) return pause(step.id);
      if (e instanceof DeletionBlocked) return pause(step.id, e.reason);
      await fail(step.id, e);
    }
  }

  // Only start the Auth phase if it can finish in this invocation.
  if (budget && (budget.remaining() < AUTH_PHASE_CALLS + 2 || (budget.progressed && budget.workRemaining() < AUTH_PHASE_UNITS))) return pause('auth');

  try {
    // Re-verifies ownership and renews the lease immediately before Auth removal.
    // Durable markers, written before Auth is touched: media cleanup finished
    // (drives the late-media sweep) and finalization is pending (drives
    // recovery). Neither depends on the final bookkeeping write below.
    await updateOwnJob(store, uid, attempt, now, {
      currentStep: 'auth',
      completedSteps: progress(),
      cursors: {},
      blockedOn: null,
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

// ── Scheduled maintenance ─────────────────────────────────────────────────────
//
// Discovery reads one page per query (one subrequest each) and rotates through
// the jobs with cursors kept in CRON_STATE, so a long list cannot exhaust a run
// before any work and jobs that cannot progress (held by a live attempt,
// blocked) do not starve the ones behind them.

const CRON_STATE = 'deletionMaintenance/cron';
/** Jobs read per discovery query. */
const JOB_PAGE = 50;

interface CronCursors {
  finalizeAfter?: string;
  inProgressAfter?: string;
  failedAfter?: string;
  sweepAfter?: { path: string; mediaClearedAtMs: number };
}

/** Next cursor: the last job visited, or back to the start once a short page was read to its end. */
function nextCursor(page: StoredDoc[], visited: number): string | undefined {
  if (visited === 0) return undefined;
  if (visited >= page.length && page.length < JOB_PAGE) return undefined; // wrapped
  return page[visited - 1].path;
}

/**
 * Removes media for accounts whose deletion cleared media within the window.
 * Uploads that passed the barrier check before deletion began, but landed
 * after the media steps listed their prefixes, are cleaned up here. Keyed on
 * mediaClearedAtMs (written before Auth removal), not on job completion.
 *
 * One page per run, resumed from a cursor on (mediaClearedAtMs, path), so
 * equal timestamps are ordered by path and later jobs are always reached. A
 * job whose cleanup fails is skipped for this pass and retried when the
 * cursor wraps (every job in the 24-hour window is revisited each pass); the
 * budget running out stops the pass at the last finished job.
 */
export async function sweepRecentlyDeletedMedia(deps: DeletionDeps, windowMs = SWEEP_WINDOW_MS, cursors: CronCursors = {}): Promise<number> {
  const now = deps.now ?? Date.now;
  const work = (need = 1) => { deps.budget?.ensureWork(need); };
  work(1);
  const after = cursors.sweepAfter;
  const jobs = await deps.store.query(JOBS, [{ field: 'mediaClearedAtMs', op: 'GREATER_THAN', value: now() - windowMs }], {
    limit: JOB_PAGE,
    ...(after ? { startAfter: { path: after.path, data: { mediaClearedAtMs: after.mediaClearedAtMs } } } : {}),
  });
  let swept = 0;
  let visited = 0;
  let failed = 0;
  try {
    for (const job of jobs) {
      const uid = lastSegment(job.path);
      try {
        // Late uploads are rare: a small batch per job keeps each job one small atomic unit.
        const limit = deps.media ? Math.min(5, mediaPurgeLimit(deps.media, deps.budget)) : 0;
        if (deps.media && limit >= 1) {
          deps.budget?.useWork(mediaUnits(limit));
          await revokeOwner(deps.media.db, uid, now());
          await purgePending(deps.media.db, deps.media.kv, { owner: uid, limit });
        }
        if (deps.r2) await deps.r2.deletePrefixes(r2Prefixes(uid));
        try {
          await deps.firebaseStorage.deletePrefixes(storagePrefixes(uid), () => work(1));
          await deps.firebaseStorage.deleteObjects(legacyStorageObjects(uid), () => work(1));
        } catch (e) {
          if (!(e instanceof LegacyMediaInaccessible)) throw e; // such jobs never reach mediaClearedAtMs now
        }
        swept++;
        deps.budget?.markProgress();
      } catch (e) {
        if (e instanceof SliceExhausted) throw e; // resume at this job next run
        failed++; // retried on the next pass
      }
      visited++;
    }
  } finally {
    const path = nextCursor(jobs, visited);
    cursors.sweepAfter = path ? { path, mediaClearedAtMs: num(jobs[visited - 1].data.mediaClearedAtMs) } : undefined;
    if (failed) console.warn(JSON.stringify({ event: 'deletion_sweep_failed', count: failed }));
  }
  return swept;
}

/**
 * Claims a job pending finalization for this recovery run: a conditional write
 * on fresh state that takes the lease exactly like a user retry would. Refuses
 * when the job is completed, no longer pending, held by a live attempt, or has
 * unresolved legacy media (the plan must verify it first).
 */
async function claimForRecovery(store: DocStore, uid: string, now: () => number, attempt: Attempt, listed?: StoredDoc): Promise<boolean> {
  const path = `${JOBS}/${uid}`;
  // The listing is fresh: claiming is conditional on its updateTime, so a stale view simply loses.
  const job = listed ?? (await store.get(path));
  if (!job || job.data.pendingFinalization !== true || job.data.status === 'completed') return false;
  if (job.data.legacyMediaUnresolved === true) return false;
  if (job.data.status === 'in_progress' && num(job.data.leaseUntil) > now()) return false;
  const leaseUntil = now() + LEASE_MS;
  try {
    attempt.updateTime = firstUpdateTime(await store.commit([{
      kind: 'update',
      path,
      set: { status: 'in_progress', attemptId: attempt.id, leaseUntil, currentStep: 'finalization', lastError: null },
      serverTime: ['updatedAt'],
      updateTime: job.updateTime,
    }]));
    attempt.leaseUntil = leaseUntil;
    return true;
  } catch (e) {
    if (e instanceof StoreConflict) return false; // a retry or another cron run got there first
    throw e;
  }
}

/** Calls one recovery needs: claim (2), lookup (1), fence (2), delete (1), completion (2). */
const FINALIZE_CALLS = 8;
/** CPU units one recovery needs: claim commit (2), lookup (1), fence commit (2), delete (1), completion commit (2). */
const FINALIZE_UNITS = 8;

/**
 * Completes jobs that reached Auth removal but whose final bookkeeping never
 * landed (or whose Auth removal failed after all data and media were gone),
 * without needing the deleted user to sign in again.
 *
 * Fencing: the run first claims the job lease (claimForRecovery), so user
 * retries and other cron runs are refused while it works; it then re-verifies
 * ownership with a conditional lease renewal immediately before removing Auth,
 * and stops if the lease was lost. Jobs held by a live attempt are skipped, as
 * are jobs with unresolved legacy media (Auth is kept until it is verified absent).
 */
export async function finalizePendingDeletions(deps: DeletionDeps, cursors: CronCursors = {}): Promise<number> {
  const now = deps.now ?? Date.now;
  const { store, budget } = deps;
  budget?.ensureWork(1);
  const after = cursors.finalizeAfter;
  const pending = await store.query(JOBS, [{ field: 'pendingFinalization', op: 'EQUAL', value: true }], {
    limit: JOB_PAGE, ...(after ? { startAfter: { path: after } } : {}),
  });
  let finalized = 0;
  let visited = 0;
  for (const listed of pending) {
    if (budget && (budget.remaining() < FINALIZE_CALLS + 2 || budget.workRemaining() < FINALIZE_UNITS)) break; // next cron run continues here
    budget?.useWork(FINALIZE_UNITS);
    visited++;
    if (listed.data.legacyMediaUnresolved === true) continue; // resumeIncompleteDeletions retries the legacy step
    const uid = lastSegment(listed.path);
    const attempt: Attempt = { id: `recovery-${deps.newAttemptId?.() ?? crypto.randomUUID()}`, leaseUntil: 0 };
    if (!(await claimForRecovery(store, uid, now, attempt, listed))) continue;
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
  cursors.finalizeAfter = nextCursor(pending, visited);
  return finalized;
}

/** One page of paused/in-progress jobs, then one page of failed jobs (one subrequest each). */
async function incompleteJobPages(deps: DeletionDeps, cursors: CronCursors = {}): Promise<{ inProgress: StoredDoc[]; failed: StoredDoc[] }> {
  deps.budget?.ensureWork(2);
  const page = (status: string, after?: string) => deps.store.query(JOBS, [{ field: 'status', op: 'EQUAL', value: status }], {
    limit: JOB_PAGE, ...(after ? { startAfter: { path: after } } : {}),
  });
  return { inProgress: await page('in_progress', cursors.inProgressAfter), failed: await page('failed', cursors.failedAfter) };
}

/**
 * Continues deletions that stopped before reaching Auth removal (a failed
 * step, a lost lease, a paused or blocked slice, or a Worker request that ran
 * out of subrequests), so a started deletion completes without the user
 * retrying. Paused jobs come before failed ones so a started job is finished
 * before new ones are taken up. Runs the normal plan through deleteAccount,
 * whose lease acquisition fences it against retries and other cron runs; jobs
 * held by a live attempt are skipped. With a budget, at most one slice per job
 * and stops at the reserve; the cursors let the next run continue behind it.
 */
export async function resumeIncompleteDeletions(
  deps: DeletionDeps,
  pages?: { inProgress: StoredDoc[]; failed: StoredDoc[] },
  cursors: CronCursors = {}
): Promise<number> {
  const now = deps.now ?? Date.now;
  const { inProgress, failed } = pages ?? (await incompleteJobPages(deps, cursors));
  let resumed = 0;
  const visit = async (jobs: StoredDoc[], key: 'inProgressAfter' | 'failedAfter'): Promise<boolean> => {
    let visited = 0;
    let stopped = false;
    for (const job of jobs) {
      // finalizePendingDeletions owns these, except when legacy media must still be verified.
      const skip = (job.data.pendingFinalization === true && job.data.legacyMediaUnresolved !== true)
        || (job.data.status === 'in_progress' && num(job.data.leaseUntil) > now());
      if (!skip) {
        if (deps.budget && (deps.budget.remaining() < 12 || deps.budget.workRemaining() < 3)) { stopped = true; break; } // not enough for a useful slice
        try {
          const r = await deleteAccount({ uid: lastSegment(job.path), email: null }, deps);
          if (r.status === 'deleted') resumed++;
        } catch {
          // Recorded on the job (or another party holds it); the next run continues.
        }
      }
      visited++;
    }
    cursors[key] = nextCursor(jobs, visited);
    return !stopped;
  };
  if (await visit(inProgress, 'inProgressAfter')) await visit(failed, 'failedAfter');
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
 * complete (persistent outage, missing credentials, blocked legacy media, a
 * plan step that keeps failing). Retries alone cannot guarantee completion;
 * these need an operator (see docs/release-hardening.md, "Stalled deletion
 * runbook"). UIDs only — no email or profile data. Reads the first page of
 * each status (at most 50 jobs each) to stay within one invocation's budget.
 */
export async function listStalledDeletions(deps: DeletionDeps, stalledAfterMs = STALLED_AFTER_MS): Promise<StalledDeletion[]> {
  const { inProgress, failed } = await incompleteJobPages(deps);
  return stalledFrom([...failed, ...inProgress], (deps.now ?? Date.now)(), stalledAfterMs);
}

/** Legacy media recorded as unresolved (inaccessible store): open items, not deletions. First 100. */
export async function listUnresolvedLegacyMedia(deps: DeletionDeps): Promise<{ uid: string; store: string; reason: string }[]> {
  deps.budget?.ensureWork(1);
  const rows = await deps.store.query(LEGACY, [{ field: 'status', op: 'EQUAL', value: 'unresolved' }], { limit: PAGE });
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
 * slice each), sweep late media, then report deletions that are still stuck as
 * a structured warning (`account_deletion_stalled`) for log-based alerting.
 * With a budget every phase stops at the reserve; the discovery cursors are
 * saved (from the reserve) so the next run picks up behind this one.
 */
export type MaintenancePhase = 'finalize' | 'resume' | 'sweep';

export async function runScheduledMaintenance(deps: DeletionDeps, phases: readonly MaintenancePhase[] = ['finalize', 'resume', 'sweep']): Promise<MaintenanceResult> {
  const result: MaintenanceResult = { finalized: 0, resumed: 0, swept: 0, stalled: 0, budgetLimited: false };
  const phase = async (run: () => Promise<void>) => {
    try { await run(); } catch (e) {
      if (e instanceof SliceExhausted) { result.budgetLimited = true; return; }
      throw e;
    }
  };
  const state = await deps.store.get(CRON_STATE);
  const cursors: CronCursors = { ...((state?.data.cursors as CronCursors | undefined) ?? {}) };
  const initial = JSON.stringify(cursors);
  let seen: StoredDoc[] = [];
  try {
    if (phases.includes('finalize')) await phase(async () => { result.finalized = await finalizePendingDeletions(deps, cursors); });
    if (phases.includes('resume')) {
      await phase(async () => {
        const pages = await incompleteJobPages(deps, cursors);
        seen = [...pages.inProgress, ...pages.failed];
        result.resumed = await resumeIncompleteDeletions(deps, pages, cursors);
      });
    }
    if (phases.includes('sweep')) await phase(async () => { result.swept = await sweepRecentlyDeletedMedia(deps, SWEEP_WINDOW_MS, cursors); });
  } finally {
    if (JSON.stringify(cursors) !== initial) {
      const clean = Object.fromEntries(Object.entries(cursors).filter(([, v]) => v !== undefined));
      const set = { cursors: clean, updatedAtMs: (deps.now ?? Date.now)() };
      // Positions are hints: if another run saved first, its positions are kept.
      await deps.store.commit([state ? { kind: 'update', path: CRON_STATE, set, updateTime: state.updateTime } : { kind: 'update', path: CRON_STATE, set, mustExist: false }])
        .catch((e) => { if (!(e instanceof StoreConflict)) throw e; });
    }
  }
  const stalledJobs = stalledFrom(seen, (deps.now ?? Date.now)(), STALLED_AFTER_MS);
  result.stalled = stalledJobs.length;
  if (stalledJobs.length) {
    console.warn(JSON.stringify({ event: 'account_deletion_stalled', count: stalledJobs.length, jobs: stalledJobs }));
  }
  if (deps.budget && deps.budget.remaining() < DEFAULT_RESERVE_FOR_REPORT) result.budgetLimited = true;
  return result;
}

const DEFAULT_RESERVE_FOR_REPORT = 1;
