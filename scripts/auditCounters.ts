/**
 * Counter audit (dry run only; this script never writes). NOT RUN AUTOMATICALLY.
 *
 *   npx tsx scripts/auditCounters.ts --project <firebase-project> [--report <file>]
 *
 * Earlier rules allowed forged relationships and arbitrary counters (see
 * docs/release-hardening.md, "Coordinated rollout required"). Before enforcing
 * the new rules, compare every stored counter with the relationship documents
 * that back it:
 *   travelPosts.likeCount / travelJournals.likeCount  ← postLikes (targetType, legacy edges by target existence)
 *   travelPosts.saveCount                             ← savedPosts
 *   travelPosts.commentCount                          ← postComments with isDeleted != true
 *   postComments.replyCount                           ← postComments replies with isDeleted != true
 *   publicProfiles.followersCount / followingCount    ← follows
 *   publicTrips.memberCount / travelGroups.memberCount ← members subcollections
 * Prints totals per counter only (no IDs, names or emails). With --report, the
 * mismatching document paths and expected/stored values go to a local JSON
 * file for the operator; repairs are a separate, approved step.
 *
 * Reads every document of these collections once: on Spark each read counts
 * toward the 50,000/day free quota — run it on staging or a restored export
 * first and size the production run accordingly.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

type Tally = Map<string, number>;
const bump = (t: Tally, k: string) => t.set(k, (t.get(k) ?? 0) + 1);

export interface Mismatch { path: string; field: string; stored: number; expected: number }

/** Compares stored counters with expected tallies (missing tally = 0). Pure: tested without Firestore. */
export function compareCounters(docs: { path: string; data: Record<string, unknown> }[], field: string, expected: Tally): Mismatch[] {
  const out: Mismatch[] = [];
  for (const d of docs) {
    const raw = d.data[field];
    const stored = typeof raw === 'number' ? raw : 0;
    const want = expected.get(d.path) ?? 0;
    if (stored !== want) out.push({ path: d.path, field, stored, expected: want });
  }
  return out;
}

/** Expected like counts per target path; legacy likes without targetType count for whichever target exists (post first). */
export function likeTallies(likes: { postId?: unknown; targetType?: unknown }[], posts: Set<string>, journals: Set<string>): Tally {
  const t: Tally = new Map();
  for (const l of likes) {
    const id = typeof l.postId === 'string' ? l.postId : '';
    if (!id) continue;
    const kind = l.targetType === 'post' || l.targetType === 'journal' ? l.targetType : posts.has(id) ? 'post' : journals.has(id) ? 'journal' : null;
    if (kind === 'post' && posts.has(id)) bump(t, `travelPosts/${id}`);
    if (kind === 'journal' && journals.has(id)) bump(t, `travelJournals/${id}`);
  }
  return t;
}

async function main() {
  const { values } = parseArgs({ options: { project: { type: 'string' }, report: { type: 'string' } } });
  if (!values.project) throw new Error('Pass --project explicitly.');
  const { applicationDefault, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ credential: applicationDefault(), projectId: values.project });
  const db = getFirestore();
  const all = async (q: FirebaseFirestore.Query) => (await q.get()).docs.map((d) => ({ path: d.ref.path, data: d.data() as Record<string, unknown> }));

  const posts = await all(db.collection('travelPosts'));
  const journals = await all(db.collection('travelJournals'));
  const postIds = new Set(posts.map((p) => p.path.split('/')[1]));
  const journalIds = new Set(journals.map((p) => p.path.split('/')[1]));
  const likes = (await all(db.collection('postLikes'))).map((l) => l.data);
  const saves = (await all(db.collection('savedPosts'))).map((s) => s.data);
  const comments = await all(db.collection('postComments'));
  const follows = (await all(db.collection('follows'))).map((f) => f.data);
  const profiles = await all(db.collection('publicProfiles'));
  const trips = await all(db.collection('publicTrips'));
  const groups = await all(db.collection('travelGroups'));
  const members = await all(db.collectionGroup('members'));

  const likeT = likeTallies(likes, postIds, journalIds);
  const saveT: Tally = new Map();
  for (const s of saves) if (typeof s.postId === 'string' && postIds.has(s.postId)) bump(saveT, `travelPosts/${s.postId}`);
  const commentT: Tally = new Map();
  const replyT: Tally = new Map();
  for (const c of comments) {
    if (c.data.isDeleted === true) continue;
    if (typeof c.data.postId === 'string') bump(commentT, `travelPosts/${c.data.postId}`);
    if (typeof c.data.parentCommentId === 'string' && c.data.parentCommentId) bump(replyT, `postComments/${c.data.parentCommentId}`);
  }
  const followersT: Tally = new Map();
  const followingT: Tally = new Map();
  for (const f of follows) {
    if (typeof f.followingId === 'string') bump(followersT, `publicProfiles/${f.followingId}`);
    if (typeof f.followerId === 'string') bump(followingT, `publicProfiles/${f.followerId}`);
  }
  const memberT: Tally = new Map();
  for (const m of members) {
    const [root, id] = m.path.split('/');
    if (root === 'trips') bump(memberT, `publicTrips/${id}`);
    if (root === 'travelGroups') bump(memberT, `travelGroups/${id}`);
  }

  const mismatches = [
    ...compareCounters(posts, 'likeCount', likeT),
    ...compareCounters(journals, 'likeCount', likeT),
    ...compareCounters(posts, 'saveCount', saveT),
    ...compareCounters(posts, 'commentCount', commentT),
    ...compareCounters(comments, 'replyCount', replyT),
    ...compareCounters(profiles, 'followersCount', followersT),
    ...compareCounters(profiles, 'followingCount', followingT),
    ...compareCounters(trips, 'memberCount', memberT),
    ...compareCounters(groups, 'memberCount', memberT),
  ];
  const summary: Record<string, { mismatched: number; negative: number }> = {};
  for (const m of mismatches) {
    const key = `${m.path.split('/')[0]}.${m.field}`;
    summary[key] = summary[key] ?? { mismatched: 0, negative: 0 };
    summary[key].mismatched++;
    if (m.stored < 0) summary[key].negative++;
  }
  if (values.report) writeFileSync(values.report, JSON.stringify(mismatches, null, 2));
  console.log(JSON.stringify({ project: values.project, mode: 'dry-run (read-only)', documentsRead: posts.length + journals.length + likes.length + saves.length + comments.length + follows.length + profiles.length + trips.length + groups.length + members.length, summary }));
}

if (process.argv[1] && /auditCounters\.ts$/.test(process.argv[1])) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : 'audit failed'); process.exitCode = 1; });
}
