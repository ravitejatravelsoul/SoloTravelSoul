// POST /account/delete — authenticated, recent-login-only account deletion.

import { isRecentAuth, type VerifiedToken } from './auth';
import { deleteAccount, DeletionAttemptLost, DeletionInProgress, DeletionStepFailed, type DeletionDeps } from './accountDeletion';

export interface AccountRouteDeps {
  verify(token: string): Promise<VerifiedToken>;
  /** null when the Worker lacks the server-side credentials for deletion. */
  deletion(): DeletionDeps | null;
  json(data: unknown, status?: number): Response;
  nowSec?: () => number;
}

export async function handleAccountDeletion(request: Request, deps: AccountRouteDeps): Promise<Response> {
  const authHeader = request.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return deps.json({ error: 'Missing Authorization: Bearer <token>', code: 'auth/missing-token' }, 401);
  }

  let identity: VerifiedToken;
  try {
    identity = await deps.verify(authHeader.slice(7));
  } catch (e) {
    console.error('[Worker] account deletion token rejected:', (e as Error).message);
    return deps.json({ error: 'Authentication failed', code: 'auth/invalid-token' }, 403);
  }

  // Destructive: require a sign-in/reauthentication within the last few minutes.
  if (!isRecentAuth(identity, deps.nowSec?.())) {
    return deps.json({ error: 'Please confirm your password again.', code: 'auth/requires-recent-login' }, 401);
  }

  const deletion = deps.deletion();
  if (!deletion) {
    console.error('[Worker] account deletion is not configured (missing service account)');
    return deps.json({ error: 'Account deletion is temporarily unavailable.', code: 'deletion/unavailable' }, 503);
  }

  try {
    await deleteAccount({ uid: identity.uid, email: identity.email }, deletion);
    return deps.json({ status: 'deleted' });
  } catch (e) {
    if (e instanceof DeletionInProgress) {
      return deps.json({ error: 'Account deletion is already in progress.', code: 'deletion/in-progress' }, 409);
    }
    const step = e instanceof DeletionStepFailed ? e.step : e instanceof DeletionAttemptLost ? 'lease' : 'unknown';
    const cause = e instanceof DeletionStepFailed ? e.cause : e;
    console.error(`[Worker] account deletion failed at ${step}:`, (cause as Error)?.message);
    return deps.json(
      {
        error: 'Account deletion did not finish. Some of your data may already be deleted, and your account is locked against changes. You can try again now; otherwise we finish it automatically within a few hours.',
        code: 'deletion/failed',
        step,
        retryable: true,
      },
      500
    );
  }
}

/** Constant-time comparison for the operator token. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * POST /admin/account-deletion {"uid": "..."} — lets an operator fulfil a
 * verified web/email deletion request (Google Play) with the same plan,
 * barrier and fencing as in-app deletion. Disabled (404) unless the
 * ADMIN_DELETION_TOKEN secret is set; the caller must present it as a bearer.
 */
export async function handleAdminAccountDeletion(
  request: Request,
  deps: { adminToken: string | undefined; deletion(): DeletionDeps | null; json(data: unknown, status?: number): Response }
): Promise<Response> {
  if (!deps.adminToken) return deps.json({ error: 'Not found' }, 404);
  const presented = (request.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (!sameSecret(presented, deps.adminToken)) return deps.json({ error: 'Forbidden' }, 403);

  const body = (await request.json().catch(() => null)) as { uid?: unknown } | null;
  const uid = typeof body?.uid === 'string' ? body.uid.trim() : '';
  if (!/^[A-Za-z0-9]{1,128}$/.test(uid)) return deps.json({ error: 'Expected {"uid": "<firebase uid>"}' }, 400);

  const deletion = deps.deletion();
  if (!deletion) return deps.json({ error: 'Account deletion is not configured.', code: 'deletion/unavailable' }, 503);
  try {
    await deleteAccount({ uid, email: null }, deletion);
    return deps.json({ status: 'deleted', uid });
  } catch (e) {
    if (e instanceof DeletionInProgress) return deps.json({ code: 'deletion/in-progress' }, 409);
    const step = e instanceof DeletionStepFailed ? e.step : e instanceof DeletionAttemptLost ? 'lease' : 'unknown';
    // The barrier is in place; the hourly cron continues the deletion.
    return deps.json({ code: 'deletion/failed', step, retryable: true }, 500);
  }
}
