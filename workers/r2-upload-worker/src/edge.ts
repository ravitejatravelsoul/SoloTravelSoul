// Durable Object host (staging feasibility proof; see wrangler.do-staging.toml).
//
// The public Worker stays thin: it serves the static deletion page, rejects
// unknown routes and forwards every API request unread (no body parsing, no
// token verification) to one of a fixed set of SQLite-backed Durable Objects.
// Authentication and the existing handlers (media, moderation, admin, account
// deletion) run inside the Durable Object through the same handleFetch() as the
// plain Worker, so barriers, authorization, leases, counters and the KV/D1
// gates are unchanged. Scheduled maintenance runs in one fixed object through
// an RPC method, which no HTTP request can reach.
//
// Routing is bounded: object names are chosen by the server (`api-0` …
// `api-<N-1>`, `maintenance`), never taken from the client. Views shard on the
// media id; other routes on the token's unverified `sub` claim (routing only —
// the object verifies the token), so one account's requests share an object
// and no single object serializes all traffic.

import { DurableObject } from 'cloudflare:workers';
import { accountDeletionPage } from './deletionPage';
import { handleFetch, runScheduled, type Env } from './index';

export interface EdgeEnv extends Env {
  API: DurableObjectNamespace<ApiShard>;
  /** Number of API objects (default 8). */
  API_SHARDS?: string;
  /** "1": the maintenance object runs every phase per cron run (no 10 ms limit inside the object). */
  CRON_ALL_PHASES?: string;
}

export class ApiShard extends DurableObject<EdgeEnv> {
  override async fetch(request: Request): Promise<Response> {
    return handleFetch(request, this.env);
  }

  /** Scheduled maintenance; only reachable through the binding (RPC), never over HTTP. */
  async maintenance(scheduledTime: number): Promise<void> {
    await runScheduled(scheduledTime, this.env, this.env.CRON_ALL_PHASES === '1');
  }
}

const PUBLIC_ROUTES: readonly [string, RegExp][] = [
  ['GET', /^\/media\/[^/]+$/],
  ['POST', /^\/media\/upload$/],
  ['POST', /^\/moderation\/remove-media$/],
  ['POST', /^\/account\/delete$/],
  ['POST', /^\/admin\/account-deletion$/],
  ['GET', /^\/admin\/deletion-status$/],
  ['POST', /^\/admin\/media\/import$/],
  ['GET', /^\/admin\/media\/[0-9a-f]{32}\/digest$/],
  ['GET', /^\/admin\/legacy-r2(\/object)?$/],
  ['POST', /^\/upload\/(profile|post)-photo$/],
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

/** FNV-1a: cheap, stable shard choice. */
export function shardIndex(key: string, shards: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return (h >>> 0) % shards;
}

/** Unverified `sub` of a bearer JWT, for routing only ('' when absent or malformed). */
export function routingSubject(authorization: string | null): string {
  const m = /^Bearer [^.]+\.([^.]+)\.[^.]+$/.exec(authorization ?? '');
  if (!m) return '';
  try {
    const json = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' && sub.length <= 128 ? sub : '';
  } catch {
    return '';
  }
}

export function objectNameFor(method: string, pathname: string, authorization: string | null, shards: number): string {
  const view = method === 'GET' && /^\/media\/([^/]+)$/.exec(pathname);
  const key = view ? `media:${view[1]}` : pathname.startsWith('/admin/') ? 'admin' : `sub:${routingSubject(authorization)}`;
  return `api-${shardIndex(key, shards)}`;
}

const noStore = { 'Cache-Control': 'private, no-store', ...CORS };

export default {
  async fetch(request: Request, env: EdgeEnv): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/account-deletion') return accountDeletionPage();
    if (!PUBLIC_ROUTES.some(([m, re]) => m === request.method && re.test(pathname))) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...noStore } });
    }
    const shards = Math.min(64, Math.max(1, Number(env.API_SHARDS) || 8));
    const name = objectNameFor(request.method, pathname, request.headers.get('Authorization'), shards);
    try {
      return await env.API.get(env.API.idFromName(name)).fetch(request);
    } catch {
      // Object unavailable (overload, reset, quota): fail closed, nothing served.
      return new Response(JSON.stringify({ error: 'Service temporarily unavailable.', code: 'service/unavailable' }), {
        status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '5', ...noStore },
      });
    }
  },

  async scheduled(event: ScheduledController, env: EdgeEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(env.API.get(env.API.idFromName('maintenance')).maintenance(event.scheduledTime));
  },
};
