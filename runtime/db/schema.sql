-- Memory Engine schema — Phase M0 (MEMORY_IMPLEMENTATION_PLAN.md §1.1)
-- Only the tables M0 needs. turns_archive / tool_runs / sync_files ship
-- as their own migrations in the phase that first writes to them.

CREATE TABLE IF NOT EXISTS user_profile (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  memory_enabled  BOOLEAN NOT NULL DEFAULT 1,
  settings_json   TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id                      TEXT PRIMARY KEY,
  created_at              TEXT NOT NULL,
  ended_at                TEXT,
  session_memory_enabled  BOOLEAN NOT NULL DEFAULT 1,
  incognito               BOOLEAN NOT NULL DEFAULT 0,
  agent_id                TEXT DEFAULT 'jarvis',
  metadata_json           TEXT
);

CREATE TABLE IF NOT EXISTS turns (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id),
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content          TEXT NOT NULL,
  agent_id         TEXT DEFAULT 'jarvis',
  refined          BOOLEAN DEFAULT 0,
  memory_retrieved TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_turns_session_created ON turns(session_id, created_at DESC);
