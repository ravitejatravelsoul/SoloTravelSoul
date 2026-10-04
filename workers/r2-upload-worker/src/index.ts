import { verifyFirebaseToken } from './auth';
import { handleAccountDeletion } from './accountRoute';
import { runScheduledMaintenance, type DeletionDeps } from './accountDeletion';
import { FirestoreRest, type DocStore } from './firestoreRest';
import { firebaseStorageDeleter, r2Deleter } from './objectStores';
import { getAccessToken, identityToolkitUserDeleter, identityToolkitUserExists, parseServiceAccount } from './google';
import { handlePhotoUpload, POST_PHOTO, PROFILE_PHOTO, type UploadKind } from './uploads';

export interface Env {
  R2_BUCKET: R2Bucket;
  PUBLIC_R2_BASE_URL: string;
  FIREBASE_PROJECT_ID: string;
  /** Firebase Storage bucket, e.g. "<project>.firebasestorage.app". */
  FIREBASE_STORAGE_BUCKET?: string;
  /** Secret: service-account JSON used only for account deletion (wrangler secret put). */
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
}

function deletionDeps(env: Env): DeletionDeps | null {
  const account = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!account || !env.FIREBASE_STORAGE_BUCKET) return null;
  const token = () => getAccessToken(account);
  return {
    store: new FirestoreRest({ projectId: env.FIREBASE_PROJECT_ID, token }),
    r2: r2Deleter(env.R2_BUCKET),
    firebaseStorage: firebaseStorageDeleter({ bucket: env.FIREBASE_STORAGE_BUCKET, token }),
    deleteAuthUser: identityToolkitUserDeleter({ projectId: env.FIREBASE_PROJECT_ID, token }),
    authUserExists: identityToolkitUserExists({ projectId: env.FIREBASE_PROJECT_ID, token }),
  };
}

/** Firestore access for reading the deletion barrier; null without usable credentials. */
function barrierStore(env: Env): DocStore | null {
  const account = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!account) return null;
  return new FirestoreRest({ projectId: env.FIREBASE_PROJECT_ID, token: () => getAccessToken(account) });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function upload(request: Request, env: Env, kind: UploadKind): Promise<Response> {
  // Fail closed: without credentials to read the deletion barrier, uploads
  // could recreate media for an account being deleted.
  const store = barrierStore(env);
  if (!store) {
    console.error('[Worker] uploads disabled: missing GOOGLE_SERVICE_ACCOUNT_JSON for the deletion barrier');
    return json({ error: 'Uploads are temporarily unavailable.', code: 'uploads/unavailable' }, 503);
  }
  return handlePhotoUpload(request, kind, {
    verify: (token) => verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID),
    isDeleting: async (uid) => !!(await store.get(`accountDeletions/${uid}`)),
    bucket: env.R2_BUCKET,
    publicBaseUrl: env.PUBLIC_R2_BASE_URL,
    json,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/upload/profile-photo') {
      return upload(request, env, PROFILE_PHOTO);
    }

    if (request.method === 'POST' && pathname === '/upload/post-photo') {
      return upload(request, env, POST_PHOTO);
    }

    if (request.method === 'POST' && pathname === '/account/delete') {
      return handleAccountDeletion(request, {
        verify: (token) => verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID),
        deletion: () => deletionDeps(env),
        json,
      });
    }

    return err('Not found', 404);
  },

  // Cron (wrangler.toml): finish deletions whose final bookkeeping failed,
  // then remove late media that arrived through uploads already in flight.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const deletion = deletionDeps(env);
    if (!deletion) {
      console.error('[Worker] deletion maintenance skipped: deletion is not configured');
      return;
    }
    ctx.waitUntil(runScheduledMaintenance(deletion).then(() => undefined));
  },
};
