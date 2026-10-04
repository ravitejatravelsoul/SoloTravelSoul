import { getFreshIdToken } from '@solotravelsoul/firebase';

/**
 * Deletes the R2 photos of a post/journal the moderator has just removed.
 * The Worker re-checks the moderator role and that the item is 'removed'.
 */
export async function requestMediaRemoval(targetType: 'post' | 'journal', targetId: string): Promise<void> {
  const workerUrl = (process.env.EXPO_PUBLIC_R2_UPLOAD_WORKER_URL ?? '').replace(/\/$/, '');
  if (!workerUrl) throw new Error('Media removal is not configured');
  const resp = await fetch(`${workerUrl}/moderation/remove-media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getFreshIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetType, targetId }),
  });
  if (!resp.ok) throw new Error(`Media removal failed: ${resp.status}`);
}
