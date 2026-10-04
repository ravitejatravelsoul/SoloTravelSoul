/**
 * Legacy media migration → Worker KV media (D1 index). NOT RUN AUTOMATICALLY.
 *
 * Dry run (default):
 *   ADMIN_DELETION_TOKEN=… npx tsx scripts/migrateLegacyMedia.ts \
 *     --project <firebase-project> --worker <https://worker-origin> --state <file> \
 *     [--bucket <project>.firebasestorage.app] [--r2-public-base <https://pub-…r2.dev>] [--source firebase|r2|all]
 * Apply: add --apply. Uses operator application-default credentials for Firebase.
 *
 * Per object: derive the owner UID from the path; require that the Auth user
 * exists and that every Firestore reference to the object belongs to that UID;
 * download; import through POST /admin/media/import; verify the stored bytes'
 * SHA-256 and 'active' status via the digest endpoint; then swap references in
 * a transaction that only applies if the field still holds the old URL. Each
 * stage is written to the state file before the next, so a rerun resumes.
 * Source objects are never deleted here; deleting them is a separate,
 * authorized step that must be verified by a fresh listing.
 * Output: counts and stage names only (no URLs, UIDs or tokens).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

export type LegacySource = 'firebase' | 'r2';
export interface LegacyItem {
  source: LegacySource;
  path: string;
  ownerUid: string;
  purpose: 'profile' | 'post';
}
export type Stage = 'planned' | 'skipped' | 'imported' | 'verified' | 'referenced';
export interface ItemState {
  stage: Stage;
  reason?: string;
  mediaId?: string;
  newUrl?: string;
  sha256?: string;
  refs?: string[];
}

const UID = '[A-Za-z0-9]{6,128}';
/** Maps a legacy object path to its owner and purpose; null for paths that are not user media. */
export function parseLegacyPath(source: LegacySource, path: string): LegacyItem | null {
  const patterns: [RegExp, LegacyItem['purpose']][] = source === 'firebase'
    ? [[new RegExp(`^profile_images/(${UID})\\.jpg$`), 'profile'], [new RegExp(`^profile_photos/(${UID})/[^/]+$`), 'profile'],
       [new RegExp(`^trip_covers/(${UID})/[^/]+$`), 'post'], [new RegExp(`^journals/(${UID})/.+$`), 'post']]
    : [[new RegExp(`^profile_photos/(${UID})/[^/]+$`), 'profile'], [new RegExp(`^post_photos/(${UID})/[^/]+$`), 'post']];
  for (const [re, purpose] of patterns) {
    const m = path.match(re);
    if (m) return { source, path, ownerUid: m[1], purpose };
  }
  return null;
}

/** Ownership gate: the Auth user exists and every referencing document belongs to the owner. */
export function ownershipDecision(item: LegacyItem, authUserExists: boolean, refs: { path: string; ownerUid: string }[]): { ok: boolean; reason?: string } {
  if (!authUserExists) return { ok: false, reason: 'owner-auth-user-missing' };
  if (refs.some((r) => r.ownerUid !== item.ownerUid)) return { ok: false, reason: 'referenced-by-another-account' };
  return { ok: true };
}

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function loadState(file: string): Record<string, ItemState> {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, ItemState>) : {};
}
export function saveState(file: string, state: Record<string, ItemState>): void {
  writeFileSync(file, JSON.stringify(state, null, 2));
}
export const stateKey = (i: LegacyItem) => `${i.source}:${i.path}`;

async function main() {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' }, worker: { type: 'string' }, state: { type: 'string' }, bucket: { type: 'string' },
      'r2-public-base': { type: 'string' }, source: { type: 'string', default: 'firebase' }, apply: { type: 'boolean', default: false },
    },
  });
  const token = process.env.ADMIN_DELETION_TOKEN ?? '';
  if (!values.project || !values.worker || !values.state) throw new Error('Pass --project, --worker and --state explicitly.');
  if (!token) throw new Error('Set ADMIN_DELETION_TOKEN in the environment (never on the command line).');
  const { applicationDefault, initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getStorage } = await import('firebase-admin/storage');
  initializeApp({ credential: applicationDefault(), projectId: values.project });
  const db = getFirestore();
  const worker = values.worker.replace(/\/$/, '');
  const adminHeaders = { Authorization: `Bearer ${token}` };
  const state = loadState(values.state);
  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };

  // ── Inventory ──────────────────────────────────────────────────────────────
  const items: { item: LegacyItem; publicUrls: string[]; download: () => Promise<Uint8Array> }[] = [];
  if (values.source === 'firebase' || values.source === 'all') {
    const bucket = getStorage().bucket(values.bucket ?? `${values.project}.firebasestorage.app`);
    const [files] = await bucket.getFiles(); // fails on inaccessible (Spark) buckets: reported, nothing changes
    for (const f of files) {
      const item = parseLegacyPath('firebase', f.name);
      if (!item) { bump('ignored-path'); continue; }
      const encoded = encodeURIComponent(f.name);
      items.push({ item, publicUrls: [`/o/${encoded}`], download: async () => new Uint8Array((await f.download())[0]) });
    }
  }
  if (values.source === 'r2' || values.source === 'all') {
    if (!values['r2-public-base']) throw new Error('Pass --r2-public-base to match R2 references.');
    const base = values['r2-public-base'].replace(/\/$/, '');
    for (const prefix of ['profile_photos/', 'post_photos/']) {
      let cursor: string | null = null;
      do {
        const resp = await fetch(`${worker}/admin/legacy-r2?prefix=${encodeURIComponent(prefix)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: adminHeaders });
        if (!resp.ok) throw new Error(`legacy R2 listing failed: ${resp.status}`);
        const page = (await resp.json()) as { keys: { key: string }[]; cursor: string | null };
        for (const { key } of page.keys) {
          const item = parseLegacyPath('r2', key);
          if (!item) { bump('ignored-path'); continue; }
          items.push({ item, publicUrls: [`${base}/${key}`], download: async () => {
            const r = await fetch(`${worker}/admin/legacy-r2/object?key=${encodeURIComponent(key)}`, { headers: adminHeaders });
            if (!r.ok) throw new Error(`legacy R2 download failed: ${r.status}`);
            return new Uint8Array(await r.arrayBuffer());
          } });
        }
        cursor = page.cursor;
      } while (cursor);
    }
  }

  // ── Plan / migrate ─────────────────────────────────────────────────────────
  for (const { item, publicUrls, download } of items) {
    const key = stateKey(item);
    const s: ItemState = state[key] ?? { stage: 'planned' };
    if (s.stage === 'referenced' || s.stage === 'skipped') { bump(`already-${s.stage}`); continue; }

    // References: profile fields and posts/journals that contain the old URL.
    const refs: { path: string; ownerUid: string; field: string; old: string }[] = [];
    const users = await db.doc(`users/${item.ownerUid}`).get();
    for (const field of ['photoURL', 'coverPhotoURL']) {
      const v = users.get(field);
      if (typeof v === 'string' && publicUrls.some((u) => v.includes(u))) refs.push({ path: users.ref.path, ownerUid: item.ownerUid, field, old: v });
    }
    for (const coll of ['travelPosts', 'travelJournals']) {
      for (const u of publicUrls.filter((x) => x.startsWith('http'))) {
        const snap = await db.collection(coll).where('images', 'array-contains', u).get();
        for (const d of snap.docs) refs.push({ path: d.ref.path, ownerUid: String(d.get('authorId')), field: 'images', old: u });
      }
    }
    const authUser = await getAuth().getUser(item.ownerUid).then(() => true, () => false);
    const gate = ownershipDecision(item, authUser, refs);
    if (!gate.ok) { state[key] = { stage: 'skipped', reason: gate.reason }; bump(`skipped:${gate.reason}`); continue; }
    if (!values.apply) { bump(refs.length ? 'would-migrate-referenced' : 'would-migrate-unreferenced'); continue; }

    if (s.stage === 'planned') {
      const bytes = await download();
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'legacy.jpg');
      form.append('ownerUid', item.ownerUid);
      form.append('purpose', item.purpose);
      const resp = await fetch(`${worker}/admin/media/import`, { method: 'POST', headers: adminHeaders, body: form });
      if (!resp.ok) throw new Error(`import failed: ${resp.status}`);
      const out = (await resp.json()) as { id: string; url: string; sha256: string };
      Object.assign(s, { stage: 'imported', mediaId: out.id, newUrl: out.url, sha256: sha256(bytes) });
      state[key] = s; saveState(values.state, state);
    }
    if (s.stage === 'imported') {
      const resp = await fetch(`${worker}/admin/media/${s.mediaId}/digest`, { headers: adminHeaders });
      const d = (await resp.json()) as { sha256: string | null; status: string; owner: string };
      if (!resp.ok || d.sha256 !== s.sha256 || d.status !== 'active' || d.owner !== item.ownerUid) throw new Error('verification failed; state kept for rerun');
      s.stage = 'verified'; state[key] = s; saveState(values.state, state);
    }
    if (s.stage === 'verified') {
      for (const r of refs) {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(db.doc(r.path));
          if (r.field === 'images') {
            const images = (snap.get('images') as string[] | undefined) ?? [];
            if (!images.includes(r.old)) return; // changed since planning: leave it
            tx.update(snap.ref, { images: images.map((u) => (u === r.old ? s.newUrl : u)) });
          } else if (snap.get(r.field) === r.old) {
            tx.update(snap.ref, { [r.field]: s.newUrl });
            if (r.field === 'photoURL') {
              const pub = await tx.get(db.doc(`publicProfiles/${item.ownerUid}`));
              if (pub.exists && pub.get('photoURL') === r.old) tx.update(pub.ref, { photoURL: s.newUrl });
            }
          }
        });
      }
      s.stage = 'referenced'; s.refs = refs.map((r) => r.path.split('/')[0]); state[key] = s; saveState(values.state, state);
    }
    bump('migrated');
  }
  saveState(values.state, state);
  console.log(JSON.stringify({ project: values.project, mode: values.apply ? 'apply' : 'dry-run', inventoried: items.length, ...counts }));
}

if (process.argv[1] && /migrateLegacyMedia\.ts$/.test(process.argv[1])) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : 'migration failed'); process.exitCode = 1; });
}
