// POST /account/delete — authenticated, recent-login-only account deletion.

import { isRecentAuth, type VerifiedToken } from './auth';
import { deleteAccount, DeletionInProgress, DeletionStepFailed, type DeletionDeps } from './accountDeletion';

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
    const step = e instanceof DeletionStepFailed ? e.step : 'unknown';
    const cause = e instanceof DeletionStepFailed ? e.cause : e;
    console.error(`[Worker] account deletion failed at ${step}:`, (cause as Error)?.message);
    return deps.json(
      { error: 'Could not finish deleting your account. Nothing was lost — please try again.', code: 'deletion/failed', step, retryable: true },
      500
    );
  }
}
