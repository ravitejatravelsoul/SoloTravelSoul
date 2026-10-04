// Authenticated photo uploads to R2, gated by the account-deletion barrier.

import type { VerifiedToken } from './auth';

export interface UploadKind {
  maxBytes: number;
  usage: 'profile_photo' | 'post_photo';
  key(uid: string): string;
}

export const PROFILE_PHOTO: UploadKind = {
  maxBytes: 5 * 1024 * 1024, // 5 MB — profile photos
  usage: 'profile_photo',
  key: (uid) => `profile_photos/${uid}/avatar.jpg`,
};

export const POST_PHOTO: UploadKind = {
  maxBytes: 10 * 1024 * 1024, // 10 MB — post / journal photos
  usage: 'post_photo',
  key: (uid) => `post_photos/${uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}.jpg`,
};

export interface UploadDeps {
  verify(token: string): Promise<VerifiedToken>;
  /** True once deletion of this account has started (persistent barrier). */
  isDeleting(uid: string): Promise<boolean>;
  bucket: Pick<R2Bucket, 'put' | 'delete'>;
  publicBaseUrl: string;
  json(data: unknown, status?: number): Response;
}

const DELETING = { error: 'This account is being deleted.', code: 'account/deletion-in-progress' };

// Fails closed: if the barrier cannot be read, treat the account as deleting.
async function deleting(deps: UploadDeps, uid: string): Promise<boolean> {
  try {
    return await deps.isDeleting(uid);
  } catch (e) {
    console.error('[Worker] deletion barrier check failed:', (e as Error).message);
    return true;
  }
}

export async function handlePhotoUpload(request: Request, kind: UploadKind, deps: UploadDeps): Promise<Response> {
  const fail = (error: string, status: number) => deps.json({ error }, status);

  // ── 1. Auth ──────────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return fail('Missing Authorization: Bearer <token>', 401);
  }
  let uid: string;
  try {
    ({ uid } = await deps.verify(authHeader.slice(7)));
  } catch (e) {
    console.error('[Worker] token verification failed:', (e as Error).message);
    return fail(`Authentication failed: ${(e as Error).message}`, 403);
  }

  // ── 2. Deletion barrier ─────────────────────────────────────────────
  if (await deleting(deps, uid)) return deps.json(DELETING, 403);

  // ── 3. Parse multipart/form-data ─────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail('Expected multipart/form-data body', 400);
  }
  const file = formData.get('file') as File | null;
  if (!file) {
    return fail('Missing "file" field in form data', 400);
  }

  // ── 4. Validate ───────────────────────────────────────────────────────
  if (file.size > kind.maxBytes) {
    return fail(`File too large. Maximum ${kind.maxBytes / (1024 * 1024)} MB.`, 413);
  }
  if (!file.type.startsWith('image/')) {
    return fail('Only image files are accepted.', 415);
  }

  // ── 5. Upload to R2 ───────────────────────────────────────────────────
  const key = kind.key(uid);
  try {
    await deps.bucket.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: { ownerUid: uid, usage: kind.usage },
    });
    console.log(`[Worker] R2 put OK — key: ${key}, size: ${file.size}`);
  } catch (e) {
    console.error('[Worker] R2 put failed:', (e as Error).message);
    return fail('Failed to store image. Please try again.', 500);
  }

  // ── 6. Re-check: deletion may have started while this upload was in
  // flight (after its media cleanup already listed the prefix). Remove the
  // object so it cannot outlive the account.
  if (await deleting(deps, uid)) {
    await deps.bucket.delete(key);
    return deps.json(DELETING, 403);
  }

  // ── 7. Return public URL ──────────────────────────────────────────────
  return deps.json({ photoURL: `${deps.publicBaseUrl.replace(/\/$/, '')}/${key}` });
}
