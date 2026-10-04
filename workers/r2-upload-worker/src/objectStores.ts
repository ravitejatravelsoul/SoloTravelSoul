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
  /** Deletes single objects (e.g. profile_images/{uid}.jpg); 404 counts as already absent. */
  deleteObjects(names: string[], beforeCall?: () => Promise<void> | void): Promise<number>;
  /** True only when every prefix lists empty and every object returns 404 — proof of absence. */
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

  async function list(prefix: string, pageToken: string, beforeCall?: () => Promise<void> | void) {
    await beforeCall?.();
    const qs = `prefix=${encodeURIComponent(prefix)}&maxResults=100&fields=items(name),nextPageToken${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const resp = await f(`${objectsUrl}?${qs}`, { headers: await auth() });
    if (denied(resp.status)) throw new LegacyMediaInaccessible('firebase-storage', resp.status);
    if (resp.status === 404) return { items: [], nextPageToken: '' }; // bucket does not exist
    if (!resp.ok) throw new Error(`Storage list failed: ${resp.status}`);
    const body = (await resp.json()) as { items?: { name: string }[]; nextPageToken?: string };
    return { items: body.items ?? [], nextPageToken: body.nextPageToken ?? '' };
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
    async deletePrefixes(prefixes, beforePage) {
      let deleted = 0;
      for (const prefix of prefixes) {
        let pageToken = '';
        do {
          const page = await list(prefix, pageToken, beforePage);
          for (const item of page.items) if (await del(item.name, beforePage)) deleted++;
          pageToken = page.nextPageToken;
        } while (pageToken);
      }
      return deleted;
    },
    async deleteObjects(names, beforeCall) {
      let deleted = 0;
      for (const name of names) if (await del(name, beforeCall)) deleted++;
      return deleted;
    },
    async verifyAbsent(prefixes, names, beforeCall) {
      for (const prefix of prefixes) if ((await list(prefix, '', beforeCall)).items.length) return false;
      for (const name of names) {
        await beforeCall?.();
        const resp = await f(`${objectsUrl}/${encodeURIComponent(name)}?fields=name`, { headers: await auth() });
        if (denied(resp.status)) throw new LegacyMediaInaccessible('firebase-storage', resp.status);
        if (resp.status !== 404) return false;
      }
      return true;
    },
  };
}
