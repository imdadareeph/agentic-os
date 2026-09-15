# JARVIS Memory — Design & Implementation Plan

> Detailed plan for short-term and long-term memory in Agentic OS, including settings UI, schemas, sync logic, and when JARVIS reads/writes each layer.
>
> Aligns with `docs/reference/overview.md` (Python-first runtime) and existing settings patterns in `app/src/sections/*SettingsSheet.tsx`.

---

## 1. Feasibility of the proposed stack

**Verdict: feasible and well-scoped.** The five-layer model maps cleanly to real storage boundaries. Nothing here requires exotic infrastructure — but it **does require a Python backend**. The browser cannot own SQLite file locks, Chroma, or Obsidian vault writes reliably.

| Layer | Your proposal | Feasibility | Notes |
|-------|---------------|-------------|-------|
| **Working Memory** | In-process, volatile | ✅ **Now (partial)** | Already exists as React `turns[]` + refs in `useRealtimeConversation`. Formalize on backend when agents land. |
| **Conversation Memory** | SQLite, 30-day retention | ✅ **High** | Straightforward. Replaces today’s `conversationMemory: 4` slice from in-memory turns only. |
| **Episodic Memory** | Obsidian vault | ✅ **High** | Human-readable, editable, fits your Obsidian workflow. Needs path config + frontmatter convention. |
| **Semantic Memory** | Chroma embeddings | ✅ **High** | Good local choice. Use **Chroma persistent client** (`chromadb` Python) — storage is a **directory**, not a single `chroma.db` file. |
| **Procedural Memory** | SQLite tool logs | ✅ **Medium** | Easy schema; value arrives when tools/agents exist (Phase 3). Ship schema early, populate later. |

### What already exists (do not rebuild)

| Today | Location | Gap |
|-------|----------|-----|
| Last-N turns in prompt | `jarvis-settings-store` → `conversationMemory` | In-memory only; lost on refresh; not SQLite |
| Turn list in UI | `useRealtimeConversation` → `turns` | Same session, no persistence |
| System prompt assembly | `lib/jarvis-prompt.ts` → `buildChatMessages` | No retrieval block yet |
| NEW SESSION | `RightPanel` → `clearSession()` | Clears UI only; no backend session |

### Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Voice latency if retrieval is slow | Hard timeout (e.g. 300ms semantic, 50ms conversation); reply without retrieved context on timeout |
| Obsidian ↔ Chroma drift | `last_sync.json` + file watcher + periodic full reconcile |
| User edits note while agent writes | Write to `agents/` namespace; frontmatter `jarvis_id`; never overwrite user notes without merge |
| Browser-only phase | Phase 1 can proxy to Python runtime; do not put `memory.db` in `localStorage` |
| Chroma size growth | Embed only `agents/`, `learnings/`, selected `projects/` — exclude `.obsidian/`, attachments |

### Small corrections to the proposed layout

```
jarvis/
  ├── vault/                 # Obsidian vault (episodic)
  │   ├── agents/
  │   ├── projects/
  │   ├── learnings/
  │   └── .obsidian/
  ├── db/
  │   └── memory.db          # SQLite: conversations, turns, tool_logs, sync_meta
  ├── chroma/                # Chroma persistent store (directory, not a single file)
  └── sync/
      └── last_sync.json     # Per-file embed state
```

---

## 2. Memory model — short vs long term

### Short-term memory (fast, always considered first)

| Layer | Storage | Lifetime | Purpose |
|-------|---------|----------|---------|
| **Working Memory** | Backend in-process dict + React mirror | Current request / session | `current_task`, `current_agent`, active tool calls, retrieved chunk IDs |
| **Conversation Memory (hot)** | SQLite `turns` + React cache | Session + 30 days | Last N turns for continuity; pronoun resolution (“that”, “the Docker thing”) |

**Short-term = everything needed to complete the current exchange without search.**

### Long-term memory (retrieval on demand)

| Layer | Storage | Lifetime | Purpose |
|-------|---------|----------|---------|
| **Conversation Memory (archive)** | SQLite `turns_archive` | After 30 days → compressed summaries | Historical chat without full prompt bloat |
| **Episodic Memory** | Obsidian markdown | Permanent | Tasks, decisions, learnings — human editable |
| **Semantic Memory** | Chroma | Until note deleted | Similarity search over vault content |
| **Procedural Memory** | SQLite `tool_runs` | Permanent (configurable prune) | What tools ran, outcomes, reusable patterns |

**Long-term = search, reference, and write-back — not every turn loads all layers.**

---

## 3. When JARVIS uses memory

Memory is not “always on full blast.” A **Memory Orchestrator** (Python) decides per request.

### 3.1 Decision flow (pre-LLM)

```
User message received
        │
        ▼
┌───────────────────┐
│ Master switch off │──yes──► Skip all memory → LLM (system + user only)
│ (user settings)   │
└─────────┬─────────┘
          │ no
          ▼
┌───────────────────┐
│ Session memory off│──yes──► Skip persistence reads; working mem only
└─────────┬─────────┘
          │ no
          ▼
┌───────────────────────────────────────────────────────────┐
│ WORKING MEMORY — always (if session active)               │
│  · session_id, agent_id, phase, last_intent               │
└─────────┬─────────────────────────────────────────────────┘
          ▼
┌───────────────────────────────────────────────────────────┐
│ CONVERSATION MEMORY — if layer enabled                    │
│  · Load last N turns from SQLite (N = user setting)       │
│  · Skip if user said "forget this" / incognito session    │
└─────────┬─────────────────────────────────────────────────┘
          ▼
┌───────────────────────────────────────────────────────────┐
│ SEMANTIC MEMORY — if layer enabled AND query warrants it  │
│  Triggers:                                                │
│   · question words (how, what, why, where, explain)       │
│   · reference to past work ("last time", "that note")     │
│   · research / setup / decision intents                   │
│  Skip: greetings, vitals, "stop", pure command deck ops   │
│  · Chroma top-k (default 3), max token budget for chunks  │
└─────────┬─────────────────────────────────────────────────┘
          ▼
┌───────────────────────────────────────────────────────────┐
│ EPISODIC MEMORY — if semantic hit OR agent is research    │
│  · Load full note bodies for Chroma hits (not just chunks)│
│  · Optional: load today’s daily note for context          │
└─────────┬─────────────────────────────────────────────────┘
          ▼
┌───────────────────────────────────────────────────────────┐
│ PROCEDURAL MEMORY — if tools enabled AND retry/debug      │
│  · "how did we do X before" → query tool_runs             │
└─────────┬─────────────────────────────────────────────────┘
          ▼
    buildContextBlock() → inject into system prompt
          ▼
         LLM
```

### 3.2 Post-LLM write flow

```
LLM response complete
        │
        ▼
┌───────────────────┐
│ Session memory off│──yes──► No writes (except optional working mem clear)
└─────────┬─────────┘
          │ no
          ▼
1. Store user + assistant turn → SQLite (conversation)
2. Update working memory (task state, retrieved_ids)
3. If agent == research AND user setting allowEpisodicWrite:
     → Write Obsidian note under agents/{agent}/{slug}.md
4. If episodic write OR vault file changed:
     → Queue Chroma embed (sync worker)
5. If tool was invoked:
     → Append tool_runs row (procedural)
```

### 3.3 Example scenario (your Docker query)

**User:** “How do I set up Docker for agents?”

| Step | Layer | Action |
|------|-------|--------|
| 1 | Working | `current_task = "research:docker-setup"`, `current_agent = "research"` |
| 2 | Conversation | Last 4 turns from SQLite appended to messages |
| 3 | Semantic | Chroma query → `learnings/containerization.md`, `agents/research/docker-notes.md` |
| 4 | LLM | System + history + retrieved excerpts → answer |
| 5 | Episodic | Write `agents/research/docker-setup-2026-07-04.md` with findings |
| 6 | Sync | Embed new note → Chroma collection `jarvis_vault` |
| 7 | Conversation | Store turn with `memory_retrieved = ["containerization.md", ...]` metadata |

---

## 4. Settings — three control levels

Follow the same pattern as Voice / JARVIS / AI settings: `memory-settings-store.ts` + `MemorySettingsSheet.tsx` + StatusBar entry.

### 4.1 Control hierarchy

```
┌─────────────────────────────────────────────────────────┐
│ USER LEVEL (localStorage + backend user_profile row)    │
│  Persists across sessions and app restarts              │
│  · memoryEnabled (master)                               │
│  · per-layer toggles: conversation, semantic, episodic, │
│    procedural                                           │
│  · vault path, retention days, embed model, top-k       │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ SESSION LEVEL (backend session record + React state)    │
│  Scoped to one conversation; NEW SESSION resets         │
│  · sessionMemoryEnabled (override: use memory this chat)│
│  · sessionId (uuid)                                     │
│  · incognitoMode (no reads, no writes)                  │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ JARVIS / REQUEST LEVEL (per turn, optional)             │
│  Fine control at prompt-build time                      │
│  · injectConversation (default from layer toggle)       │
│  · injectSemantic (default from layer + intent)           │
│  · allowEpisodicWrite (agent writes Obsidian)           │
│  · conversationTurnLimit (overrides user default for     │
│    this session only)                                   │
└─────────────────────────────────────────────────────────┘
```

**Effective rule:** a layer is used only if `memoryEnabled && layerEnabled && sessionMemoryEnabled && !incognitoMode`.

### 4.2 `MemorySettings` schema (frontend store)

```typescript
// app/src/stores/memory-settings-store.ts
export const MEMORY_SETTINGS_SCHEMA_VERSION = 2   // v2 adds the Memory Budget block

export interface MemorySettings {
  schemaVersion: number

  // User level — master
  memoryEnabled: boolean

  // User level — layers
  conversationMemoryEnabled: boolean
  semanticMemoryEnabled: boolean
  episodicMemoryEnabled: boolean
  proceduralMemoryEnabled: boolean

  // User level — conversation
  conversationTurnLimit: number          // default 4 (replaces jarvis conversationMemory long-term)
  conversationRetentionDays: number      // default 30

  // User level — semantic
  semanticTopK: number                   // default 3
  semanticMinScore: number               // default 0.65
  semanticMaxTokens: number              // default 800 (injected excerpt budget)
  embeddingProvider: 'ollama' | 'openai' // default ollama
  embeddingModel: string                 // default nomic-embed-text

  // User level — episodic
  vaultPath: string                      // default ~/jarvis/vault or repo-relative
  allowAgentWrites: boolean              // agents may create notes under agents/
  episodicNamespace: string              // default agents/

  // User level — procedural
  proceduralRetentionDays: number        // default 90

  // User level — sync
  autoSyncEnabled: boolean               // watch vault → Chroma
  syncIntervalMinutes: number            // default 15 (fallback poll)

  // User level — Memory Budget (v2): resource ceilings for retrieval + idle work
  workingMemoryMb: number                // default 512 (advisory in-process cap)
  sessionContextTokens: number           // default 8192 (total inject budget/turn)
  maxRetrievedMemories: number           // default 25 (primary retrieve cap; bounds semanticTopK)
  maxParallelMemoryJobs: number          // default 3 (idle-worker concurrency)
  maxBackgroundCpuPercent: number        // default 20 (advisory idle throttle)
  maxBackgroundGpuPercent: number        // default 30 (advisory idle throttle)
  dailyReflectionMinutes: number         // default 15 (reflection time budget/day)
  embeddingBudgetPerDay: number          // default 500 (hard embed cap/day)

  // Session defaults (applied on NEW SESSION; stored in session, not here)
  // sessionMemoryEnabled → backend POST /sessions
  // incognitoMode → backend POST /sessions
}
```

**Migration:** deprecate `JarvisSettings.conversationMemory` → read from `MemorySettings.conversationTurnLimit` when memory backend is online; keep fallback for offline mode. v1 → v2 back-fills the Memory Budget fields from defaults (the `{ ...defaults, ...stored }` merge in `migrate()`).

**Budget overlap resolution:**

- `maxRetrievedMemories` is the **primary retrieve cap** — the runtime fetches `min(semanticTopK, maxRetrievedMemories)` and `context_builder` injects at most `maxRetrievedMemories` hits. `semanticTopK` stays as the per-query knob; the UI shows "capped to N" when it exceeds the budget.
- `semanticMaxTokens` is the per-excerpt budget; `sessionContextTokens` is the **total** inject budget. `context_builder` drops lowest-score chunks first until the block fits `sessionContextTokens`.

### 4.2.1 Dirty-flag idle processing (deferred memory work)

Heavy memory work never runs on the voice path. Writes flag rows dirty and return immediately; a bounded idle worker processes them only when the user is inactive (`VOICE_INTERRUPT.md` FR-10):

```
modified → dirty = true → user active → system idle → workers process dirty only → dirty = false
```

- **Writes** (`store_turn`, vault edits via the watcher, episodic notes) set `dirty = 1` (`turns.dirty`, `sync_files.dirty`).
- **Activity** — `retrieve`, `store`, and `POST /api/memory/heartbeat` call `idle.touch()`.
- **Idle worker** (`runtime/memory/jobs.py`) runs when `idle.is_idle()` (default 20s quiet): re-embeds dirty vault files (bounded by `maxParallelMemoryJobs` + `embeddingBudgetPerDay`) and reflects on dirty turns (bounded by `dailyReflectionMinutes`), throttled by `maxBackgroundCpuPercent`. It re-checks idle between every job and stands down the instant the user returns.
- **Heartbeat** — the frontend fires `sendHeartbeat(budget)` per turn to keep the activity clock warm and mirror the budget into the runtime.

### 4.3 Memory Settings UI (`MemorySettingsSheet.tsx`)

Mirror `JarvisSettingsSheet` / `AiSettingsSheet` structure:

| Section | Controls |
|---------|----------|
| **Master** | Enable memory (master switch), status pills (SQLite / Chroma / Vault / Sync) |
| **Session** | “Memory for this session” toggle, Incognito (no read/write), Clear session memory button |
| **Conversation** | Enable layer, turn limit slider (0–20), retention days |
| **Memory Budget** | Session context tokens, max retrieved memories, working memory MB, parallel idle jobs, background CPU/GPU caps, daily reflection minutes, embedding budget/day |
| **Semantic** | Enable layer, top-k (capped to max retrieved memories), min score, max inject tokens, embedding model |
| **Episodic (Obsidian)** | Enable layer, vault path picker, allow agent writes, open vault folder |
| **Procedural** | Enable layer, retention days (disabled until tools ship) |
| **Sync** | Auto-sync toggle, interval, “Sync now” button, last sync time, pending files count |
| **Debug** | Preview last retrieval (chunks + scores), test query input |

**StatusBar:** add **Memory** button (icon: `Database` or `Layers`) next to Voice / JARVIS / AI.

**Health checks:** `GET /api/memory/health` → `{ sqlite, chroma, vault, sync, lastSyncAt }`.

---

## 5. Backend architecture

### 5.1 Service layout (Python)

```
runtime/
  main.py                    # FastAPI app
  memory/
    orchestrator.py          # decide read/write per request
    working.py               # in-process session state
    conversation.py          # SQLite CRUD + archive job
    semantic.py              # Chroma query + embed
    episodic.py              # Obsidian read/write
    procedural.py            # tool_runs CRUD
    context_builder.py       # format blocks for LLM
    sync/
      watcher.py             # watchdog on vault/
      embedder.py            # chunk + embed + upsert
      state.py               # last_sync.json read/write
  db/
    schema.sql
    migrations/
  models/
    memory.py                # Pydantic request/response types
```

### 5.2 API contract (React ↔ runtime)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/memory/health` | Layer health for settings UI |
| `GET` | `/api/memory/settings` | User memory profile (sync with localStorage) |
| `PUT` | `/api/memory/settings` | Update user profile |
| `POST` | `/api/sessions` | Create session `{ sessionMemoryEnabled, incognitoMode }` |
| `DELETE` | `/api/sessions/{id}` | Clear session working + optional conversation |
| `POST` | `/api/memory/retrieve` | `{ sessionId, userMessage, agentId }` → context block |
| `POST` | `/api/memory/store` | `{ sessionId, turn, agentId, retrievedIds }` |
| `POST` | `/api/memory/sync` | Trigger manual vault → Chroma sync |
| `POST` | `/api/memory/search` | Debug semantic search from settings UI |

**Vite proxy:** add `/runtime` → `http://127.0.0.1:8000` in `vite.config.ts`.

### 5.3 Frontend integration points

| File | Change |
|------|--------|
| `services/jarvis.ts` → `think()` | Before LLM: `POST /api/memory/retrieve`; merge context into system prompt |
| `hooks/useRealtimeConversation.ts` | On session start: `POST /api/sessions`; on turn: store via API; `clearSession` → `DELETE` |
| `lib/jarvis-prompt.ts` | Add `buildContextBlock(retrieval)` appended after system instructions |
| `App.tsx` | Wire `MemorySettingsSheet`, StatusBar handler |
| `stores/memory-settings-store.ts` | New store (pattern copy from `jarvis-settings-store.ts`) |

---

## 6. Schema design

### 6.1 SQLite (`memory.db`)

```sql
-- User-level preferences (mirrors localStorage; backend is source of truth when online)
CREATE TABLE user_profile (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  memory_enabled  BOOLEAN NOT NULL DEFAULT 1,
  settings_json   TEXT NOT NULL,              -- full MemorySettings blob
  updated_at      TEXT NOT NULL
);

-- Sessions
CREATE TABLE sessions (
  id                      TEXT PRIMARY KEY,   -- uuid
  created_at              TEXT NOT NULL,
  ended_at                TEXT,
  session_memory_enabled  BOOLEAN NOT NULL DEFAULT 1,
  incognito               BOOLEAN NOT NULL DEFAULT 0,
  agent_id                TEXT DEFAULT 'jarvis',
  metadata_json           TEXT
);

-- Conversation turns (hot)
CREATE TABLE turns (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  agent_id        TEXT DEFAULT 'jarvis',
  refined         BOOLEAN DEFAULT 0,
  memory_retrieved TEXT,                      -- JSON array of source paths
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_turns_session_created ON turns(session_id, created_at DESC);
CREATE INDEX idx_turns_created ON turns(created_at);

-- Archive (cold conversation summaries)
CREATE TABLE turns_archive (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  summary         TEXT NOT NULL,
  turn_count      INTEGER NOT NULL,
  period_start    TEXT NOT NULL,
  period_end      TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

-- Procedural / tool memory
CREATE TABLE tool_runs (
  id              TEXT PRIMARY KEY,
  session_id      TEXT,
  agent_id        TEXT NOT NULL,
  tool_name       TEXT NOT NULL,
  input_json      TEXT,
  output_json     TEXT,
  success         BOOLEAN NOT NULL,
  duration_ms     INTEGER,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_tool_runs_tool ON tool_runs(tool_name, created_at DESC);

-- Sync metadata (backup to last_sync.json)
CREATE TABLE sync_files (
  path            TEXT PRIMARY KEY,           -- vault-relative path
  content_hash    TEXT NOT NULL,
  embedded_at     TEXT NOT NULL,
  chunk_count     INTEGER NOT NULL DEFAULT 0
);
```

**Retention job (daily cron / asyncio task):**

- Turns older than `conversationRetentionDays` → summarize → `turns_archive` → delete raw turns
- `tool_runs` older than `proceduralRetentionDays` → delete

### 6.2 Obsidian note convention (episodic)

Path: `agents/{agent_id}/{slug}.md`

```yaml
---
jarvis_id: "550e8400-e29b-41d4-a716-446655440000"
agent: research
session_id: "abc-123"
created_at: 2026-07-04T12:00:00Z
tags: [jarvis, research, docker]
sources: ["learnings/containerization.md"]
---
# Docker setup for agents

## Summary
...

## Findings
...

## Sources
- ...
```

**Rules:**

- Agents write only under `agents/` unless user enables `projects/` or `learnings/`
- Never delete user files — append or create new dated files
- `jarvis_id` in frontmatter dedupes re-embeds

### 6.3 Chroma (semantic)

```python
# Collection: jarvis_vault
# Document ID: vault-relative path (e.g. "learnings/containerization.md")
# Metadata: { path, agent, created_at, content_hash, chunk_index }
# Embedding: via Ollama nomic-embed-text or configured model

# Chunk strategy:
#   - split on headings (##) first
#   - max chunk ~512 tokens
#   - overlap 64 tokens
```

### 6.4 Sync state (`sync/last_sync.json`)

```json
{
  "version": 1,
  "last_full_sync": "2026-07-04T11:30:00Z",
  "embedding_model": "nomic-embed-text",
  "files": {
    "learnings/containerization.md": {
      "content_hash": "sha256:abc...",
      "embedded_at": "2026-07-04T11:30:00Z",
      "chunk_count": 4
    }
  },
  "pending": [],
  "errors": []
}
```

---

## 7. Sync logic (Obsidian ↔ Chroma)

### 7.1 Triggers

| Trigger | Action |
|---------|--------|
| Agent writes new `.md` | Immediate embed queue (high priority) |
| `watchdog` detects vault change | Debounce 2s → hash compare → embed if changed |
| Periodic poll (`syncIntervalMinutes`) | Scan `agents/`, `learnings/`, `projects/` |
| Manual “Sync now” in settings | Full reconcile |
| App startup | Quick reconcile: pending queue + stale check |

### 7.2 Reconcile algorithm

```
for each markdown file in watched_dirs (exclude .obsidian):
  hash = sha256(file contents)
  if hash == sync_files[path].content_hash:
    continue  # unchanged
  if file deleted:
    chroma.delete(path)
    remove sync_files[path]
    continue
  chunks = chunk_markdown(file)
  embeddings = embed(chunks)
  chroma.upsert(id=path, chunks, embeddings, metadata)
  sync_files[path] = { hash, embedded_at, chunk_count }
  write last_sync.json
```

### 7.3 Conflict handling

| Case | Behavior |
|------|----------|
| User edits note JARVIS also wrote | Hash change → re-embed; JARVIS never overwrites on read |
| User deletes note | Next sync removes from Chroma |
| Embed fails (Ollama down) | Add to `pending[]` in last_sync.json; settings UI shows warning |
| Model change (`embeddingModel`) | Full re-embed all files (one-time migration flag) |

---

## 8. Context injection format (LLM)

Append to system prompt (after JARVIS persona, before vitals):

```markdown
## Retrieved Memory
Use the following only if relevant. Do not mention retrieval unless asked.

### Recent conversation
[turn summaries if beyond hot window]

### Relevant notes
**learnings/containerization.md** (score 0.82)
> excerpt...

**agents/research/docker-notes.md** (score 0.71)
> excerpt...

### Prior tool usage
- docker.run (2026-07-01): success — launched whisper container
```

Token budget enforced in `context_builder.py` — truncate lowest-score chunks first.

---

## 9. Implementation phases

### Phase M0 — Backend scaffold (week 1)

- [ ] FastAPI app + `/api/memory/health`
- [ ] SQLite schema + migrations
- [ ] `POST /api/sessions`, `POST /api/memory/retrieve` (conversation only)
- [ ] Vite proxy `/runtime`

**Exit:** JARVIS persists turns across refresh; last-N loaded from SQLite.

### Phase M1 — Settings UI (week 1–2)

- [ ] `memory-settings-store.ts` + `MemorySettingsSheet.tsx`
- [ ] StatusBar Memory button + health pills
- [ ] Session toggles wired to `NEW SESSION` / conversation start
- [ ] Migrate `conversationMemory` from Jarvis settings

**Exit:** User can enable/disable memory globally, per layer, per session.

### Phase M2 — Semantic + sync (week 2–3)

- [ ] Chroma persistent client + Ollama embeddings
- [ ] Vault watcher + `last_sync.json`
- [ ] Intent gating in orchestrator (when to query Chroma)
- [ ] Debug search in settings UI

**Exit:** “How do I set up Docker…” retrieves past notes.

### Phase M3 — Episodic writes (week 3–4)

- [ ] Obsidian writer with frontmatter
- [ ] Post-LLM write pipeline for research agent
- [ ] Auto-embed on write

**Exit:** Full scenario from §3.3 works end-to-end.

### Phase M4 — Procedural + archive (week 4+)

- [ ] `tool_runs` populated when tool registry ships
- [ ] Retention/archive cron
- [ ] Conversation summaries in archive table

**Exit:** Long-term memory complete; ready for multi-agent handoffs.

---

## 10. Testing checklist

| Test | Expected |
|------|----------|
| Master memory off | No SQLite read/write; voice still works |
| Session incognito | Reads skipped; writes skipped; UI shows indicator |
| NEW SESSION | New `session_id`; old session turns not in hot context |
| 30-day retention job | Old turns archived; semantic unchanged |
| Vault edit in Obsidian | Re-embed within debounce window |
| Chroma offline | JARVIS answers with conversation only; settings shows degraded |
| Voice latency | Retrieve completes < 300ms p95 or skips semantic |

---

## 11. Open decisions (you choose)

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Vector store | Chroma vs Qdrant | **Chroma** for local zero-config; matches your plan |
| Embed model | Ollama `nomic-embed-text` vs API | **Ollama** — stays local-first |
| Vault location | Repo-relative vs `~/jarvis/vault` | **`~/jarvis/vault`** — avoids git noise |
| Agent routing | Single JARVIS vs research agent now | **Single JARVIS** with `agent_id` field until Phase 4 |
| Deprecate `conversationMemory` in Jarvis settings | Move vs duplicate | **Move** to Memory settings; one slider |

---

## 12. Summary

| Question | Answer |
|----------|--------|
| Is the 5-layer design feasible? | **Yes** — correct separation of concerns |
| Biggest prerequisite? | **Python runtime** — memory cannot live in the browser |
| Short-term memory | Working + hot conversation (SQLite + in-process) |
| Long-term memory | Archive + Obsidian + Chroma + tool logs |
| Settings | User (persistent) → Session (per chat) → Request (orchestrator) |
| When JARVIS uses it | Gated by switches + intent; not every layer every turn |
| Sync | Hash-based Obsidian → Chroma with watcher + manual reconcile |

**Next concrete step:** Phase M0 — FastAPI + SQLite conversation memory + wire `think()` to retrieve/store.

---

## Related docs

- [`../reference/overview.md`](../reference/overview.md) — project status and Python-first runtime decision
- [`../../app/README.md`](../../app/README.md) — JARVIS voice setup
- [`../reference/AUTHOR.md`](../reference/AUTHOR.md) — author context and collaboration preferences
