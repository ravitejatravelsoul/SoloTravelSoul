-- Media index for KV-stored bytes (Workers Free). One row per uploaded object.
-- status: pending (index written, bytes not yet confirmed) → active → removed;
--         failed (bytes write failed). Only 'active' rows can ever be served,
--         and only after the Firestore authorization gate allows it.
-- kv_delete_pending = 1: bytes must still be deleted from KV (retryable cleanup).
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  kv_key TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('profile', 'post', 'journal')),
  visibility TEXT NOT NULL DEFAULT 'inherit' CHECK (visibility IN ('inherit', 'owner_only')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'removed', 'failed')),
  parent_id TEXT,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  kv_delete_pending INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS media_owner ON media (owner_uid, status);
CREATE INDEX IF NOT EXISTS media_pending ON media (kv_delete_pending);
CREATE INDEX IF NOT EXISTS media_status_updated ON media (status, updated_at);
