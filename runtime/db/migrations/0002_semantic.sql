-- Phase M2 — semantic sync bookkeeping.
-- Tracks which vault files are embedded, at what content hash, for incremental reconcile.

CREATE TABLE IF NOT EXISTS sync_files (
  path          TEXT PRIMARY KEY,   -- vault-relative path
  content_hash  TEXT NOT NULL,
  embedded_at   TEXT NOT NULL,
  chunk_count   INTEGER NOT NULL DEFAULT 0
);
