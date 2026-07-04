-- Phase M4 — procedural memory + conversation archive.

-- Tool execution log. Populated once the Tool Registry (roadmap Phase 3) ships;
-- the table + CRUD exist now so nothing has to change when tools land.
CREATE TABLE IF NOT EXISTS tool_runs (
  id           TEXT PRIMARY KEY,
  session_id   TEXT,
  agent_id     TEXT NOT NULL DEFAULT 'jarvis',
  tool_name    TEXT NOT NULL,
  input_json   TEXT,
  output_json  TEXT,
  success      BOOLEAN NOT NULL,
  duration_ms  INTEGER,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tool_runs_tool ON tool_runs(tool_name, created_at DESC);

-- Cold conversation summaries. Turns past the retention window are summarized
-- here and their raw rows deleted.
CREATE TABLE IF NOT EXISTS turns_archive (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  summary       TEXT NOT NULL,
  turn_count    INTEGER NOT NULL,
  period_start  TEXT NOT NULL,
  period_end    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
