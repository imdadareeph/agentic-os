-- Phase M2.5 — dirty-flag deferred (idle) background processing.
-- The user flow (MEMORY_DECISION.md, VOICE_INTERRUPT.md FR-10):
--   modified -> dirty=true -> user active -> system idle -> workers process dirty -> dirty=false
--
-- turns.dirty already ships in schema.sql for fresh DBs; the ALTER below back-fills
-- databases created before this migration. sync_files gains dirty + tombstone so the
-- watcher can defer embedding to the idle worker instead of embedding on the hot path.
--
-- ensure_migrations() runs statements individually and tolerates "duplicate column"
-- errors, so re-running these ALTERs on an already-migrated DB is a no-op.

ALTER TABLE turns ADD COLUMN dirty BOOLEAN NOT NULL DEFAULT 0;

ALTER TABLE sync_files ADD COLUMN dirty BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE sync_files ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_turns_dirty ON turns(dirty);
CREATE INDEX IF NOT EXISTS idx_sync_files_dirty ON sync_files(dirty);
