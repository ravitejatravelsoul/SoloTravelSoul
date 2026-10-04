/** Backfill exact-address aliases from Firebase Auth, never from untrusted UID fields.
 * Dry run: npx tsx scripts/backfillEmailLookup.ts --project <project-id>
 * Apply: add --apply. Uses application-default credentials; never logs addresses.
 */
import { parseArgs } from 'node:util';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const { values } = parseArgs({ options: { project: { type: 'string' }, apply: { type: 'boolean', default: false } } });
if (!values.project) throw new Error('Pass --project explicitly. No default production project is selected.');
initializeApp({ credential: applicationDefault(), projectId: values.project });
const db = getFirestore();
const auth = getAuth();
const aliasId = (email: string) => email.trim().toLowerCase().replace(/%/g, '%25').replace(/\//g, '%2F');

async function run() {
  let pageToken: string | undefined;
  let candidates = 0;
  let skipped = 0;
  let conflicts = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (!user.email || user.disabled) { skipped++; continue; }
      const email = user.email.trim().toLowerCase();
      const ref = db.collection('userLookupByEmail').doc(aliasId(email));
      const [existing, lookup] = await Promise.all([ref.get(), db.collection('userLookup').doc(user.uid).get()]);
      if (existing.exists && existing.data()?.uid !== user.uid) { conflicts++; continue; }
      const previous = lookup.data();
      const displayName = user.displayName ?? previous?.displayName ?? 'Traveler';
      const data = { uid: user.uid, email, displayName, initials: previous?.initials ?? displayName.slice(0, 1).toUpperCase(), photoURL: user.photoURL ?? previous?.photoURL ?? null };
      candidates++;
      if (values.apply) {
        // Recheck ownership at write time; concurrent sign-ins cannot be overwritten.
        await db.runTransaction(async tx => {
          const current = await tx.get(ref);
          if (current.exists && current.data()?.uid !== user.uid) throw new Error('Alias ownership conflict; stopped without overwriting it.');
          tx.set(ref, data);
        });
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(JSON.stringify({ project: values.project, mode: values.apply ? 'apply' : 'dry-run', candidates, skipped, conflicts }));
  if (conflicts) process.exitCode = 1;
}
run().catch(error => { console.error(error instanceof Error ? error.message : 'Migration failed'); process.exitCode = 1; });
