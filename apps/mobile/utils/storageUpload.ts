import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { getIdToken } from 'firebase/auth';
import { ref, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '@solotravelsoul/firebase';

// ── Logging helpers ───────────────────────────────────────────────────────────

function devLog(...args: unknown[]): void {
  if (__DEV__) console.log('[StorageUpload]', ...args);
}
function devError(...args: unknown[]): void {
  if (__DEV__) console.error('[StorageUpload]', ...args);
}

// ── Provider selection ────────────────────────────────────────────────────────
//
// EXPO_PUBLIC_STORAGE_PROVIDER  EXPO_PUBLIC_R2_UPLOAD_WORKER_URL  → result
// 'r2'                          set                               → R2 Worker
// 'firebase'                    (any)                             → Firebase Storage
// (anything else / missing)     (any)                             → disabled

export function isUploadsEnabled(): boolean {
  const provider = process.env.EXPO_PUBLIC_STORAGE_PROVIDER ?? '';
  const workerUrl = process.env.EXPO_PUBLIC_R2_UPLOAD_WORKER_URL ?? '';
  return (provider === 'r2' && workerUrl.length > 0) || provider === 'firebase';
}

// ── Post photo upload (R2 only — no Firebase Storage fallback for posts) ────────

export async function uploadPostPhotoFromUri(
  uid: string,
  fileUri: string
): Promise<string> {
  const provider = process.env.EXPO_PUBLIC_STORAGE_PROVIDER ?? '';
  const workerUrl = process.env.EXPO_PUBLIC_R2_UPLOAD_WORKER_URL ?? '';

  if (provider === 'r2' && workerUrl) {
    return uploadViaR2WorkerEndpoint(uid, fileUri, workerUrl, '/upload/post-photo');
  }

  throw Object.assign(
    new Error('Photo uploads are temporarily unavailable. Set up Cloudflare R2 to enable post photos.'),
    { code: 'upload/disabled' }
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function uploadProfilePhotoFromUri(
  uid: string,
  fileUri: string
): Promise<string> {
  const provider = process.env.EXPO_PUBLIC_STORAGE_PROVIDER ?? '';
  const workerUrl = process.env.EXPO_PUBLIC_R2_UPLOAD_WORKER_URL ?? '';

  if (provider === 'r2' && workerUrl) {
    return uploadViaR2Worker(uid, fileUri, workerUrl);
  }

  if (provider === 'firebase') {
    return uploadViaFirebaseStorage(uid, fileUri);
  }

  throw Object.assign(
    new Error('Photo uploads are temporarily unavailable.'),
    { code: 'upload/disabled' }
  );
}

// ── R2 Worker path ────────────────────────────────────────────────────────────

// Generic endpoint-parameterized R2 upload — used by both profile and post photos
async function uploadViaR2WorkerEndpoint(
  uid: string,
  fileUri: string,
  workerUrl: string,
  endpointPath: string
): Promise<string> {
  devLog('provider: r2, endpoint:', endpointPath);
  devLog('uid:', uid);
  devLog('fileUri (truncated):', fileUri.slice(0, 60));

  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not authenticated');

  const idToken = await getIdToken(currentUser);
  devLog('got Firebase ID token');

  const endpoint = `${workerUrl.replace(/\/$/, '')}${endpointPath}`;
  devLog('endpoint:', endpoint);

  devLog('calling uploadAsync (MULTIPART → Worker)...');
  const result = await uploadAsync(endpoint, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: 'image/jpeg',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  devLog('Worker response status:', result.status);

  if (result.status === 401 || result.status === 403) {
    devError('auth rejected by Worker, body:', result.body.slice(0, 200));
    throw Object.assign(
      new Error('Your session has expired. Please sign out and sign in again.'),
      { code: 'auth/expired' }
    );
  }
  if (result.status === 413) {
    throw Object.assign(
      new Error('Image is too large. Please choose a smaller photo.'),
      { code: 'upload/too-large' }
    );
  }
  if (result.status === 415) {
    throw Object.assign(
      new Error('Unsupported image format. Please choose a JPEG or PNG.'),
      { code: 'upload/unsupported-type' }
    );
  }
  if (result.status < 200 || result.status >= 300) {
    devError('Worker error body:', result.body.slice(0, 300));
    throw Object.assign(
      new Error('Upload service unavailable. Please try again later.'),
      { code: 'upload/server-error' }
    );
  }

  let data: { photoURL?: string };
  try {
    data = JSON.parse(result.body) as { photoURL?: string };
  } catch {
    devError('failed to parse Worker response body:', result.body.slice(0, 100));
    throw new Error('Invalid response from upload service.');
  }

  if (!data.photoURL) {
    devError('Worker returned no photoURL, body:', result.body.slice(0, 200));
    throw new Error('Upload service did not return a photo URL.');
  }

  devLog('upload succeeded, photoURL received');
  return data.photoURL;
}

async function uploadViaR2Worker(
  uid: string,
  fileUri: string,
  workerUrl: string
): Promise<string> {
  return uploadViaR2WorkerEndpoint(uid, fileUri, workerUrl, '/upload/profile-photo');
}

// ── Firebase Storage path (fallback, requires Blaze plan) ─────────────────────

async function uploadViaFirebaseStorage(uid: string, fileUri: string): Promise<string> {
  devLog('provider: firebase');
  devLog('uid:', uid, 'fileUri (truncated):', fileUri.slice(0, 60));

  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not authenticated');

  const idToken = await getIdToken(currentUser);
  devLog('got Firebase ID token');

  const bucket = storage.app.options.storageBucket as string;
  const path = `profile_photos/${uid}/avatar.jpg`;
  const uploadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o` +
    `?uploadType=media&name=${encodeURIComponent(path)}`;
  devLog('bucket:', bucket);

  devLog('calling uploadAsync (Firebase Storage REST API)...');
  const result = await uploadAsync(uploadUrl, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Firebase ${idToken}`,
      'Content-Type': 'image/jpeg',
    },
    mimeType: 'image/jpeg',
  });

  devLog('Firebase Storage response status:', result.status);

  if (result.status === 402 || result.body.toLowerCase().includes('spark')) {
    devError(
      'Firebase Storage blocked: project is on Spark plan. ' +
      'Upgrade to Blaze or switch EXPO_PUBLIC_STORAGE_PROVIDER=r2. ' +
      'See docs/FIREBASE_STORAGE_SETUP.md and docs/R2_STORAGE_SETUP.md.'
    );
    throw Object.assign(
      new Error(
        'Photo uploads require Firebase Storage to be enabled. ' +
        'This feature will be available soon.'
      ),
      { code: 'storage/billing-not-enabled' }
    );
  }

  if (result.status < 200 || result.status >= 300) {
    devError('Firebase Storage upload failed, body:', result.body.slice(0, 300));
    throw new Error(`Storage upload failed: HTTP ${result.status}`);
  }

  devLog('uploadAsync succeeded, fetching download URL...');
  const storageRef = ref(storage, path);
  const downloadUrl = await getDownloadURL(storageRef);
  devLog('getDownloadURL succeeded');
  return downloadUrl;
}
