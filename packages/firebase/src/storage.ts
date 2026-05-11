import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { app } from './config';

export const storage = getStorage(app);

// Resize is handled by imageUtils in the mobile app before calling these.
// Storage paths are deterministic so re-uploading overwrites cleanly.

export async function uploadProfilePhoto(
  uid: string,
  blob: Blob
): Promise<string> {
  const storageRef = ref(storage, `profile_photos/${uid}/avatar.jpg`);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(storageRef);
}

export async function uploadJournalPhoto(
  uid: string,
  tripId: string,
  entryId: string,
  blob: Blob
): Promise<string> {
  const storageRef = ref(
    storage,
    `journals/${uid}/${tripId}/${entryId}.jpg`
  );
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
