// Prefix deletion for uploaded media. Both stores are listed and deleted
// page by page, so a retry after a partial failure resumes where it stopped.

export interface PrefixDeleter {
  name: string;
  /** Deletes every object under each prefix; returns the number deleted. */
  deletePrefixes(prefixes: string[]): Promise<number>;
}

export function r2Deleter(bucket: R2Bucket): PrefixDeleter {
  return {
    name: 'r2',
    async deletePrefixes(prefixes) {
      let deleted = 0;
      for (const prefix of prefixes) {
        let cursor: string | undefined;
        do {
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
}): PrefixDeleter {
  const base = opts.emulatorHost ? `http://${opts.emulatorHost}` : 'https://storage.googleapis.com';
  const objectsUrl = `${base}/storage/v1/b/${encodeURIComponent(opts.bucket)}/o`;
  return {
    name: 'firebase-storage',
    async deletePrefixes(prefixes) {
      let deleted = 0;
      for (const prefix of prefixes) {
        let pageToken = '';
        do {
          const auth = { Authorization: `Bearer ${await opts.token()}` };
          const qs = `prefix=${encodeURIComponent(prefix)}&fields=items(name),nextPageToken${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
          const resp = await fetch(`${objectsUrl}?${qs}`, { headers: auth });
          if (!resp.ok) throw new Error(`Storage list failed: ${resp.status}`);
          const body = (await resp.json()) as { items?: { name: string }[]; nextPageToken?: string };
          for (const item of body.items ?? []) {
            const del = await fetch(`${objectsUrl}/${encodeURIComponent(item.name)}`, { method: 'DELETE', headers: auth });
            // 404: already deleted by an earlier, partially failed attempt.
            if (!del.ok && del.status !== 404) throw new Error(`Storage delete failed: ${del.status}`);
            deleted++;
          }
          pageToken = body.nextPageToken ?? '';
        } while (pageToken);
      }
      return deleted;
    },
  };
}
