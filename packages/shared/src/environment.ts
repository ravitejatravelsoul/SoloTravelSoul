// Staging isolation: a staging build or Worker must never point at production
// Firebase, Storage or the production Worker. Used at runtime by the app
// (packages/firebase/src/config.ts) and by scripts/checkStagingIsolation.cjs.

export const PRODUCTION_FIREBASE_PROJECT_ID = 'solotravelsoul-57a9e';
export const PRODUCTION_STORAGE_BUCKET = 'solotravelsoul-57a9e.firebasestorage.app';
export const PRODUCTION_WORKER_NAME = 'solotravelsoul-r2-upload';
export const PRODUCTION_R2_BUCKET = 'solotravelsoul-images';
/** Project number (not secret); embedded in every app ID and sender ID of the production project. */
export const PRODUCTION_FIREBASE_PROJECT_NUMBER = '1027722856345';

export interface EnvironmentTargets {
  appEnv?: string;
  firebaseProjectId?: string;
  storageBucket?: string;
  workerUrl?: string;
  apiKey?: string;
  authDomain?: string;
  messagingSenderId?: string;
  appId?: string;
}

/**
 * Problems that would let a staging build reach production or mix projects;
 * empty when the configuration is complete and self-consistent (or not
 * staging). This is a configuration check only: it cannot prove the API key
 * and app belong to the staging project — that needs trusted Firebase
 * metadata (scripts/checkStagingIsolation.cjs --firebase-metadata).
 * Messages name fields, never values.
 */
export function stagingIsolationProblems(t: EnvironmentTargets): string[] {
  if (t.appEnv !== 'staging') return [];
  const problems: string[] = [];
  const v = (x: string | undefined) => (x ?? '').trim();
  const project = v(t.firebaseProjectId);
  const bucket = v(t.storageBucket);
  const authDomain = v(t.authDomain);
  const senderId = v(t.messagingSenderId);
  const appId = v(t.appId);
  if (!project || project.startsWith('REPLACE_')) problems.push('staging Firebase project is not set');
  else if (project === PRODUCTION_FIREBASE_PROJECT_ID) problems.push('staging build points at the production Firebase project');
  for (const [name, value] of [['apiKey', v(t.apiKey)], ['authDomain', authDomain], ['storageBucket', bucket], ['messagingSenderId', senderId], ['appId', appId]]) {
    if (!value) problems.push(`staging Firebase ${name} is not set`);
  }
  if (bucket === PRODUCTION_STORAGE_BUCKET || bucket.startsWith(`${PRODUCTION_FIREBASE_PROJECT_ID}.`)) {
    problems.push('staging build points at the production Storage bucket');
  } else if (bucket && project && !bucket.startsWith(`${project}.`)) {
    problems.push('staging Storage bucket does not belong to the staging project');
  }
  if (authDomain.startsWith(`${PRODUCTION_FIREBASE_PROJECT_ID}.`)) {
    problems.push('staging build points at the production Auth domain');
  } else if (authDomain && project && authDomain !== `${project}.firebaseapp.com` && authDomain !== `${project}.web.app`) {
    problems.push('staging Auth domain does not belong to the staging project');
  }
  if (senderId === PRODUCTION_FIREBASE_PROJECT_NUMBER) problems.push('staging build uses the production sender ID');
  if (appId) {
    const m = appId.match(/^1:(\d+):(web|android|ios):[0-9a-f]+$/);
    if (!m) problems.push('staging Firebase appId is malformed');
    else if (m[1] === PRODUCTION_FIREBASE_PROJECT_NUMBER) problems.push('staging build uses a production app ID');
    else if (senderId && m[1] !== senderId) problems.push('staging app ID and sender ID belong to different projects');
  }
  const worker = (t.workerUrl ?? '').trim();
  if (worker) {
    let host = '';
    try { host = new URL(worker).hostname; } catch { problems.push('staging Worker URL is not a valid URL'); }
    if (host.startsWith(`${PRODUCTION_WORKER_NAME}.`)) problems.push('staging build points at the production Worker');
  }
  return problems;
}
