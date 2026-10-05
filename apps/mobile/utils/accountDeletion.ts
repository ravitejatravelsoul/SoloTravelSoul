import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getFreshIdToken } from '@solotravelsoul/firebase';

function deletionError(code: string, message = 'Account deletion failed'): Error {
  return Object.assign(new Error(message), { code });
}

export type DeletionProgress = { completedSteps: number; totalSteps: number };
/** 'blocked': a cleanup step waits on something outside the app (e.g. legacy photo storage); the server retries it. */
export type DeletionOutcome = 'deleted' | 'in_progress' | 'blocked';
/**
 * Continuation requests per tap; the server's cron continues any remainder.
 * Slices are small (Workers Free allows 10 ms CPU per request).
 */
export const MAX_DELETION_SLICES = 200;

/**
 * Asks the server (Worker, which holds the Admin credentials) to delete the
 * signed-in account. Call immediately after reauthenticate(): starting needs a
 * recent sign-in. On Workers Free the server works in bounded slices and
 * answers 202 while work remains; this keeps continuing with the same verified
 * token (continuation is bound to that token's UID) and reports progress.
 * Resolves 'deleted' when data, media and the Auth identity are gone,
 * 'blocked' when the server reports a step it cannot finish yet (it keeps the
 * account and retries; continuing now would not help), or 'in_progress' after
 * MAX_DELETION_SLICES (the server finishes it).
 */
export async function requestAccountDeletion(onProgress?: (p: DeletionProgress) => void): Promise<DeletionOutcome> {
  const workerUrl = (process.env.EXPO_PUBLIC_R2_UPLOAD_WORKER_URL ?? '').replace(/\/$/, '');
  if (!workerUrl) throw deletionError('deletion/unavailable');

  const token = await getFreshIdToken();
  for (let slice = 0; slice < MAX_DELETION_SLICES; slice++) {
    let resp: Response;
    try {
      resp = await fetch(`${workerUrl}/account/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw deletionError('deletion/network');
    }
    if (resp.status === 202) {
      const body = (await resp.json().catch(() => ({}))) as Partial<DeletionProgress> & { status?: string };
      onProgress?.({ completedSteps: Number(body.completedSteps ?? 0), totalSteps: Number(body.totalSteps ?? 0) });
      if (body.status === 'blocked') return 'blocked';
      continue;
    }
    if (resp.ok) return 'deleted';
    const body = (await resp.json().catch(() => ({}))) as { code?: string; error?: string };
    throw deletionError(body.code ?? 'deletion/failed', body.error);
  }
  return 'in_progress';
}

/** Removes every on-device trace of `uid`: offline caches, sync/chat queues and scheduled reminders. */
export async function clearLocalUserData(uid: string): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  // Every per-user key embeds the UID (@sts:trips:<uid>, @sts:queue:<uid>, @sts/notif_ids_<uid>_…).
  const owned = keys.filter((k) => k.includes(uid));
  if (owned.length) await AsyncStorage.multiRemove(owned);
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}
