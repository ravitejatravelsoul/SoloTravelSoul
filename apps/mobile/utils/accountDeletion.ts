import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getFreshIdToken } from '@solotravelsoul/firebase';

function deletionError(code: string, message = 'Account deletion failed'): Error {
  return Object.assign(new Error(message), { code });
}

/**
 * Asks the server (R2 worker, which holds the Admin credentials) to delete the
 * signed-in account. Call immediately after reauthenticate(): the server only
 * accepts a recent sign-in. Resolves once data, media and the Auth identity are
 * gone; rejects with a `code` and leaves the account intact otherwise.
 */
export async function requestAccountDeletion(): Promise<void> {
  const workerUrl = (process.env.EXPO_PUBLIC_R2_UPLOAD_WORKER_URL ?? '').replace(/\/$/, '');
  if (!workerUrl) throw deletionError('deletion/unavailable');

  const token = await getFreshIdToken();
  let resp: Response;
  try {
    resp = await fetch(`${workerUrl}/account/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw deletionError('deletion/network');
  }
  if (resp.ok) return;
  const body = (await resp.json().catch(() => ({}))) as { code?: string; error?: string };
  throw deletionError(body.code ?? 'deletion/failed', body.error);
}

/** Removes every on-device trace of `uid`: offline caches, sync/chat queues and scheduled reminders. */
export async function clearLocalUserData(uid: string): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  // Every per-user key embeds the UID (@sts:trips:<uid>, @sts:queue:<uid>, @sts/notif_ids_<uid>_…).
  const owned = keys.filter((k) => k.includes(uid));
  if (owned.length) await AsyncStorage.multiRemove(owned);
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}
