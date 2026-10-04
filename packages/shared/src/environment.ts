// Staging isolation: a staging build or Worker must never point at production
// Firebase, Storage or the production Worker. Used at runtime by the app
// (packages/firebase/src/config.ts) and by scripts/checkStagingIsolation.cjs.

export const PRODUCTION_FIREBASE_PROJECT_ID = 'solotravelsoul-57a9e';
export const PRODUCTION_STORAGE_BUCKET = 'solotravelsoul-57a9e.firebasestorage.app';
export const PRODUCTION_WORKER_NAME = 'solotravelsoul-r2-upload';
export const PRODUCTION_R2_BUCKET = 'solotravelsoul-images';

export interface EnvironmentTargets {
  appEnv?: string;
  firebaseProjectId?: string;
  storageBucket?: string;
  workerUrl?: string;
}

/** Problems that would let a staging build reach production; empty when isolated (or not staging). */
export function stagingIsolationProblems(t: EnvironmentTargets): string[] {
  if (t.appEnv !== 'staging') return [];
  const problems: string[] = [];
  const project = (t.firebaseProjectId ?? '').trim();
  const bucket = (t.storageBucket ?? '').trim();
  if (!project || project.startsWith('REPLACE_')) problems.push('staging Firebase project is not set');
  else if (project === PRODUCTION_FIREBASE_PROJECT_ID) problems.push('staging build points at the production Firebase project');
  if (bucket === PRODUCTION_STORAGE_BUCKET || bucket.startsWith(`${PRODUCTION_FIREBASE_PROJECT_ID}.`)) {
    problems.push('staging build points at the production Storage bucket');
  }
  const worker = (t.workerUrl ?? '').trim();
  if (worker) {
    let host = '';
    try { host = new URL(worker).hostname; } catch { problems.push('staging Worker URL is not a valid URL'); }
    if (host.startsWith(`${PRODUCTION_WORKER_NAME}.`)) problems.push('staging build points at the production Worker');
  }
  return problems;
}
