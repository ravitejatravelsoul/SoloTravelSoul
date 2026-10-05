import { verifyFirebaseToken } from './auth';
import { handleAccountDeletion, handleAdminAccountDeletion, handleAdminDeletionStatus } from './accountRoute';
import { accountDeletionPage } from './deletionPage';
import { handleRemoveMedia } from './moderationRoute';
import { runScheduledMaintenance, type DeletionDeps } from './accountDeletion';
import { FirestoreRest, type DocStore } from './firestoreRest';
import { firebaseStorageDeleter, r2Deleter } from './objectStores';
import { getAccessToken, identityToolkitUserDeleter, identityToolkitUserExists, parseServiceAccount } from './google';
import { handlePhotoUpload, POST_PHOTO, PROFILE_PHOTO, type UploadKind } from './uploads';
import { handleMediaUpload, handleMediaView, maintenanceLimits, meteredD1, runMediaMaintenance, type MediaDeps } from './media';
import { handleAdminMedia } from './adminMedia';
import { budgetedFetch, D1_FREE_QUERIES, SliceExhausted, SubrequestBudget } from './budget';

export interface Env {
  /** Legacy R2 bucket: cleanup/migration of earlier uploads only (optional). */
  R2_BUCKET?: R2Bucket;
  /** Public base URL of the legacy R2 bucket (unset where no R2 bucket is bound). */
  PUBLIC_R2_BASE_URL?: string;
  FIREBASE_PROJECT_ID: string;
  /** Firebase Storage bucket, e.g. "<project>.firebasestorage.app" (legacy cleanup only). */
  FIREBASE_STORAGE_BUCKET?: string;
  /** Secret: service-account JSON used only for account deletion (wrangler secret put). */
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  /** Secret: operator bearer token for /admin/* (unset = disabled). */
  ADMIN_DELETION_TOKEN?: string;
  /** Media bytes (Workers KV) and index (D1). Media endpoints fail closed (503) without them. */
  MEDIA_KV?: KVNamespace;
  MEDIA_DB?: D1Database;
  /** Canonical origin of media URLs (`<origin>/media/<id>`); required for cron media maintenance. */
  MEDIA_PUBLIC_ORIGIN?: string;
  /** "none" = staging no-legacy mode (see DeletionDeps.legacyMode); refused for the production project. */
  LEGACY_MEDIA_MODE?: string;
}

/** The production Firebase project; must match packages/shared PRODUCTION_FIREBASE_PROJECT_ID (tested). */
export const PRODUCTION_FIREBASE_PROJECT_ID = 'solotravelsoul-57a9e';

/** Legacy-media mode, or null when the configuration is invalid (deletion then answers 503). */
export function legacyModeFor(env: Pick<Env, 'LEGACY_MEDIA_MODE' | 'FIREBASE_PROJECT_ID'>): 'required' | 'none' | null {
  const mode = env.LEGACY_MEDIA_MODE ?? '';
  if (mode === '' || mode === 'required') return 'required';
  if (mode === 'none' && env.FIREBASE_PROJECT_ID !== PRODUCTION_FIREBASE_PROJECT_ID) return 'none';
  return null;
}

const mediaOrigin = (env: Env, request?: Request) => (env.MEDIA_PUBLIC_ORIGIN || (request ? new URL(request.url).origin : '')).replace(/\/$/, '');

/**
 * Everything one invocation may call, charged to one Workers Free budget
 * (50 subrequests): token/JWKS fetches, Firestore, Cloud Storage, Identity Toolkit.
 * D1 queries are charged to a separate 50-query budget (D1 Free). KV calls
 * count toward the 1,000 Cloudflare-service subrequests and stay far below it.
 */
function services(env: Env, budget: SubrequestBudget) {
  const fetchFn = budgetedFetch(budget);
  const account = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = account ? () => getAccessToken(account, fetchFn) : null;
  const store: DocStore | null = token ? new FirestoreRest({ projectId: env.FIREBASE_PROJECT_ID, token, fetch: fetchFn }) : null;
  const verify = (t: string) => verifyFirebaseToken(t, env.FIREBASE_PROJECT_ID, fetchFn);
  const queries = new SubrequestBudget(D1_FREE_QUERIES);
  const media = env.MEDIA_DB && env.MEDIA_KV ? { db: meteredD1(env.MEDIA_DB, queries), kv: env.MEDIA_KV, queries } : undefined;
  const deletion = (): DeletionDeps | null => {
    if (!token || !store || !env.FIREBASE_STORAGE_BUCKET) return null;
    const legacyMode = legacyModeFor(env);
    if (!legacyMode) {
      console.error('[Worker] deletion refused: LEGACY_MEDIA_MODE is invalid for this project');
      return null;
    }
    return {
      legacyMode,
      store,
      r2: env.R2_BUCKET ? r2Deleter(env.R2_BUCKET) : undefined,
      firebaseStorage: firebaseStorageDeleter({ bucket: env.FIREBASE_STORAGE_BUCKET, token, fetch: fetchFn }),
      media,
      budget,
      deleteAuthUser: identityToolkitUserDeleter({ projectId: env.FIREBASE_PROJECT_ID, token, fetch: fetchFn }),
      authUserExists: identityToolkitUserExists({ projectId: env.FIREBASE_PROJECT_ID, token, fetch: fetchFn }),
    };
  };
  return { store, verify, media, deletion };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

async function legacyUpload(request: Request, env: Env, kind: UploadKind, svc: ReturnType<typeof services>): Promise<Response> {
  // Earlier app versions only. Fail closed without the barrier read or the bucket.
  const store = svc.store;
  if (!store || !env.R2_BUCKET || !env.PUBLIC_R2_BASE_URL) {
    return json({ error: 'Uploads are temporarily unavailable.', code: 'uploads/unavailable' }, 503);
  }
  const publicBaseUrl = env.PUBLIC_R2_BASE_URL;
  return handlePhotoUpload(request, kind, {
    verify: svc.verify,
    isDeleting: async (uid) => {
      const [deleting, suspended] = await store.getMany([`accountDeletions/${uid}`, `accountSuspensions/${uid}`]);
      return !!deleting || !!suspended;
    },
    bucket: env.R2_BUCKET,
    publicBaseUrl,
    json,
  });
}

function mediaDeps(request: Request, env: Env, svc: ReturnType<typeof services>): MediaDeps | null {
  if (!svc.store || !svc.media) return null;
  return { db: svc.media.db, kv: svc.media.kv, store: svc.store, verify: svc.verify, publicBaseUrl: mediaOrigin(env, request), json };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
    const { pathname } = new URL(request.url);
    const svc = services(env, new SubrequestBudget());

    if (request.method === 'GET' && pathname === '/account-deletion') return accountDeletionPage();

    const mediaView = pathname.match(/^\/media\/([^/]+)$/);
    if (request.method === 'GET' && mediaView) {
      const deps = mediaDeps(request, env, svc);
      if (!deps) return new Response(null, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
      return handleMediaView(request, mediaView[1], deps);
    }
    if (request.method === 'POST' && pathname === '/media/upload') {
      const deps = mediaDeps(request, env, svc);
      if (!deps) return json({ error: 'Uploads are temporarily unavailable.', code: 'uploads/unavailable' }, 503);
      return handleMediaUpload(request, deps);
    }

    if (request.method === 'POST' && pathname === '/moderation/remove-media') {
      return handleRemoveMedia(request, {
        verify: svc.verify,
        store: svc.store,
        bucket: env.R2_BUCKET,
        publicBaseUrl: env.PUBLIC_R2_BASE_URL ?? '',
        media: svc.media ? { db: svc.media.db, kv: svc.media.kv, baseUrl: mediaOrigin(env, request) } : undefined,
        json,
      });
    }

    const admin = await handleAdminMedia(request, pathname, {
      adminToken: env.ADMIN_DELETION_TOKEN, db: env.MEDIA_DB, kv: env.MEDIA_KV, r2: env.R2_BUCKET, baseUrl: mediaOrigin(env, request), json,
    });
    if (admin) return admin;

    if (request.method === 'GET' && pathname === '/admin/deletion-status') {
      return handleAdminDeletionStatus(request, { adminToken: env.ADMIN_DELETION_TOKEN, deletion: svc.deletion, json });
    }
    if (request.method === 'POST' && pathname === '/admin/account-deletion') {
      return handleAdminAccountDeletion(request, { adminToken: env.ADMIN_DELETION_TOKEN, deletion: svc.deletion, json });
    }
    if (request.method === 'POST' && pathname === '/upload/profile-photo') return legacyUpload(request, env, PROFILE_PHOTO, svc);
    if (request.method === 'POST' && pathname === '/upload/post-photo') return legacyUpload(request, env, POST_PHOTO, svc);
    if (request.method === 'POST' && pathname === '/account/delete') {
      return handleAccountDeletion(request, { verify: svc.verify, deletion: svc.deletion, json });
    }
    return err('Not found', 404);
  },

  // Cron (wrangler.toml): one budgeted invocation finishes stranded jobs,
  // advances one paused/failed deletion by a slice, sweeps late media, then
  // spends what is left on media maintenance. Everything resumes next run.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const budget = new SubrequestBudget();
    const svc = services(env, budget);
    const deletion = svc.deletion();
    if (!deletion) {
      console.error('[Worker] deletion maintenance skipped: deletion is not configured');
      return;
    }
    ctx.waitUntil((async () => {
      await runScheduledMaintenance(deletion);
      if (svc.media && svc.store && env.MEDIA_PUBLIC_ORIGIN && budget.remaining() > 12) {
        try {
          await runMediaMaintenance(
            { ...svc.media, store: svc.store, publicBaseUrl: mediaOrigin(env) },
            maintenanceLimits(budget.remaining(), svc.media.queries.remaining())
          );
        } catch (e) {
          if (!(e instanceof SliceExhausted)) console.error('[Worker] media maintenance failed:', (e as Error).message);
        }
      }
    })());
  },
};
