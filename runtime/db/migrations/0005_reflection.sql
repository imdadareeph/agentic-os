-- Phase M2.5 — reflection output (MEMORY_DECISION.md Stages 5-8).
-- The idle worker's dirty-turn pass classifies each turn, scores its importance,
-- and records a memory decision here. Deterministic; no LLM on this path.

CREATE TABLE IF NOT EXISTS memory_reflections (
  id              TEXT PRIMARY KEY,
  turn_id         TEXT NOT NULL,
  session_id      TEXT,
  role            TEXT,
  classifications TEXT NOT NULL,   -- JSON array of memory types
  importance      INTEGER NOT NULL,
  decision        TEXT NOT NULL,   -- ignore|session|short_term|episode|long_term|permanent
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reflections_turn ON memory_reflections(turn_id);
CREATE INDEX IF NOT EXISTS idx_reflections_decision ON memory_reflections(decision);
