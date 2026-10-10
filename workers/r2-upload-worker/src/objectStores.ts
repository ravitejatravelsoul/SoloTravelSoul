// Prefix deletion for legacy uploaded media (R2 and Firebase Storage). New
// media lives in KV behind the D1 index (media.ts); these stores only clean up
// objects created by earlier app versions.

export interface PrefixDeleter {
  name: string;
  /** Deletes every object under each prefix; returns the number deleted. beforePage runs before each page/object call. */
  deletePrefixes(prefixes: string[], beforePage?: () => Promise<void> | void): Promise<number>;
}

/** The store refused access (e.g. Cloud Storage on a Spark project): nothing can be deleted or verified. */
export class LegacyMediaInaccessible extends Error {
  constructor(readonly store: string, readonly status: number) {
    super(`${store} not accessible (${status})`);
    this.name = 'LegacyMediaInaccessible';
  }
}

export interface LegacyStorage extends PrefixDeleter {
  /**
   * Authenticated bucket lookup: true when the bucket exists, false only on a
   * 404 for the bucket itself (never provisioned). 401/403 throw LegacyMediaInaccessible.
   */
  bucketExists(beforeCall?: () => Promise<void> | void): Promise<boolean>;
  /**
   * Deletes single objects (e.g. profile_images/{uid}.jpg) that an authenticated listing shows to
   * exist; names the listing does not show are not touched (no DELETE is sent for them).
   */
  deleteObjects(names: string[], beforeCall?: () => Promise<void> | void): Promise<number>;
  /**
   * Proof of absence from authenticated listings only: true when every prefix lists empty and no
   * listing (prefix = the exact name) contains an exact name, across all pages. Denied, failed,
   * incomplete or malformed listings throw; they are never treated as empty.
   */
  verifyAbsent(prefixes: string[], names: string[], beforeCall?: () => Promise<void> | void): Promise<boolean>;
}

export function r2Deleter(bucket: R2Bucket): PrefixDeleter {
  return {
    name: 'r2',
    async deletePrefixes(prefixes, beforePage) {
      let deleted = 0;
      for (const prefix of prefixes) {
        let cursor: string | undefined;
        do {
          await beforePage?.();
          const page = await bucket.list({ prefix, cursor, limit: 1000 });
          const keys = page.objects.map((o) => o.key);
          if (keys.length) {
            await bucket.delete(keys);
            deleted += keys.length;
          }
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
      }
      return deleted;
    },
  };
}

export function firebaseStorageDeleter(opts: {
  bucket: string;
  token: () => Promise<string>;
  /** e.g. "127.0.0.1:9199" — emulator only. */
  emulatorHost?: string;
  fetch?: typeof fetch;
}): LegacyStorage {
  const base = opts.emulatorHost ? `http://${opts.emulatorHost}` : 'https://storage.googleapis.com';
  const objectsUrl = `${base}/storage/v1/b/${encodeURIComponent(opts.bucket)}/o`;
  const f = opts.fetch ?? fetch;
  const auth = async () => ({ Authorization: `Bearer ${await opts.token()}` });
  const denied = (status: number) => status === 401 || status === 403;

  /** Upper bound on pages per listing; reaching it means the listing is not complete (not proof). */
  const MAX_PAGES = 1000;

  /**
   * One listing page. Only an authenticated 200 with a well-formed body counts: every item must be
   * an object with a string name inside the requested prefix, and nextPageToken (if any) a non-empty
   * string. Denied (401/403) or missing bucket (404) throw LegacyMediaInaccessible; any other
   * failure or unexpected body throws, so it can never be read as an empty listing.
   */
  async function list(prefix: string, pageToken: string, beforeCall?: () => Promise<void> | void) {
    await beforeCall?.();
    const qs = `prefix=${encodeURIComponent(prefix)}&maxResults=100&fields=items(name),nextPageToken${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const resp = await f(`${objectsUrl}?${qs}`, { headers: await auth() });
    if (denied(resp.status)) throw new LegacyMediaInaccessible('firebase-storage', resp.status);
    // A missing bucket is not proof that nothing was stored (wrong name, other
    // project): only the staging no-legacy mode accepts it, via bucketExists().
    if (resp.status === 404) throw new LegacyMediaInaccessible('firebase-storage', 404);
    if (resp.status !== 200) throw new Error(`Storage list failed: ${resp.status}`);
    let body: unknown;
    try { body = await resp.json(); } catch { throw new Error('Storage list returned a non-JSON body'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Storage list returned an unexpected body');
    const { items, nextPageToken } = body as { items?: unknown; nextPageToken?: unknown };
    if (items !== undefined && !Array.isArray(items)) throw new Error('Storage list returned malformed items');
    const names: string[] = [];
    for (const it of (items as unknown[] | undefined) ?? []) {
      const name = it && typeof it === 'object' ? (it as { name?: unknown }).name : undefined;
      if (typeof name !== 'string' || !name.startsWith(prefix)) throw new Error('Storage list returned an item outside the requested prefix');
      names.push(name);
    }
    if (nextPageToken !== undefined && (typeof nextPageToken !== 'string' || nextPageToken === '')) throw new Error('Storage list returned a malformed page token');
    return { items: names, nextPageToken: (nextPageToken as string | undefined) ?? '' };
  }

  /** Every object name under a prefix, across all pages; throws unless the listing completes. */
  async function listAll(prefix: string, beforeCall?: () => Promise<void> | void): Promise<string[]> {
    const names: string[] = [];
    let pageToken = '';
    let pages = 0;
    do {
      if (++pages > MAX_PAGES) throw new Error('Storage list did not complete');
      const page = await list(prefix, pageToken, beforeCall);
      names.push(...page.items);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return names;
  }

  /** Objects that authenticated listings show: everything under the prefixes plus exact-name matches. */
  async function present(prefixes: string[], names: string[], beforeCall?: () => Promise<void> | void): Promise<string[]> {
    const found: string[] = [];
    for (const prefix of prefixes) found.push(...(await listAll(prefix, beforeCall)));
    for (const name of names) if ((await listAll(name, beforeCall)).includes(name)) found.push(name);
    return found;
  }

  async function del(name: string, beforeCall?: () => Promise<void> | void): Promise<boolean> {
    await beforeCall?.();
    const resp = await f(`${objectsUrl}/${encodeURIComponent(name)}`, { method: 'DELETE', headers: await auth() });
    if (denied(resp.status)) throw new LegacyMediaInaccessible('firebase-storage', resp.status);
    if (resp.status === 404) return false;
    if (!resp.ok) throw new Error(`Storage delete failed: ${resp.status}`);
    return true;
  }

  return {
    name: 'firebase-storage',
    async bucketExists(beforeCall) {
      await beforeCall?.();
      const resp = await f(`${base}/storage/v1/b/${encodeURIComponent(opts.bucket)}?fields=name`, { headers: await auth() });
      if (denied(resp.status)) throw new LegacyMediaInaccessible('firebase-storage', resp.status);
      if (resp.status === 404) return false;
      if (!resp.ok) throw new Error(`Storage bucket lookup failed: ${resp.status}`);
      return true;
    },
    // Only objects a listing shows are deleted; a listing that is empty means no DELETE is sent at
    // all (on Spark, object-level calls fail with a billing 403 even for absent objects).
    async deletePrefixes(prefixes, beforePage) {
      let deleted = 0;
      for (const prefix of prefixes) {
        let pageToken = '';
        let pages = 0;
        do {
          if (++pages > MAX_PAGES) throw new Error('Storage list did not complete');
          const page = await list(prefix, pageToken, beforePage);
          for (const name of page.items) if (await del(name, beforePage)) deleted++;
          pageToken = page.nextPageToken;
        } while (pageToken);
      }
      return deleted;
    },
    async deleteObjects(names, beforeCall) {
      let deleted = 0;
      for (const name of await present([], names, beforeCall)) if (await del(name, beforeCall)) deleted++;
      return deleted;
    },
    async verifyAbsent(prefixes, names, beforeCall) {
      return (await present(prefixes, names, beforeCall)).length === 0;
    },
  };
}
