/**
 * cleanupCommunityDemo.ts — removes demo content created by scripts/seedCommunityDemo.ts.
 * DRY RUN BY DEFAULT. Writes only with --apply and an approved manifest.
 *
 *   Plan (read-only; writes a local manifest):
 *     npx tsx scripts/cleanupCommunityDemo.ts --project <firebase-project> --plan <manifest.json> [--protect <uids.json>]
 *   Apply (deletes exactly the manifest's items, after re-checking them):
 *     npx tsx scripts/cleanupCommunityDemo.ts --project <firebase-project> --apply --manifest <manifest.json> --approve <sha256 of manifest>
 *
 * Rules:
 * - Only documents with `demo == true` are ever deleted; there is no fallback for unmarked documents.
 * - A demo root document is skipped together with all of its children when any child is not
 *   `demo == true`, when a child has its own subcollections, or when the root or a child references a
 *   protected account. Skipping the whole root means no retained child is ever orphaned.
 * - Protected accounts come from a JSON file outside the repository: {"uids": ["..."]}. A document
 *   references an account when any string value, array element or map key equals its uid.
 * - Apply refuses unless --project matches the manifest and --approve equals the SHA-256 of the
 *   manifest file. Before deleting anything it re-reads every item (it must exist with the same
 *   update time) and every parent's children (the set must be unchanged); any difference aborts
 *   with nothing deleted. Deletes then run children first, each with a lastUpdateTime precondition.
 *
 * Credentials: operator application-default credentials, or the Firestore emulator when
 * FIRESTORE_EMULATOR_HOST is set. Output: counts only (paths stay in the local manifest).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';

export const DEMO_COLLECTIONS = [
  'publicProfiles', 'publicTrips', 'travelGroups', 'activityFeed', 'nearbyTravelers',
  'tripJoinRequests', 'groupJoinRequests', 'direct_chats', 'groups',
] as const;

export interface ManifestItem { path: string; updateTime: string; parent: string | null }
export interface Manifest {
  version: 1;
  project: string;
  createdAt: string;
  protectedAccounts: number;
  /** Roots and children to delete; children are listed with their root as `parent`. */
  items: ManifestItem[];
  /** For every root in `items`: the exact child paths present at planning time. */
  children: Record<string, string[]>;
  skipped: { root: string; reason: string; childCount: number }[];
  counts: { roots: Record<string, number>; subcollections: Record<string, number>; skippedByReason: Record<string, number> };
}

const isDemo = (s: DocumentSnapshot) => s.get('demo') === true;
/** Exact update time (seconds.nanoseconds); ISO strings would lose sub-millisecond precision. */
const stamp = (s: DocumentSnapshot) => `${s.updateTime!.seconds}.${String(s.updateTime!.nanoseconds).padStart(9, '0')}`;

/** True when any string value, array element or map key (recursively) equals a protected uid. */
export function referencesAny(value: unknown, uids: Set<string>): boolean {
  if (uids.size === 0 || value == null) return false;
  if (typeof value === 'string') return uids.has(value);
  if (Array.isArray(value)) return value.some((v) => referencesAny(v, uids));
  if (typeof value === 'object') {
    if (typeof (value as { toDate?: unknown }).toDate === 'function') return false; // Timestamp
    if ((value as object).constructor?.name === 'DocumentReference') {
      const p = (value as { path?: unknown }).path;
      return typeof p === 'string' && p.split('/').some((seg) => uids.has(seg));
    }
    return Object.entries(value as Record<string, unknown>).some(([k, v]) => uids.has(k) || referencesAny(v, uids));
  }
  return false;
}

export async function plan(db: Firestore, project: string, protectedUids: string[], collections: readonly string[] = DEMO_COLLECTIONS): Promise<Manifest> {
  const uids = new Set(protectedUids);
  const m: Manifest = { version: 1, project, createdAt: new Date().toISOString(), protectedAccounts: uids.size, items: [], children: {}, skipped: [],
    counts: { roots: {}, subcollections: {}, skippedByReason: {} } };
  const skip = (root: string, reason: string, childCount: number) => {
    m.skipped.push({ root, reason, childCount });
    m.counts.skippedByReason[reason] = (m.counts.skippedByReason[reason] ?? 0) + 1;
  };
  for (const col of collections) {
    const roots = await db.collection(col).where('demo', '==', true).get();
    for (const root of roots.docs) {
      const kids: DocumentSnapshot[] = [];
      let reason: string | null = referencesAny(root.data(), uids) || uids.has(root.id) ? 'references a protected account' : null;
      for (const sub of await root.ref.listCollections()) {
        for (const child of (await sub.get()).docs) {
          kids.push(child);
          if (reason) continue;
          if (!isDemo(child)) reason = `non-demo child in ${sub.id}`;
          else if ((await child.ref.listCollections()).length > 0) reason = `nested subcollection under ${sub.id}`;
          else if (referencesAny(child.data(), uids) || uids.has(child.id)) reason = 'references a protected account';
        }
      }
      if (reason) { skip(root.ref.path, reason, kids.length); continue; }
      m.children[root.ref.path] = kids.map((k) => k.ref.path).sort();
      for (const k of kids) {
        m.items.push({ path: k.ref.path, updateTime: stamp(k), parent: root.ref.path });
        const key = `${col}/*/${k.ref.parent.id}`;
        m.counts.subcollections[key] = (m.counts.subcollections[key] ?? 0) + 1;
      }
      m.items.push({ path: root.ref.path, updateTime: stamp(root), parent: null });
      m.counts.roots[col] = (m.counts.roots[col] ?? 0) + 1;
    }
  }
  return m;
}

export const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

/** Re-checks every item and every root's child set; returns the problems found (empty = unchanged). */
export async function verifyUnchanged(db: Firestore, m: Manifest): Promise<string[]> {
  const problems: string[] = [];
  for (const it of m.items) {
    const s = await db.doc(it.path).get();
    if (!s.exists) problems.push(`missing: ${it.path}`);
    else if (stamp(s) !== it.updateTime) problems.push(`changed: ${it.path}`);
    else if (!isDemo(s)) problems.push(`no longer demo: ${it.path}`);
  }
  for (const [root, expected] of Object.entries(m.children)) {
    const now: string[] = [];
    for (const sub of await db.doc(root).listCollections()) for (const c of (await sub.get()).docs) now.push(c.ref.path);
    now.sort();
    if (now.join('\n') !== expected.join('\n')) problems.push(`children changed: ${root}`);
  }
  return problems;
}

export async function apply(db: Firestore, m: Manifest): Promise<{ deleted: number }> {
  const problems = await verifyUnchanged(db, m);
  if (problems.length) throw Object.assign(new Error(`aborted, nothing deleted: ${problems.length} record(s) changed since planning`), { problems });
  const { Timestamp } = await import('firebase-admin/firestore');
  const ordered = [...m.items.filter((i) => i.parent), ...m.items.filter((i) => !i.parent)]; // children first
  let deleted = 0;
  for (let i = 0; i < ordered.length; i += 400) {
    const batch = db.batch();
    for (const it of ordered.slice(i, i + 400)) {
      const [sec, ns] = it.updateTime.split('.').map(Number);
      batch.delete(db.doc(it.path), { lastUpdateTime: new Timestamp(sec, ns) });
    }
    await batch.commit(); // a precondition failure rejects the whole batch
    deleted += Math.min(400, ordered.length - i);
  }
  return { deleted };
}

async function main() {
  const { values } = parseArgs({ options: {
    project: { type: 'string' }, plan: { type: 'string' }, protect: { type: 'string' },
    apply: { type: 'boolean', default: false }, manifest: { type: 'string' }, approve: { type: 'string' },
  } });
  if (!values.project) throw new Error('Pass --project explicitly.');
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: values.project } : { credential: applicationDefault(), projectId: values.project });
  const db = getFirestore();

  if (!values.apply) {
    if (!values.plan) throw new Error('Dry run: pass --plan <manifest.json> (written locally; nothing is deleted).');
    const uids: string[] = values.protect ? (JSON.parse(readFileSync(values.protect, 'utf8')).uids ?? []) : [];
    const m = await plan(db, values.project, uids);
    const text = JSON.stringify(m, null, 2);
    writeFileSync(values.plan, text, { mode: 0o600 });
    console.log(JSON.stringify({ mode: 'dry-run (nothing deleted)', project: m.project, protectedAccounts: m.protectedAccounts,
      wouldDelete: { roots: m.counts.roots, subcollections: m.counts.subcollections, total: m.items.length },
      skippedRoots: m.counts.skippedByReason, manifestSha256: sha256(text) }));
    return;
  }

  if (!values.manifest || !values.approve) throw new Error('Apply needs --manifest <file> and --approve <sha256 of that file>.');
  const bytes = readFileSync(values.manifest);
  if (sha256(bytes) !== values.approve) throw new Error('Refused: --approve does not match the manifest SHA-256.');
  const m = JSON.parse(bytes.toString('utf8')) as Manifest;
  if (m.version !== 1 || m.project !== values.project) throw new Error('Refused: --project does not match the manifest.');
  const r = await apply(db, m);
  console.log(JSON.stringify({ mode: 'apply', project: m.project, deleted: r.deleted }));
}

if (process.argv[1] && /cleanupCommunityDemo\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(`[cleanup] ${String((e as Error).message ?? e)}`);
    for (const p of ((e as { problems?: string[] }).problems ?? []).slice(0, 20)) console.error(`  - ${p.replace(/\/[A-Za-z0-9]{20,}/g, '/<id>')}`);
    process.exit(1);
  });
}
