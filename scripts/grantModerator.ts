/** Grant or revoke the moderator role (moderators/{uid}); clients can never write it.
 * Dry run:  npx tsx scripts/grantModerator.ts --project <staging-project> --uid <uid>
 * Apply:    add --apply      Revoke: add --revoke
 * Uses operator application-default credentials. Refuses the production project
 * unless --production is passed explicitly (production rollout only).
 */
import { parseArgs } from 'node:util';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { PRODUCTION_FIREBASE_PROJECT_ID } from '../packages/shared/src/environment';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    uid: { type: 'string' },
    apply: { type: 'boolean', default: false },
    revoke: { type: 'boolean', default: false },
    production: { type: 'boolean', default: false },
  },
});
if (!values.project || !values.uid) throw new Error('Pass --project and --uid explicitly.');
if (values.project === PRODUCTION_FIREBASE_PROJECT_ID && !values.production) {
  throw new Error('Refusing the production project without --production.');
}
if (!/^[A-Za-z0-9]{1,128}$/.test(values.uid)) throw new Error('Invalid uid.');

initializeApp({ credential: applicationDefault(), projectId: values.project });
const ref = getFirestore().collection('moderators').doc(values.uid);

async function run() {
  const action = values.revoke ? 'revoke' : 'grant';
  console.log(JSON.stringify({ project: values.project, uid: values.uid, action, mode: values.apply ? 'apply' : 'dry-run' }));
  if (!values.apply) return;
  if (values.revoke) await ref.delete();
  else await ref.set({ grantedAt: FieldValue.serverTimestamp(), grantedBy: 'scripts/grantModerator.ts' });
}
run().catch((e) => { console.error(e instanceof Error ? e.message : 'failed'); process.exitCode = 1; });
