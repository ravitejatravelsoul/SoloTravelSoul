import { useCallback } from 'react';
import type { ImageURISource } from 'react-native';
import { useAuthStore } from '@/stores/authStore';

/**
 * Worker media (`<worker>/media/<id>`) is private: every request carries the
 * signed-in user's ID token, and the Worker decides from current Firestore
 * state whether to serve it. Other URLs (local previews, legacy R2/Firebase
 * links, place photos) are passed through unchanged.
 *
 * Cache policy: `cache: 'default'` lets iOS follow the Worker's headers —
 * `private, max-age=300` for media shared with other users (kept ≤ 5 min) and
 * `private, no-store` otherwise. Android's image pipeline keeps its own
 * memory/disk cache. Removing or hiding media stops the Worker from serving it
 * again; it cannot recall copies a device has already downloaded.
 */
export const MEDIA_CACHE_POLICY = 'default' as const;

export function isWorkerMediaUrl(uri: string | null | undefined, workerBase: string): boolean {
  const base = workerBase.replace(/\/$/, '');
  return !!uri && !!base && uri.startsWith(`${base}/media/`);
}

export function mediaSource(uri: string, token: string | null, workerBase: string): ImageURISource {
  if (!isWorkerMediaUrl(uri, workerBase)) return { uri };
  return token
    ? { uri, headers: { Authorization: `Bearer ${token}` }, cache: MEDIA_CACHE_POLICY }
    : { uri, cache: MEDIA_CACHE_POLICY };
}

/** Returns a function mapping an image URL to an Image `source` with media authorization. */
export function useMediaSource(): (uri: string) => ImageURISource {
  const token = useAuthStore((s) => s.idToken);
  const base = process.env.EXPO_PUBLIC_R2_UPLOAD_WORKER_URL ?? '';
  return useCallback((uri: string) => mediaSource(uri, token, base), [token, base]);
}
