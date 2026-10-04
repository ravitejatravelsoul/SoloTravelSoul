// Google service-account OAuth for Firebase Admin REST APIs (Firestore,
// Cloud Storage, Identity Toolkit). The key is a Worker secret and never
// leaves the Worker; tokens are minted with Web Crypto (no Node.js required).

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

let cached: { email: string; token: string; expiresAt: number } | null = null;

function base64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export function parseServiceAccount(json: string | undefined): ServiceAccount | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

export async function getAccessToken(account: ServiceAccount): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cached && cached.email === account.client_email && cached.expiresAt - 60 > nowSec) {
    return cached.token;
  }

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
  });
  if (!resp.ok) throw new Error(`Service account token exchange failed: ${resp.status}`);
  const body = (await resp.json()) as { access_token: string; expires_in: number };
  cached = { email: account.client_email, token: body.access_token, expiresAt: nowSec + body.expires_in };
  return body.access_token;
}

/** Deletes a Firebase Auth user with Admin privileges. An already-deleted user counts as success. */
export function identityToolkitUserDeleter(opts: {
  projectId: string;
  token: () => Promise<string>;
  /** e.g. "127.0.0.1:9099" — emulator only. */
  emulatorHost?: string;
}): (uid: string) => Promise<void> {
  const base = opts.emulatorHost
    ? `http://${opts.emulatorHost}/identitytoolkit.googleapis.com`
    : 'https://identitytoolkit.googleapis.com';
  return async (uid) => {
    const resp = await fetch(`${base}/v1/projects/${opts.projectId}/accounts:delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await opts.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: uid }),
    });
    if (resp.ok) return;
    const text = await resp.text();
    if (text.includes('USER_NOT_FOUND')) return;
    throw new Error(`Auth user deletion failed: ${resp.status}`);
  };
}
