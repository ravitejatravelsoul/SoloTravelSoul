import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { getIdToken } from 'firebase/auth';
import { auth } from '@solotravelsoul/firebase';

// All new uploads go to the Worker media endpoint (Workers Free: KV bytes +
// D1 index). Firebase Storage uploads are retired: Cloud Storage for Firebase
// requires the Blaze plan, and this app stays on Spark.

function devLog(...args: unknown[]): void {
  if (__DEV__) console.log('[MediaUpload]', ...args);
}

export type MediaPurpose = 'profile' | 'post' | 'journal';

const workerUrl = () => (process.env.EXPO_PUBLIC_R2_UPLOAD_WORKER_URL ?? '').replace(/\/$/, '');

export function isUploadsEnabled(): boolean {
  return workerUrl().length > 0;
}

/** Uploads a local image (already resized, ≤ 2 MB) and returns its `<worker>/media/<id>` URL. */
export async function uploadMediaFromUri(fileUri: string, purpose: MediaPurpose): Promise<string> {
  const base = workerUrl();
  if (!base) {
    throw Object.assign(new Error('Photo uploads are temporarily unavailable.'), { code: 'upload/disabled' });
  }
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not authenticated');
  const idToken = await getIdToken(currentUser);

  devLog('uploading', purpose);
  const result = await uploadAsync(`${base}/media/upload`, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: 'image/jpeg',
    parameters: { purpose },
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (result.status === 401 || result.status === 403) {
    throw Object.assign(new Error('Photo upload was refused. Please sign in again.'), { code: 'auth/expired' });
  }
  if (result.status === 413) {
    throw Object.assign(new Error('Image is too large (max 2 MB). Please choose a smaller photo.'), { code: 'upload/too-large' });
  }
  if (result.status === 415) {
    throw Object.assign(new Error('Unsupported image format. Please choose a JPEG or PNG.'), { code: 'upload/unsupported-type' });
  }
  if (result.status < 200 || result.status >= 300) {
    throw Object.assign(new Error('Upload service unavailable. Please try again later.'), { code: 'upload/server-error' });
  }
  let data: { photoURL?: string };
  try {
    data = JSON.parse(result.body) as { photoURL?: string };
  } catch {
    throw new Error('Invalid response from upload service.');
  }
  if (!data.photoURL) throw new Error('Upload service did not return a photo URL.');
  return data.photoURL;
}

export function uploadProfilePhotoFromUri(_uid: string, fileUri: string): Promise<string> {
  return uploadMediaFromUri(fileUri, 'profile');
}

export function uploadPostPhotoFromUri(_uid: string, fileUri: string, purpose: 'post' | 'journal' = 'post'): Promise<string> {
  return uploadMediaFromUri(fileUri, purpose);
}
