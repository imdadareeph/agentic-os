-- Phase MF0 — cross-session profile facts (MEMORY_EVOLUTION_PLAN.md).
-- Version facts via superseded_by; never overwrite rows silently.

CREATE TABLE IF NOT EXISTS user_facts (
  id              TEXT PRIMARY KEY,
  fact_key        TEXT NOT NULL,
  value           TEXT NOT NULL,
  confidence      REAL NOT NULL DEFAULT 0.8,
  source_turn_id  TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  superseded_by   TEXT REFERENCES user_facts(id)
);
CREATE INDEX IF NOT EXISTS idx_user_facts_key ON user_facts(fact_key);
CREATE INDEX IF NOT EXISTS idx_user_facts_active ON user_facts(fact_key) WHERE superseded_by IS NULL;
