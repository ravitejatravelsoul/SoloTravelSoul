import { verifyFirebaseToken } from './auth';

export interface Env {
  R2_BUCKET: R2Bucket;
  PUBLIC_R2_BASE_URL: string;
  FIREBASE_PROJECT_ID: string;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/upload/profile-photo') {
      return handleProfilePhoto(request, env);
    }

    return err('Not found', 404);
  },
};

async function handleProfilePhoto(request: Request, env: Env): Promise<Response> {
  // ── 1. Auth ──────────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return err('Missing Authorization: Bearer <token>', 401);
  }
  const token = authHeader.slice(7);

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID));
  } catch (e) {
    console.error('[Worker] token verification failed:', (e as Error).message);
    return err(`Authentication failed: ${(e as Error).message}`, 403);
  }

  // ── 2. Parse multipart/form-data ─────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return err('Expected multipart/form-data body', 400);
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return err('Missing "file" field in form data', 400);
  }

  // ── 3. Validate ───────────────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return err('File too large. Maximum 5 MB.', 413);
  }
  if (!file.type.startsWith('image/')) {
    return err('Only image files are accepted.', 415);
  }

  // ── 4. Upload to R2 ───────────────────────────────────────────────────
  const key = `profile_photos/${uid}/avatar.jpg`;
  const body = await file.arrayBuffer();

  try {
    await env.R2_BUCKET.put(key, body, {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: { ownerUid: uid, usage: 'profile_photo' },
    });
    console.log(`[Worker] R2 put OK — key: ${key}, size: ${file.size}`);
  } catch (e) {
    console.error('[Worker] R2 put failed:', (e as Error).message);
    return err('Failed to store image. Please try again.', 500);
  }

  // ── 5. Return public URL ──────────────────────────────────────────────
  const base = env.PUBLIC_R2_BASE_URL.replace(/\/$/, '');
  const photoURL = `${base}/${key}`;
  return json({ photoURL });
}
