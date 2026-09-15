# Memory Engine — Implementation Plan

> Executable plan for `memory.md`. Grounded in the actual repo state as of `main` — not a rewrite of the design, a build order for it.
>
> Prerequisite check done against the live code: `app/src/stores/jarvis-settings-store.ts`, `app/src/hooks/useRealtimeConversation.ts`, `app/src/services/jarvis.ts`, `app/src/lib/jarvis-prompt.ts`, `app/vite.config.ts`. No `runtime/` directory, no Python code, no `.rs` exists yet. `conversationMemory` (last-N turns) currently lives entirely in `jarvis-settings-store.ts` + React `turns[]` state — in memory, gone on refresh. This plan replaces that with the five-layer model, in the order M0 → M4 from `memory.md` §9.

---

## 0. What has to happen before M0

`memory.md` assumes a Python runtime exists. It doesn't. Task zero is the scaffold itself — everything in Phase M0 below is bigger than "SQLite schema," it's "stand up the first backend process this repo has ever had."

**Repo addition (sibling to `app/`):**

```
agentic-os/
├── app/                 # existing — untouched except vite.config.ts + a handful of service files
├── runtime/             # NEW
│   ├── pyproject.toml
│   ├── main.py
│   ├── memory/
│   │   ├── orchestrator.py
│   │   ├── working.py
│   │   ├── conversation.py
│   │   ├── semantic.py       # M2
│   │   ├── episodic.py       # M3
│   │   ├── procedural.py     # M4
│   │   ├── context_builder.py
│   │   └── sync/
│   │       ├── watcher.py    # M2
│   │       ├── embedder.py   # M2
│   │       └── state.py      # M2
│   ├── db/
│   │   ├── schema.sql
│   │   └── migrations/
│   └── models/
│       └── memory.py
```

**Toolchain decision (locking this now so it doesn't stall M0):** use `uv` for the Python env — it's already on the sandbox/dev machine (`/usr/local/bin/uv`), it's faster than `pip`/`venv`, and it pins with a lockfile the same way `package-lock.json` does for `app/`. `uv init runtime && uv add fastapi "uvicorn[standard]" pydantic aiosqlite python-multipart`.

Run command: `cd runtime && uv run uvicorn main:app --reload --port 8000`. Add this as `runtime:dev` — mirrors `voice:whisper` / `voice:check` conventions already in `app/package.json`. A root-level `package.json` script or a `just`/`Makefile` target is cheap groundwork so `npm run dev` (or one command) can eventually boot both frontend and runtime together.

---

## 1. Phase M0 — Backend scaffold + conversation memory

**Goal:** turns survive a refresh. Nothing else changes about how JARVIS behaves.

### 1.1 Schema (`runtime/db/schema.sql`)

Ship only the tables M0 needs — `user_profile`, `sessions`, `turns`. Do not create `turns_archive`, `tool_runs`, `sync_files` yet; they're dead weight until M2–M4 write to them, and an empty table with no writer is a maintenance trap, not a head start.

```sql
CREATE TABLE user_profile (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  memory_enabled  BOOLEAN NOT NULL DEFAULT 1,
  settings_json   TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE sessions (
  id                      TEXT PRIMARY KEY,
  created_at              TEXT NOT NULL,
  ended_at                TEXT,
  session_memory_enabled  BOOLEAN NOT NULL DEFAULT 1,
  incognito               BOOLEAN NOT NULL DEFAULT 0,
  agent_id                TEXT DEFAULT 'jarvis',
  metadata_json           TEXT
);

CREATE TABLE turns (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id),
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content          TEXT NOT NULL,
  agent_id         TEXT DEFAULT 'jarvis',
  refined          BOOLEAN DEFAULT 0,
  memory_retrieved TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_turns_session_created ON turns(session_id, created_at DESC);
```

Add the later tables (`turns_archive`, `tool_runs`, `sync_files`) as their own migration files right before the phase that needs them (`runtime/db/migrations/0002_semantic.sql`, `0003_procedural.sql`, etc.) — keeps each migration reviewable against one phase of work instead of one wall of DDL nobody remembers the reasoning for.

### 1.2 Endpoints (`runtime/main.py`)

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/memory/health` | → `{ sqlite: bool }` (chroma/vault/sync fields added in M2, return `null` until then so the frontend health pill has a stable shape from day one) |
| POST | `/api/sessions` | `{ sessionMemoryEnabled, incognito }` → `{ sessionId }` |
| DELETE | `/api/sessions/{id}` | → `204` |
| POST | `/api/memory/retrieve` | `{ sessionId, userMessage, agentId }` → `{ conversation: Turn[] }` (semantic/episodic/procedural fields added in later phases, always present but empty so the frontend contract doesn't churn) |
| POST | `/api/memory/store` | `{ sessionId, turn, agentId }` → `204` |

Keep the response envelope stable across phases (`conversation`, `semantic`, `episodic`, `procedural` keys always present, just empty until their phase ships) — this is the one decision that saves a frontend rewrite at M2 and M3.

### 1.3 Frontend wiring — exact touch points

This is the part `memory.md` leaves abstract. Concretely:

1. **`app/vite.config.ts`** — add to `serviceProxy`:
   ```ts
   '/runtime': {
     target: 'http://127.0.0.1:8000',
     changeOrigin: true,
     rewrite: (p: string) => p.replace(/^\/runtime/, ''),
   },
   ```
2. **New `app/src/services/memory.ts`** — thin fetch client: `createSession()`, `endSession(id)`, `retrieveMemory(sessionId, userMessage, agentId)`, `storeTurn(sessionId, turn, agentId)`. Same shape as existing `services/whisper.ts` / `services/voicebox.ts` (fetch + typed response, graceful failure → return empty/degraded result, never throw and break voice flow).
3. **`useRealtimeConversation.ts`**:
   - `startConversation()` → call `createSession()` once mic access succeeds, hold `sessionIdRef`.
   - `clearSession()` (currently just clears React state, line 446) → also call `endSession(sessionIdRef.current)` and mint a new session.
   - `processTurnRef.current` (line 271) → after `setTurns(prev => [...user turn])`, call `storeTurn()` for the user turn; after the assistant reply is set (line 338), `storeTurn()` again. Fire-and-forget with `.catch(() => {})` — a failed store must never block speech.
   - The `history` slice built from `turnsRef.current.slice(-memoryCount * 2)` (line 304-307) stays exactly as-is for M0. Retrieval augmentation is M2, not M0 — don't conflate "persist what already works" with "add new capability" in one PR.
4. **`services/jarvis.ts` `think()`** — no change in M0. Wiring `/api/memory/retrieve` into the system prompt is M2 (once there's something besides conversation history to retrieve). Calling it now to fetch back the same turns already in `turnsRef.current` is a round-trip with no payoff.

### 1.4 Exit criteria

- Kill the browser tab mid-conversation, reopen: last N turns for that session are gone from the UI (expected — UI state is still React) but present in `runtime/db/memory.db` `turns` table, queryable via `sqlite3`.
- `GET /api/memory/health` returns `{ sqlite: true }` with the dev server running.
- Voice pipeline latency unaffected — turn storage is fire-and-forget, never awaited before `speakText()`.

**Estimate: 3-4 days.** Most of it is the FastAPI skeleton and CORS/proxy plumbing, not the schema.

---

## 2. Phase M1 — Settings UI

**Goal:** memory is controllable the same way Voice/JARVIS/AI settings already are — this phase is almost pure copy-and-adapt, which is why it's fast.

### 2.1 `app/src/stores/memory-settings-store.ts`

Copy `jarvis-settings-store.ts` line-for-line as the template: same `schemaVersion` + `STORAGE_KEY` + `migrate()` + `useXSettings()` hook pattern (lines 1-118 of that file). Fields per `memory.md` §4.2. One migration to write on top of the copy-paste: `JarvisSettings.conversationMemory` (currently read at `useRealtimeConversation.ts:303`) → `MemorySettings.conversationTurnLimit`. Follow the existing precedent exactly — `jarvis-settings-store.ts` already has a migration for `ollamaModel` moving to `ai-settings-store.ts` (lines 44-55, 61-63). Do the same shape: `migrateConversationMemoryToMemorySettings()`, gated on `schemaVersion < 2`, called from `migrate()`.

### 2.2 `app/src/sections/MemorySettingsSheet.tsx`

Copy `JarvisSettingsSheet.tsx` structure/layout. Sections per `memory.md` §4.3 table (Master, Session, Conversation, Semantic, Episodic, Procedural, Sync, Debug). Semantic/Episodic/Procedural/Sync sections render but their controls are disabled with a "ships in Phase M2/M3/M4" tooltip until those phases land — don't hide them, since Imdad's own pattern (`showModelInStatusBar`, deprecated fields with `@deprecated` JSDoc) is to keep settings visible through the migration, not delete-then-readd.

### 2.3 Wiring

- `StatusBar` — add Memory button (`Database` or `Layers` icon from `lucide-react`, already a dependency) next to Voice/JARVIS/AI, same click → sheet-open pattern.
- `useRealtimeConversation.ts` `clearSession()` → read `incognitoMode` from the new store; if true, skip the `endSession`/`createSession` round trip entirely (no read, no write, per `memory.md`'s effective rule in §4.1).
- Health pills call `GET /api/memory/health` (from M0) on sheet open + on a 30s interval while open, matching `useServiceHealth.ts`'s existing polling pattern for Whisper/Voicebox.

### 2.4 Exit criteria

- Toggling `memoryEnabled` off in the sheet stops all `/api/memory/*` calls (verify via Network tab — zero requests to `/runtime` for a full conversation).
- Settings persist across reload (localStorage) and match what `GET /api/memory/settings` would echo once M0's `user_profile` row is kept in sync — for M1, localStorage is the source of truth; backend sync is optional here, don't over-build it before M2 needs it.

**Estimate: 2-3 days.**

---

## 3. Phase M2 — Semantic memory + sync

**Goal:** "How do I set up Docker for agents?" pulls in past notes. This is the phase with actual new engineering — everything before it was plumbing.

### 3.1 Dependencies

`uv add chromadb watchdog httpx`. Embeddings via Ollama's `/api/embeddings` endpoint (model: `nomic-embed-text`, per `memory.md` §11 decision) — call it directly at `http://127.0.0.1:11434`, not through the Vite proxy (the Python runtime talks to Ollama directly; the `/ollama` Vite proxy exists only for the browser).

### 3.2 `memory/semantic.py`

Chroma **persistent client** pointed at `runtime/chroma/` (a directory, per `memory.md`'s explicit correction in §1 — do not treat it as a single file). Collection `jarvis_vault`. Chunk strategy exactly as spec'd: split on `##` headings first, ~512 token max, 64 token overlap.

### 3.3 `memory/sync/watcher.py`

`watchdog` observer on the vault path (default `~/jarvis/vault`, per the §11 decision — repo-relative was explicitly rejected to avoid git noise). Debounce 2s on file events → hash compare against `sync_files` table → re-embed changed files only. Implement the reconcile algorithm from `memory.md` §7.2 verbatim — it's already correct pseudocode, don't redesign it.

### 3.4 `memory/orchestrator.py` — intent gating

This is the one piece of real judgment in the whole plan: deciding *when* to hit Chroma so voice latency doesn't degrade. Implement the trigger list from `memory.md` §3.1 as a regex/keyword classifier first (question words, "last time"/"that note" references, research/setup/decision intent words) — not an LLM call. An LLM-based intent classifier adds a second model round-trip before the real one; a keyword gate is near-zero latency and good enough to start. Revisit only if false-negative rate (skipping retrieval when it was actually needed) proves high in practice.

Hard timeout: 300ms for the Chroma query. On timeout, proceed without semantic context — never block the reply.

### 3.5 Frontend

- `services/jarvis.ts` `think()` — this is where `/api/memory/retrieve` finally gets called, before `buildSystemPrompt()`. Append the returned `semantic` block via a new `buildContextBlock()` in `lib/jarvis-prompt.ts`, inserted after persona/personality blocks and before the vitals block (`jarvis-prompt.ts` lines 69-71) — matches the ordering in `memory.md` §8.
- `MemorySettingsSheet.tsx` — enable the Semantic section controls; wire the Debug section's test-query input to `POST /api/memory/search`.

### 3.6 Exit criteria (from `memory.md` §10, made concrete)

- Ask "how do I set up Docker for agents" with `learnings/containerization.md` present in the vault → response cites content from that note (check via the Debug panel's retrieved-chunks preview, not by eyeballing the voice reply).
- Stop Ollama mid-session → JARVIS still answers using conversation memory only; settings health pill shows Chroma/embedding degraded, not a hard error.
- Edit a vault note in Obsidian while the app is running → re-embedded within the 2s debounce window (verify via `sync_files.embedded_at` timestamp).

**Estimate: 4-5 days** — the orchestrator gating logic and the watcher's edge cases (file renamed, file deleted, Ollama down mid-embed) are where time actually goes, not the Chroma calls themselves.

---

## 4. Phase M3 — Episodic writes

**Goal:** the research-agent scenario in `memory.md` §3.3 runs end-to-end.

### 4.1 `memory/episodic.py`

Write-only to `agents/{agent_id}/{slug}.md` unless `allowAgentWrites` + an explicit `projects/`/`learnings/` override is set (§6.2 rule: agents never touch user-authored files, never delete, only append or create new dated files). Frontmatter includes `jarvis_id` (uuid4) for dedup on re-embed — generate it here, not in the sync layer, so the ID exists before the first embed pass ever sees the file.

### 4.2 Post-LLM write pipeline

Hook into the same place `services/jarvis.ts` currently returns `reply` from `think()` — after the reply, if `agentId === 'research'` and `allowEpisodicWrite` is on, call `POST /api/memory/store` with a flag that triggers `episodic.py` to write the note (per the write flow in `memory.md` §3.2, steps 3-4). Since there's no multi-agent routing yet (Phase 4), `agent_id` is just a field set to `'jarvis'` by default per §11's decision to defer real agent routing — this phase writes the plumbing, not the agent logic.

### 4.3 Exit criteria

- Trigger a research-flavored query → a new `.md` file appears under `agents/research/` with correct frontmatter, and it shows up in a Chroma query within one sync cycle.
- Editing that file afterward in Obsidian does not get silently overwritten by JARVIS on a later write (verify the `jarvis_id` dedup guards against duplicate writes, and confirm no code path calls anything but append/create on that path).

**Estimate: 2-3 days.**

---

## 5. Phase M4 — Procedural memory + archive

**Goal:** close out the schema; low urgency until Phase 3's tool registry exists to populate `tool_runs`.

### 5.1 What ships now vs. later

Ship the `tool_runs` table and `procedural.py` CRUD now (cheap, ~half a day) but there's genuinely nothing to populate it until the Tool Registry (Phase 3 of the main roadmap, separate from these M-phases) exists. Don't build a fake data generator to make the table look alive — an empty, correctly-shaped table with a working CRUD layer is the right amount of "ready."

### 5.2 Retention/archive

`asyncio` background task (not cron — the process is already long-running under `uvicorn`), daily interval: turns older than `conversationRetentionDays` → summarize via one LLM call (reuse `chatWithActiveProvider`-equivalent on the Python side, or just call Ollama directly) → insert into `turns_archive` → delete raw rows. Same for `tool_runs` past `proceduralRetentionDays`, straight delete, no summarization needed there.

### 5.3 Exit criteria

- Manually backdate a test session's `created_at` past the retention window, run the background task once → turns move to `turns_archive` as a summary, raw rows gone, semantic search unaffected (archive isn't embedded).

**Estimate: 2-3 days**, most of it being "wait for Phase 3" rather than active work.

---

## 6. Sequencing

```
M0 (3-4d) ──▶ M1 (2-3d) ──▶ M2 (4-5d) ──▶ M3 (2-3d) ──▶ M4 (2-3d, partly blocked on Phase 3 tools)
   │                            │
   └─ unblocks nothing else     └─ unblocks M3 (episodic writes need something to embed against)
```

M0 and M1 can't overlap much — M1's settings sheet needs M0's health endpoint to exist for the status pills to mean anything. M2 is the long pole. M3 is genuinely blocked on M2 (an episodic write with no semantic sync is just a file nobody queries). M4's procedural half is blocked on the separate Tool Registry roadmap item, not on this memory work — don't let it stall the rest of M4 (archive/retention ships independently).

**Total: ~3-4 weeks of focused work**, assuming Phase 3's tool registry lands in parallel rather than before.

---

## 7. Decisions locked (no longer "open" — per `memory.md` §11, deciding now so M0 doesn't stall)

| Decision | Locked to |
|---|---|
| Vector store | Chroma (persistent client, directory-based) |
| Embed model | Ollama `nomic-embed-text` |
| Vault location | `~/jarvis/vault` (not repo-relative) |
| Agent routing | Single `jarvis` agent_id field, no real routing until Phase 4 |
| `conversationMemory` migration | Move (not duplicate) into `MemorySettings.conversationTurnLimit`, same pattern as the existing `ollamaModel` migration |
| Python env tool | `uv` (already installed, matches the speed/lockfile bar `package-lock.json` sets for `app/`) |

## 8. Immediate next step

`uv init runtime`, add the M0 dependency set, write `schema.sql` with just `user_profile` / `sessions` / `turns`, get `GET /api/memory/health` returning `{ sqlite: true }` over the new `/runtime` Vite proxy. That's the whole first PR — everything else in this plan depends on that round trip existing.
