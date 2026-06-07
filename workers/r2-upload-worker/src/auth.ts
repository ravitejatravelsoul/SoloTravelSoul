// Firebase ID token verification using Google's JWK endpoint.
// Works in Cloudflare Workers via the Web Crypto API (no Node.js required).

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

interface JWK {
  kty: string;
  alg: string;
  use: string;
  kid: string;
  n: string;
  e: string;
}

interface JWKSResponse {
  keys: JWK[];
}

interface TokenPayload {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  iat: number;
}

// In-memory cache for the Worker process lifetime.
// Workers are short-lived, so this avoids a JWKS fetch on every request
// during a burst while still refreshing when the process is recycled.
let cachedJWKS: JWKSResponse | null = null;
let jwksCachedAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getJWKS(): Promise<JWKSResponse> {
  const now = Date.now();
  if (cachedJWKS && now - jwksCachedAt < JWKS_TTL_MS) {
    return cachedJWKS;
  }
  const resp = await fetch(JWKS_URL);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Firebase public keys: ${resp.status}`);
  }
  cachedJWKS = (await resp.json()) as JWKSResponse;
  jwksCachedAt = now;
  return cachedJWKS;
}

// base64url → ArrayBuffer (no external libs needed in Workers)
function base64urlToBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const binStr = atob(b64);
  const buf = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    buf[i] = binStr.charCodeAt(i);
  }
  return buf.buffer;
}

// Decode JWT segment (base64url-encoded JSON) without verifying.
function decodeSegment<T>(segment: string): T {
  return JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/'))) as T;
}

/**
 * Verify a Firebase ID token and return the uid on success.
 * Throws a descriptive Error on any failure (expired, wrong project, bad sig, etc.).
 */
export async function verifyFirebaseToken(
  token: string,
  projectId: string
): Promise<{ uid: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed token: expected 3 segments');
  }

  const [headerSeg, payloadSeg, sigSeg] = parts;

  // Extract key ID from header so we can pick the right JWK.
  const header = decodeSegment<{ kid?: string; alg?: string }>(headerSeg);
  if (!header.kid) throw new Error('Token header missing kid');
  if (header.alg !== 'RS256') throw new Error('Expected RS256 algorithm');

  // Fetch the matching public key.
  const jwks = await getJWKS();
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`Unknown kid: ${header.kid}`);

  // Import the JWK as a CryptoKey for signature verification.
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // Verify the RS256 signature over "header.payload".
  const signedData = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
  const signature = base64urlToBuffer(sigSeg);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signature,
    signedData
  );
  if (!valid) throw new Error('Invalid token signature');

  // Decode and validate standard JWT claims.
  const payload = decodeSegment<TokenPayload>(payloadSeg);
  const nowSec = Math.floor(Date.now() / 1000);

  if (payload.exp <= nowSec) throw new Error('Token expired');
  if (payload.iat > nowSec + 300) throw new Error('Token issued in the future');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Invalid token issuer');
  }
  if (payload.aud !== projectId) throw new Error('Invalid token audience');
  if (!payload.sub) throw new Error('Token missing subject (uid)');

  return { uid: payload.sub };
}
