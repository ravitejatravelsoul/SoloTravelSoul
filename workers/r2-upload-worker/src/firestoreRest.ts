// Minimal Firestore REST client with Admin privileges (service-account token,
// or "owner" against the emulator). Exposes only what account deletion needs.

export interface StoredDoc {
  /** Path relative to the database root, e.g. "users/abc/trips/t1". */
  path: string;
  data: Record<string, unknown>;
  updateTime: string;
}

export interface QueryFilter {
  field: string;
  op: 'EQUAL' | 'ARRAY_CONTAINS' | 'GREATER_THAN';
  value: string | boolean | number;
}

export type StoreWrite =
  | { kind: 'delete'; path: string; mustExist?: boolean; updateTime?: string }
  | {
      kind: 'update';
      path: string;
      /** Dotted field paths → new values (nested maps are created as needed). */
      set?: Record<string, unknown>;
      /** Dotted field paths to remove. */
      remove?: string[];
      increment?: Record<string, number>;
      serverTime?: string[];
      /** Defaults to true: never create a document through an update. */
      mustExist?: boolean;
      /** Optimistic concurrency: fail if the document changed since this read. */
      updateTime?: string;
    };

export interface DocStore {
  get(path: string): Promise<StoredDoc | null>;
  /** Several documents in one round trip (one subrequest); missing documents are null, in input order. */
  getMany(paths: string[]): Promise<(StoredDoc | null)[]>;
  /** parent '' = database root. allDescendants = collection-group query. */
  query(collectionId: string, filters: QueryFilter[], opts?: { parent?: string; allDescendants?: boolean }): Promise<StoredDoc[]>;
  /** Document IDs in a collection, including "missing" parents that only hold subcollections. */
  listDocumentIds(collectionPath: string): Promise<string[]>;
  listCollectionIds(docPath: string): Promise<string[]>;
  /** Atomic multi-document commit. Throws StoreConflict when a precondition fails. */
  commit(writes: StoreWrite[]): Promise<void>;
}

export class StoreConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreConflict';
  }
}

// ── Value encoding ────────────────────────────────────────────────────────────

type FsValue = Record<string, unknown>;

export function encodeValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
}

function encodeFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, val] of Object.entries(obj)) out[k] = encodeValue(val);
  return out;
}

export function decodeValue(v: FsValue): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('arrayValue' in v) {
    const values = (v.arrayValue as { values?: FsValue[] }).values ?? [];
    return values.map(decodeValue);
  }
  if ('mapValue' in v) return decodeFields((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {});
  return null;
}

function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(fields)) out[k] = decodeValue(val);
  return out;
}

/** Quote each segment of a dotted path when it is not a simple identifier (e.g. UIDs starting with a digit). */
export function fieldPath(dotted: string): string {
  return dotted
    .split('.')
    .map((seg) => (/^[A-Za-z_][A-Za-z_0-9]*$/.test(seg) ? seg : '`' + seg.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`'))
    .join('.');
}

function nestedFields(set: Record<string, unknown>): Record<string, FsValue> {
  const root: Record<string, unknown> = {};
  for (const [dotted, value] of Object.entries(set)) {
    const segs = dotted.split('.');
    let node = root;
    for (const seg of segs.slice(0, -1)) {
      if (typeof node[seg] !== 'object' || node[seg] === null) node[seg] = {};
      node = node[seg] as Record<string, unknown>;
    }
    node[segs[segs.length - 1]] = value;
  }
  return encodeFields(root);
}

// ── REST client ───────────────────────────────────────────────────────────────

export interface FirestoreRestOptions {
  projectId: string;
  /** Returns the bearer token for each request ("owner" for the emulator). */
  token: () => Promise<string>;
  /** e.g. "127.0.0.1:8080" — emulator only. */
  emulatorHost?: string;
  /** Injected so every call is charged to the invocation's subrequest budget. */
  fetch?: typeof fetch;
}

export class FirestoreRest implements DocStore {
  private readonly dbName: string;
  private readonly docsRoot: string;
  private readonly baseUrl: string;

  constructor(private readonly opts: FirestoreRestOptions) {
    this.dbName = `projects/${opts.projectId}/databases/(default)`;
    this.docsRoot = `${this.dbName}/documents`;
    this.baseUrl = opts.emulatorHost ? `http://${opts.emulatorHost}/v1` : 'https://firestore.googleapis.com/v1';
  }

  private async call(method: string, url: string, body?: unknown): Promise<Response> {
    const resp = await (this.opts.fetch ?? fetch)(url, {
      method,
      headers: { Authorization: `Bearer ${await this.opts.token()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return resp;
  }

  private async failure(resp: Response, what: string): Promise<never> {
    const text = await resp.text();
    if (/FAILED_PRECONDITION|ABORTED|ALREADY_EXISTS/.test(text) || (resp.status === 404 && what === 'commit')) {
      throw new StoreConflict(`${what}: ${resp.status}`);
    }
    throw new Error(`Firestore ${what} failed: ${resp.status} ${text.slice(0, 200)}`);
  }

  private relPath(name: string): string {
    return name.slice(this.docsRoot.length + 1);
  }

  async get(path: string): Promise<StoredDoc | null> {
    const resp = await this.call('GET', `${this.baseUrl}/${this.docsRoot}/${encodePath(path)}`);
    if (resp.status === 404) return null;
    if (!resp.ok) return this.failure(resp, 'get');
    const body = (await resp.json()) as { name: string; fields?: Record<string, FsValue>; updateTime: string };
    return { path, data: decodeFields(body.fields ?? {}), updateTime: body.updateTime };
  }

  async getMany(paths: string[]): Promise<(StoredDoc | null)[]> {
    if (paths.length === 0) return [];
    const resp = await this.call('POST', `${this.baseUrl}/${this.docsRoot}:batchGet`, {
      documents: paths.map((p) => `${this.docsRoot}/${p}`),
    });
    if (!resp.ok) return this.failure(resp, 'batchGet');
    const rows = (await resp.json()) as { found?: { name: string; fields?: Record<string, FsValue>; updateTime: string }; missing?: string }[];
    const byName = new Map<string, StoredDoc>();
    for (const r of rows) {
      if (r.found) byName.set(r.found.name, { path: this.relPath(r.found.name), data: decodeFields(r.found.fields ?? {}), updateTime: r.found.updateTime });
    }
    return paths.map((p) => byName.get(`${this.docsRoot}/${p}`) ?? null);
  }

  async query(
    collectionId: string,
    filters: QueryFilter[],
    opts: { parent?: string; allDescendants?: boolean } = {}
  ): Promise<StoredDoc[]> {
    const parent = opts.parent ? `${this.docsRoot}/${encodePath(opts.parent)}` : this.docsRoot;
    const fieldFilters = filters.map((f) => ({
      fieldFilter: { field: { fieldPath: fieldPath(f.field) }, op: f.op, value: encodeValue(f.value) },
    }));
    // Firestore requires an inequality field to lead the sort order.
    const inequality = filters.find((f) => f.op === 'GREATER_THAN');
    const orderBy = [
      ...(inequality ? [{ field: { fieldPath: fieldPath(inequality.field) }, direction: 'ASCENDING' }] : []),
      { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
    ];
    const results: StoredDoc[] = [];
    const pageSize = 100; // small pages bound per-response CPU (Workers Free: 10 ms/invocation)
    let offset = 0;
    // Paged by offset; the deletion flow only queries one user's documents.
    for (;;) {
      const structuredQuery: Record<string, unknown> = {
        from: [{ collectionId, allDescendants: !!opts.allDescendants }],
        orderBy,
        offset,
        limit: pageSize,
      };
      if (fieldFilters.length === 1) structuredQuery.where = fieldFilters[0];
      if (fieldFilters.length > 1) structuredQuery.where = { compositeFilter: { op: 'AND', filters: fieldFilters } };
      const resp = await this.call('POST', `${this.baseUrl}/${parent}:runQuery`, { structuredQuery });
      if (!resp.ok) return this.failure(resp, 'query');
      const rows = (await resp.json()) as { document?: { name: string; fields?: Record<string, FsValue>; updateTime: string } }[];
      const docs = rows.filter((r) => r.document).map((r) => r.document!);
      for (const d of docs) results.push({ path: this.relPath(d.name), data: decodeFields(d.fields ?? {}), updateTime: d.updateTime });
      if (docs.length < pageSize) return results;
      offset += pageSize;
    }
  }

  async listDocumentIds(collectionPath: string): Promise<string[]> {
    const ids: string[] = [];
    let pageToken = '';
    do {
      const qs = `pageSize=100&showMissing=true&mask.fieldPaths=__name__${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const resp = await this.call('GET', `${this.baseUrl}/${this.docsRoot}/${encodePath(collectionPath)}?${qs}`);
      if (!resp.ok) return this.failure(resp, 'list');
      const body = (await resp.json()) as { documents?: { name: string }[]; nextPageToken?: string };
      for (const d of body.documents ?? []) ids.push(d.name.split('/').pop()!);
      pageToken = body.nextPageToken ?? '';
    } while (pageToken);
    return ids;
  }

  async listCollectionIds(docPath: string): Promise<string[]> {
    const ids: string[] = [];
    let pageToken = '';
    do {
      const resp = await this.call('POST', `${this.baseUrl}/${this.docsRoot}/${encodePath(docPath)}:listCollectionIds`, {
        pageSize: 100,
        ...(pageToken ? { pageToken } : {}),
      });
      if (!resp.ok) return this.failure(resp, 'listCollectionIds');
      const body = (await resp.json()) as { collectionIds?: string[]; nextPageToken?: string };
      ids.push(...(body.collectionIds ?? []));
      pageToken = body.nextPageToken ?? '';
    } while (pageToken);
    return ids;
  }

  async commit(writes: StoreWrite[]): Promise<void> {
    if (writes.length === 0) return;
    const restWrites = writes.map((w) => {
      const name = `${this.docsRoot}/${w.path}`;
      if (w.kind === 'delete') {
        const currentDocument = w.updateTime ? { updateTime: w.updateTime } : w.mustExist ? { exists: true } : undefined;
        return { delete: name, ...(currentDocument ? { currentDocument } : {}) };
      }
      const maskPaths = [...Object.keys(w.set ?? {}), ...(w.remove ?? [])].map(fieldPath);
      const transforms = [
        ...Object.entries(w.increment ?? {}).map(([f, n]) => ({ fieldPath: fieldPath(f), increment: { integerValue: String(n) } })),
        ...(w.serverTime ?? []).map((f) => ({ fieldPath: fieldPath(f), setToServerValue: 'REQUEST_TIME' })),
      ];
      return {
        update: { name, fields: nestedFields(w.set ?? {}) },
        updateMask: { fieldPaths: maskPaths },
        ...(transforms.length ? { updateTransforms: transforms } : {}),
        currentDocument: w.updateTime ? { updateTime: w.updateTime } : { exists: w.mustExist ?? true },
      };
    });
    const resp = await this.call('POST', `${this.baseUrl}/${this.docsRoot}:commit`, { writes: restWrites });
    if (!resp.ok) return this.failure(resp, 'commit');
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
