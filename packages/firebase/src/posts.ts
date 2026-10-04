import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  runTransaction,
  writeBatch,
  increment,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firestore';
import { auth } from './auth';
import type {
  TravelPost,
  PostLike,
  PostComment,
  SavedPost,
  TravelJournal,
  Follow,
  FollowCounts,
  TravelerReputation,
  BadgeType,
  PostType,
  PostVisibility,
} from '@solotravelsoul/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOfflineError(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === 'unavailable' || code === 'failed-precondition';
}

function tsToDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function dateToTs(d: Date): Timestamp {
  return Timestamp.fromDate(d);
}

// Composite doc ID helpers
function likeId(postId: string, userId: string): string {
  return `${postId}___${userId}`;
}
function followId(followerId: string, followingId: string): string {
  return `${followerId}___${followingId}`;
}
function savedPostId(userId: string, postId: string): string {
  return `${userId}___${postId}`;
}

// ── Travel Posts ──────────────────────────────────────────────────────────────

function postFromDoc(id: string, d: DocumentData): TravelPost {
  return {
    postId: id,
    authorId: (d.authorId as string) ?? '',
    authorName: (d.authorName as string) ?? '',
    authorPhoto: (d.authorPhoto as string | null) ?? null,
    caption: (d.caption as string) ?? '',
    body: (d.body as string) ?? '',
    location: (d.location as string) ?? '',
    country: (d.country as string) ?? '',
    tripId: (d.tripId as string | null) ?? null,
    images: (d.images as string[]) ?? [],
    hashtags: (d.hashtags as string[]) ?? [],
    postType: (d.postType as PostType) ?? 'photo',
    likeCount: (d.likeCount as number) ?? 0,
    commentCount: (d.commentCount as number) ?? 0,
    saveCount: (d.saveCount as number) ?? 0,
    visibility: (d.visibility as PostVisibility) ?? 'public',
    isArchived: (d.isArchived as boolean) ?? false,
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  };
}

export async function createPost(
  post: Omit<TravelPost, 'postId' | 'likeCount' | 'commentCount' | 'saveCount' | 'isArchived' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = doc(collection(db, 'travelPosts'));
  await setDoc(ref, {
    ...post,
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    isArchived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Increment author's postsCount in publicProfiles
  await updateDoc(doc(db, 'publicProfiles', post.authorId), {
    postsCount: increment(1),
  }).catch(() => {});

  return ref.id;
}

export async function updatePost(
  postId: string,
  authorId: string,
  updates: Partial<Pick<TravelPost, 'caption' | 'body' | 'location' | 'country' | 'hashtags' | 'visibility' | 'images'>>
): Promise<void> {
  await updateDoc(doc(db, 'travelPosts', postId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePost(postId: string, authorId: string): Promise<void> {
  await updateDoc(doc(db, 'travelPosts', postId), {
    isArchived: true,
    updatedAt: serverTimestamp(),
  });
  // Decrement author's postsCount
  await updateDoc(doc(db, 'publicProfiles', authorId), {
    postsCount: increment(-1),
  }).catch(() => {});
}

export async function getPost(postId: string): Promise<TravelPost | null> {
  try {
    const snap = await getDoc(doc(db, 'travelPosts', postId));
    if (!snap.exists()) return null;
    return postFromDoc(snap.id, snap.data());
  } catch (err) {
    if (isOfflineError(err)) return null;
    throw err;
  }
}

export function subscribePostsByAuthor(
  authorId: string,
  pageLimit: number,
  callback: (posts: TravelPost[], last: QueryDocumentSnapshot | null) => void
): () => void {
  let q = query(
    collection(db, 'travelPosts'),
    where('authorId', '==', authorId),
    where('isArchived', '==', false),
    orderBy('createdAt', 'desc'),
    limit(pageLimit)
  );
  if (authorId !== auth.currentUser?.uid) q = query(q, where('visibility', '==', 'public'));
  return onSnapshot(q, (snap) => {
    const posts = snap.docs.map((d) => postFromDoc(d.id, d.data()));
    callback(posts, (snap.docs[snap.docs.length - 1] ?? null) as QueryDocumentSnapshot | null);
  }, (err) => {
    if (err.code !== 'permission-denied') {
      console.error('[Posts] subscribePostsByAuthor error:', err.code, err.message);
    }
  });
}

export function subscribeExplorePosts(
  pageLimit: number,
  lastDoc: QueryDocumentSnapshot | null,
  callback: (posts: TravelPost[], last: QueryDocumentSnapshot | null) => void
): () => void {
  let q = query(
    collection(db, 'travelPosts'),
    where('visibility', '==', 'public'),
    where('isArchived', '==', false),
    orderBy('createdAt', 'desc'),
    limit(pageLimit)
  );
  if (lastDoc) q = query(q, startAfter(lastDoc));

  return onSnapshot(q, (snap) => {
    const posts = snap.docs.map((d) => postFromDoc(d.id, d.data()));
    callback(posts, (snap.docs[snap.docs.length - 1] ?? null) as QueryDocumentSnapshot | null);
  }, (err) => {
    if (err.code !== 'permission-denied') {
      console.error('[Posts] subscribeExplorePosts error:', err.code, err.message);
    }
  });
}

export async function getPostsByCountry(country: string, pageLimit = 10): Promise<TravelPost[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'travelPosts'),
        where('country', '==', country),
        where('visibility', '==', 'public'),
        where('isArchived', '==', false),
        orderBy('createdAt', 'desc'),
        limit(pageLimit)
      )
    );
    return snap.docs.map((d) => postFromDoc(d.id, d.data()));
  } catch (err) {
    if (isOfflineError(err)) return [];
    throw err;
  }
}

export async function getTrendingPosts(pageLimit = 20): Promise<TravelPost[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'travelPosts'),
        where('visibility', '==', 'public'),
        where('isArchived', '==', false),
        orderBy('likeCount', 'desc'),
        limit(pageLimit)
      )
    );
    return snap.docs.map((d) => postFromDoc(d.id, d.data()));
  } catch (err) {
    if (isOfflineError(err)) return [];
    throw err;
  }
}

export async function getPostsByType(type: PostType, pageLimit = 20): Promise<TravelPost[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'travelPosts'),
        where('postType', '==', type),
        where('visibility', '==', 'public'),
        where('isArchived', '==', false),
        orderBy('createdAt', 'desc'),
        limit(pageLimit)
      )
    );
    return snap.docs.map((d) => postFromDoc(d.id, d.data()));
  } catch (err) {
    if (isOfflineError(err)) return [];
    throw err;
  }
}

// Feed: posts from a list of followed user IDs (client-side follow graph query)
export async function getPostsFromUsers(
  authorIds: string[],
  pageLimit = 50
): Promise<TravelPost[]> {
  if (authorIds.length === 0) return [];
  // Firestore 'in' supports max 30 items; chunk if needed
  const chunks: string[][] = [];
  for (let i = 0; i < authorIds.length; i += 30) {
    chunks.push(authorIds.slice(i, i + 30));
  }
  try {
    const results = await Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(
            collection(db, 'travelPosts'),
            where('authorId', 'in', chunk),
            where('visibility', '==', 'public'),
            where('isArchived', '==', false),
            orderBy('createdAt', 'desc'),
            limit(pageLimit)
          )
        )
      )
    );
    const all = results.flatMap((snap) =>
      snap.docs.map((d) => postFromDoc(d.id, d.data()))
    );
    // Merge and re-sort by createdAt desc, deduplicate
    const seen = new Set<string>();
    return all
      .filter((p) => { if (seen.has(p.postId)) return false; seen.add(p.postId); return true; })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, pageLimit);
  } catch (err) {
    if (isOfflineError(err)) return [];
    throw err;
  }
}

// ── Post Likes ────────────────────────────────────────────────────────────────

export async function likePost(postId: string, userId: string): Promise<void> {
  const id = likeId(postId, userId);
  await runTransaction(db, async (tx) => {
    const likeRef = doc(db, 'postLikes', id);
    const likeSnap = await tx.get(likeRef);
    if (likeSnap.exists()) return; // already liked
    tx.set(likeRef, { postId, userId, targetType: 'post', createdAt: serverTimestamp() });
    tx.update(doc(db, 'travelPosts', postId), { likeCount: increment(1) });
  });
}

export async function unlikePost(postId: string, userId: string): Promise<void> {
  const id = likeId(postId, userId);
  await runTransaction(db, async (tx) => {
    const likeRef = doc(db, 'postLikes', id);
    const likeSnap = await tx.get(likeRef);
    if (!likeSnap.exists()) return; // not liked
    tx.delete(likeRef);
    tx.update(doc(db, 'travelPosts', postId), { likeCount: increment(-1) });
  });
}

export async function isPostLiked(postId: string, userId: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'postLikes', likeId(postId, userId)));
    return snap.exists();
  } catch {
    return false;
  }
}

// ── Post Comments ─────────────────────────────────────────────────────────────

function commentFromDoc(id: string, d: DocumentData): PostComment {
  return {
    commentId: id,
    postId: (d.postId as string) ?? '',
    authorId: (d.authorId as string) ?? '',
    authorName: (d.authorName as string) ?? '',
    authorPhoto: (d.authorPhoto as string | null) ?? null,
    text: (d.text as string) ?? '',
    parentCommentId: (d.parentCommentId as string | null) ?? null,
    replyCount: (d.replyCount as number) ?? 0,
    isDeleted: (d.isDeleted as boolean) ?? false,
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  };
}

export async function addComment(
  comment: Omit<PostComment, 'commentId' | 'replyCount' | 'isDeleted' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = doc(collection(db, 'postComments'));
  const batch = writeBatch(db);

  batch.set(ref, {
    ...comment,
    replyCount: 0,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Increment post commentCount
  batch.update(doc(db, 'travelPosts', comment.postId), {
    commentCount: increment(1),
    lastCommentId: ref.id,
    updatedAt: serverTimestamp(),
  });

  // Increment parent replyCount if this is a reply
  if (comment.parentCommentId) {
    batch.update(doc(db, 'postComments', comment.parentCommentId), {
      replyCount: increment(1),
      lastReplyId: ref.id,
    });
  }

  await batch.commit();
  return ref.id;
}

export async function editComment(commentId: string, text: string): Promise<void> {
  await updateDoc(doc(db, 'postComments', commentId), {
    text,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteComment(commentId: string, postId: string, parentCommentId: string | null): Promise<void> {
  const commentRef = doc(db, 'postComments', commentId);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(commentRef);
    if (!existing.exists() || existing.data().isDeleted) return;
    if (existing.data().postId !== postId || existing.data().parentCommentId !== parentCommentId) throw new Error('Comment target mismatch');
    tx.update(commentRef, { isDeleted: true, text: '', updatedAt: serverTimestamp() });
    tx.update(doc(db, 'travelPosts', postId), { commentCount: increment(-1), lastCommentId: commentId, updatedAt: serverTimestamp() });
    if (parentCommentId) tx.update(doc(db, 'postComments', parentCommentId), { replyCount: increment(-1), lastReplyId: commentId });
  });
}

export function subscribeComments(
  postId: string,
  pageLimit: number,
  callback: (comments: PostComment[]) => void
): () => void {
  const q = query(
    collection(db, 'postComments'),
    where('postId', '==', postId),
    where('parentCommentId', '==', null),
    orderBy('createdAt', 'asc'),
    limit(pageLimit)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => commentFromDoc(d.id, d.data())));
  }, (err) => {
    if (err.code !== 'permission-denied') {
      console.error('[Posts] subscribeComments error:', err.code, err.message);
    }
  });
}

export function subscribeReplies(
  parentCommentId: string,
  callback: (replies: PostComment[]) => void
): () => void {
  let active = true;
  let unsubscribe: (() => void) | undefined;
  // Include postId so rules can prove every result belongs to a readable post.
  getDoc(doc(db, 'postComments', parentCommentId)).then((parent) => {
    if (!active) return;
    if (!parent.exists()) { callback([]); return; }
    const q = query(collection(db, 'postComments'),
      where('postId', '==', parent.data().postId),
      where('parentCommentId', '==', parentCommentId),
      orderBy('createdAt', 'asc'), limit(50));
    unsubscribe = onSnapshot(q,
      (snap) => callback(snap.docs.map((d) => commentFromDoc(d.id, d.data()))),
      () => callback([]));
  }).catch(() => { if (active) callback([]); });
  return () => { active = false; unsubscribe?.(); };
}

// ── Saved Posts ───────────────────────────────────────────────────────────────

function savedPostFromDoc(id: string, d: DocumentData): SavedPost {
  return {
    postId: (d.postId as string) ?? '',
    userId: (d.userId as string) ?? '',
    collectionName: (d.collectionName as string) ?? 'Saved',
    savedAt: tsToDate(d.savedAt),
  };
}

export async function savePost(
  postId: string,
  userId: string,
  collectionName = 'Saved'
): Promise<void> {
  const savedRef = doc(db, 'savedPosts', savedPostId(userId, postId));
  await runTransaction(db, async (tx) => {
    const saved = await tx.get(savedRef);
    if (saved.exists()) return;
    tx.set(savedRef, { postId, userId, collectionName, savedAt: serverTimestamp() });
    tx.update(doc(db, 'travelPosts', postId), { saveCount: increment(1) });
  });
}

export async function unsavePost(postId: string, userId: string): Promise<void> {
  const savedRef = doc(db, 'savedPosts', savedPostId(userId, postId));
  await runTransaction(db, async (tx) => {
    const saved = await tx.get(savedRef);
    if (!saved.exists()) return;
    tx.delete(savedRef);
    tx.update(doc(db, 'travelPosts', postId), { saveCount: increment(-1) });
  });
}

export async function isSavedPost(postId: string, userId: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'savedPosts', savedPostId(userId, postId)));
    return snap.exists();
  } catch {
    return false;
  }
}

export function subscribeSavedPosts(
  userId: string,
  pageLimit: number,
  callback: (posts: SavedPost[], last: QueryDocumentSnapshot | null) => void
): () => void {
  const q = query(
    collection(db, 'savedPosts'),
    where('userId', '==', userId),
    orderBy('savedAt', 'desc'),
    limit(pageLimit)
  );
  return onSnapshot(q, (snap) => {
    const posts = snap.docs.map((d) => savedPostFromDoc(d.id, d.data()));
    callback(posts, (snap.docs[snap.docs.length - 1] ?? null) as QueryDocumentSnapshot | null);
  }, (err) => {
    if (err.code !== 'permission-denied') {
      console.error('[Posts] subscribeSavedPosts error:', err.code, err.message);
    }
  });
}

// ── Travel Journals ───────────────────────────────────────────────────────────

function journalFromDoc(id: string, d: DocumentData): TravelJournal {
  return {
    journalId: id,
    authorId: (d.authorId as string) ?? '',
    authorName: (d.authorName as string) ?? '',
    authorPhoto: (d.authorPhoto as string | null) ?? null,
    title: (d.title as string) ?? '',
    subtitle: (d.subtitle as string) ?? '',
    coverImageURL: (d.coverImageURL as string | null) ?? null,
    body: (d.body as string) ?? '',
    images: (d.images as string[]) ?? [],
    location: (d.location as string) ?? '',
    country: (d.country as string) ?? '',
    tripId: (d.tripId as string | null) ?? null,
    hashtags: (d.hashtags as string[]) ?? [],
    readTimeMinutes: (d.readTimeMinutes as number) ?? 1,
    likeCount: (d.likeCount as number) ?? 0,
    commentCount: (d.commentCount as number) ?? 0,
    saveCount: (d.saveCount as number) ?? 0,
    visibility: (d.visibility as 'public' | 'private') ?? 'public',
    isArchived: (d.isArchived as boolean) ?? false,
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  };
}

export async function createJournal(
  journal: Omit<TravelJournal, 'journalId' | 'likeCount' | 'commentCount' | 'saveCount' | 'isArchived' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = doc(collection(db, 'travelJournals'));
  await setDoc(ref, {
    ...journal,
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    isArchived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Increment journalsCount on publicProfiles
  await updateDoc(doc(db, 'publicProfiles', journal.authorId), {
    journalsCount: increment(1),
  }).catch(() => {});

  return ref.id;
}

export async function updateJournal(
  journalId: string,
  updates: Partial<Pick<TravelJournal, 'title' | 'subtitle' | 'body' | 'coverImageURL' | 'images' | 'location' | 'country' | 'hashtags' | 'visibility' | 'readTimeMinutes'>>
): Promise<void> {
  await updateDoc(doc(db, 'travelJournals', journalId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteJournal(journalId: string, authorId: string): Promise<void> {
  await updateDoc(doc(db, 'travelJournals', journalId), {
    isArchived: true,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'publicProfiles', authorId), {
    journalsCount: increment(-1),
  }).catch(() => {});
}

export async function getJournal(journalId: string): Promise<TravelJournal | null> {
  try {
    const snap = await getDoc(doc(db, 'travelJournals', journalId));
    if (!snap.exists()) return null;
    return journalFromDoc(snap.id, snap.data());
  } catch (err) {
    if (isOfflineError(err)) return null;
    throw err;
  }
}

export function subscribeJournalsByAuthor(
  authorId: string,
  pageLimit: number,
  callback: (journals: TravelJournal[], last: QueryDocumentSnapshot | null) => void
): () => void {
  let q = query(
    collection(db, 'travelJournals'),
    where('authorId', '==', authorId),
    where('isArchived', '==', false),
    orderBy('createdAt', 'desc'),
    limit(pageLimit)
  );
  if (authorId !== auth.currentUser?.uid) q = query(q, where('visibility', '==', 'public'));
  return onSnapshot(q, (snap) => {
    const journals = snap.docs.map((d) => journalFromDoc(d.id, d.data()));
    callback(journals, (snap.docs[snap.docs.length - 1] ?? null) as QueryDocumentSnapshot | null);
  }, (err) => {
    if (err.code !== 'permission-denied') {
      console.error('[Posts] subscribeJournalsByAuthor error:', err.code, err.message);
    }
  });
}

export async function subscribeExploreJournals(
  pageLimit: number,
  callback: (journals: TravelJournal[]) => void
): Promise<() => void> {
  const q = query(
    collection(db, 'travelJournals'),
    where('visibility', '==', 'public'),
    where('isArchived', '==', false),
    orderBy('likeCount', 'desc'),
    limit(pageLimit)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => journalFromDoc(d.id, d.data())));
  }, (err) => {
    if (err.code !== 'permission-denied') {
      console.error('[Posts] subscribeExploreJournals error:', err.code, err.message);
    }
  });
}

export async function likeJournal(journalId: string, userId: string): Promise<void> {
  const id = likeId(journalId, userId);
  await runTransaction(db, async (tx) => {
    const likeRef = doc(db, 'postLikes', id);
    const likeSnap = await tx.get(likeRef);
    if (likeSnap.exists()) return;
    tx.set(likeRef, { postId: journalId, userId, targetType: 'journal', createdAt: serverTimestamp() });
    tx.update(doc(db, 'travelJournals', journalId), { likeCount: increment(1) });
  });
}

export async function unlikeJournal(journalId: string, userId: string): Promise<void> {
  const id = likeId(journalId, userId);
  await runTransaction(db, async (tx) => {
    const likeRef = doc(db, 'postLikes', id);
    const likeSnap = await tx.get(likeRef);
    if (!likeSnap.exists()) return;
    tx.delete(likeRef);
    tx.update(doc(db, 'travelJournals', journalId), { likeCount: increment(-1) });
  });
}

export async function isJournalLiked(journalId: string, userId: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'postLikes', likeId(journalId, userId)));
    return snap.exists();
  } catch {
    return false;
  }
}

// ── Follow System ─────────────────────────────────────────────────────────────

function followFromDoc(id: string, d: DocumentData): Follow {
  return {
    followerId: (d.followerId as string) ?? '',
    followingId: (d.followingId as string) ?? '',
    createdAt: tsToDate(d.createdAt),
  };
}

export async function followUser(followerId: string, followingId: string): Promise<void> {
  if (followerId === followingId) return;
  const ownProfile = doc(db, 'publicProfiles', followerId);
  await runTransaction(db, async (tx) => {
    const own = await tx.get(ownProfile);
    if (!own.exists()) tx.set(ownProfile, { uid: followerId, profileVisibility: 'private', followersCount: 0, followingCount: 0 });
  });
  const edge = doc(db, 'follows', followId(followerId, followingId));
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(edge);
    if (existing.exists()) return;
    tx.set(edge, { followerId, followingId, createdAt: serverTimestamp() });
    tx.update(doc(db, 'publicProfiles', followingId), { followersCount: increment(1) });
    tx.update(doc(db, 'publicProfiles', followerId), { followingCount: increment(1), lastFollowingId: followingId });
  });
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  const edge = doc(db, 'follows', followId(followerId, followingId));
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(edge);
    if (!existing.exists()) return;
    tx.delete(edge);
    tx.update(doc(db, 'publicProfiles', followingId), { followersCount: increment(-1) });
    tx.update(doc(db, 'publicProfiles', followerId), { followingCount: increment(-1), lastFollowingId: followingId });
  });
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'follows', followId(followerId, followingId)));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function getFollowCounts(uid: string): Promise<FollowCounts> {
  try {
    const [followersSnap, followingSnap] = await Promise.all([
      getDocs(query(collection(db, 'follows'), where('followingId', '==', uid))),
      getDocs(query(collection(db, 'follows'), where('followerId', '==', uid))),
    ]);
    return {
      followersCount: followersSnap.size,
      followingCount: followingSnap.size,
    };
  } catch {
    return { followersCount: 0, followingCount: 0 };
  }
}

export function subscribeFollowers(
  uid: string,
  pageLimit: number,
  callback: (follows: Follow[]) => void
): () => void {
  const q = query(
    collection(db, 'follows'),
    where('followingId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(pageLimit)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => followFromDoc(d.id, d.data())));
  }, (err) => {
    if (err.code !== 'permission-denied') {
      console.error('[Posts] subscribeFollowers error:', err.code, err.message);
    }
  });
}

export function subscribeFollowing(
  uid: string,
  pageLimit: number,
  callback: (follows: Follow[]) => void
): () => void {
  const q = query(
    collection(db, 'follows'),
    where('followerId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(pageLimit)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => followFromDoc(d.id, d.data())));
  }, (err) => {
    if (err.code !== 'permission-denied') {
      console.error('[Posts] subscribeFollowing error:', err.code, err.message);
    }
  });
}

// Returns the list of UIDs that `uid` is following (used for feed building)
export async function getFollowingIds(uid: string): Promise<string[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'follows'), where('followerId', '==', uid), limit(500))
    );
    return snap.docs.map((d) => d.data().followingId as string);
  } catch {
    return [];
  }
}

// ── Traveler Reputation ───────────────────────────────────────────────────────

function reputationFromDoc(uid: string, d: DocumentData): TravelerReputation {
  return {
    uid,
    badges: (d.badges as BadgeType[]) ?? [],
    score: (d.score as number) ?? 0,
    tripsCompleted: (d.tripsCompleted as number) ?? 0,
    countriesVisited: (d.countriesVisited as number) ?? 0,
    groupsJoined: (d.groupsJoined as number) ?? 0,
    postsPublished: (d.postsPublished as number) ?? 0,
    journalsPublished: (d.journalsPublished as number) ?? 0,
    updatedAt: tsToDate(d.updatedAt),
  };
}

export async function getReputation(uid: string): Promise<TravelerReputation | null> {
  try {
    const snap = await getDoc(doc(db, 'travelerReputation', uid));
    if (!snap.exists()) return null;
    return reputationFromDoc(uid, snap.data());
  } catch (err) {
    if (isOfflineError(err)) return null;
    throw err;
  }
}

export async function upsertReputation(rep: TravelerReputation): Promise<void> {
  await setDoc(doc(db, 'travelerReputation', rep.uid), {
    ...rep,
    updatedAt: serverTimestamp(),
  });
  // Mirror badges onto publicProfiles for quick reads
  await updateDoc(doc(db, 'publicProfiles', rep.uid), {
    badges: rep.badges,
  }).catch(() => {});
}

// ── Firestore notification helpers for social events ─────────────────────────
// These write to the existing `notifications/{id}` collection.
// The caller is responsible for assembling the notification data.

export async function createSocialNotification(notification: {
  userId: string;          // recipient
  type: 'liked_post' | 'commented_post' | 'replied_comment' | 'followed_you' | 'saved_post';
  actorId: string;
  actorName: string;
  actorPhoto: string | null;
  targetId: string;        // postId / journalId / commentId / followerId
  targetTitle?: string;    // post caption snippet or journal title
}): Promise<void> {
  const ref = doc(collection(db, 'notifications'));
  await setDoc(ref, {
    ...notification,
    isRead: false,
    createdAt: serverTimestamp(),
  });
}
