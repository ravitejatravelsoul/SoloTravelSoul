import {
  getStorage,
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { app } from './config';

export const storage = getStorage(app);

// ── Upload helpers ────────────────────────────────────────────────────
// Logs in __DEV__ only. Never log full download URLs in production.

const IS_DEV = process.env.NODE_ENV !== 'production';

function devLog(...args: unknown[]): void {
  if (IS_DEV) console.log('[Storage]', ...args);
}

function devError(...args: unknown[]): void {
  if (IS_DEV) console.error('[Storage]', ...args);
}

// Primary upload path for profile photos.
// Uses uploadString with base64 to avoid Blob/ArrayBuffer construction,
// which throws on iOS Expo Go ("Creating blobs from ArrayBufferView not supported").
export async function uploadProfilePhotoBase64(
  uid: string,
  base64: string
): Promise<string> {
  const path = `profile_photos/${uid}/avatar.jpg`;
  devLog('uploadProfilePhotoBase64 — uid:', uid);
  devLog('uploadProfilePhotoBase64 — path:', path);
  devLog('uploadProfilePhotoBase64 — bucket:', storage.app.options.storageBucket);
  devLog('uploadProfilePhotoBase64 — base64 length:', base64.length);

  if (!base64 || base64.length === 0) {
    const err = new Error('base64 string is empty — nothing to upload');
    devError('uploadProfilePhotoBase64 —', err.message);
    throw err;
  }

  const storageRef = ref(storage, path);

  try {
    devLog('uploadProfilePhotoBase64 — calling uploadString...');
    await uploadString(storageRef, base64, 'base64', {
      contentType: 'image/jpeg',
      customMetadata: { ownerUid: uid, usage: 'profile_photo' },
    });
    devLog('uploadProfilePhotoBase64 — uploadString done');
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? 'unknown';
    const message = (err as { message?: string }).message ?? '';
    devError('uploadProfilePhotoBase64 — uploadString FAILED — code:', code, 'message:', message);
    throw err;
  }

  try {
    devLog('uploadProfilePhotoBase64 — calling getDownloadURL...');
    const url = await getDownloadURL(storageRef);
    devLog('uploadProfilePhotoBase64 — getDownloadURL succeeded');
    return url;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? 'unknown';
    const message = (err as { message?: string }).message ?? '';
    devError('uploadProfilePhotoBase64 — getDownloadURL FAILED — code:', code, 'message:', message);
    throw err;
  }
}

export async function uploadProfilePhoto(
  uid: string,
  blob: Blob
): Promise<string> {
  const path = `profile_photos/${uid}/avatar.jpg`;
  devLog('uploadProfilePhoto — uid:', uid);
  devLog('uploadProfilePhoto — path:', path);
  devLog('uploadProfilePhoto — bucket:', storage.app.options.storageBucket);
  devLog('uploadProfilePhoto — blob size:', blob.size, 'type:', blob.type);

  if (blob.size === 0) {
    const err = new Error('Blob is empty — nothing to upload');
    devError('uploadProfilePhoto —', err.message);
    throw err;
  }

  const storageRef = ref(storage, path);

  try {
    devLog('uploadProfilePhoto — calling uploadBytes...');
    const snapshot = await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
    devLog('uploadProfilePhoto — uploadBytes done, bytes transferred:', snapshot.metadata.size);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? 'unknown';
    const message = (err as { message?: string }).message ?? '';
    devError('uploadProfilePhoto — uploadBytes FAILED — code:', code, 'message:', message);
    throw err;
  }

  try {
    devLog('uploadProfilePhoto — calling getDownloadURL...');
    const url = await getDownloadURL(storageRef);
    devLog('uploadProfilePhoto — getDownloadURL succeeded');
    return url;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? 'unknown';
    const message = (err as { message?: string }).message ?? '';
    devError('uploadProfilePhoto — getDownloadURL FAILED — code:', code, 'message:', message);
    throw err;
  }
}

export async function uploadJournalPhoto(
  uid: string,
  tripId: string,
  entryId: string,
  blob: Blob
): Promise<string> {
  const storageRef = ref(storage, `journals/${uid}/${tripId}/${entryId}.jpg`);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(storageRef);
}

export async function deleteTripCoverPhoto(uid: string, tripId: string): Promise<void> {
  try {
    await deleteObject(ref(storage, `trip_covers/${uid}/${tripId}.jpg`));
  } catch {
    // File may not exist — ignore
  }
}

export async function uploadTripCoverPhoto(
  uid: string,
  tripId: string,
  blob: Blob
): Promise<string> {
  const storageRef = ref(storage, `trip_covers/${uid}/${tripId}.jpg`);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(storageRef);
}
