# JARVIS Memory — `/goal` Playbook

> Copy-paste `/goal` commands for building the JARVIS memory module in Claude Code, phase by phase (M0 → M4), plus running tips.
>
> **Session rules live in [`../../CLAUDE.md`](../../CLAUDE.md)** — read it first. It governs autonomy, the secrets you must ask before touching, allowed paths, and build discipline (one phase at a time, minimal diff, voice latency is sacred).
>
> Authoritative specs this file is derived from: [`../../goal.md`](../../goal.md) (phases A–G / M0–M4, on-disk layout), [`../specs/memory.md`](../specs/memory.md) (five-layer model, schemas, orchestrator), [`../specs/MEMORY_IMPLEMENTATION_PLAN.md`](../specs/MEMORY_IMPLEMENTATION_PLAN.md) (exact files, endpoints, exit criteria).

---

## Before you start (once per session)

Run these once at the top of a fresh Claude Code session before your first `/goal`:

```
/config permissionMode=acceptEdits
```

```
/effort high
```

- **`permissionMode=acceptEdits`** — auto-accepts file edits so the build doesn't stall on every write. Reversible build steps, tests, and routine commands proceed without prompting (per `CLAUDE.md` autonomy rule).
- **`/effort high`** — maximum reasoning for a long, multi-file build. Use `xhigh`/`max` only if a phase gets stuck.
- **Permissions note:** `acceptEdits` does **not** grant read access to secrets. Per `CLAUDE.md`, always let Claude **ASK** before reading `.env`, API keys, tokens, `.cursor/aidocs/do-not-commit/`, or any `*-key.md` / `*secret*` / `*credential*` file. Never echo secrets into chat, commits, or Obsidian notes. If prompts get noisy for safe read-only commands, run `/fewer-permission-prompts` (see tips).

---

## Phase M0 — Backend scaffold + conversation memory

**Goal:** turns survive a browser refresh. Nothing else about how JARVIS behaves changes.

```
/goal Build Phase M0 of the JARVIS memory module per MEMORY_IMPLEMENTATION_PLAN.md §1 and goal.md Phase A. Stand up the first Python backend this repo has ever had, wire conversation persistence, and keep working until ALL exit criteria pass.

Scope (do only M0 — do NOT start M1+):
1. Create runtime/ as a sibling to app/ using uv: `uv init runtime && uv add fastapi "uvicorn[standard]" pydantic aiosqlite python-multipart`.
2. Write runtime/db/schema.sql with ONLY three tables: user_profile, sessions, turns (exact DDL from MEMORY_IMPLEMENTATION_PLAN.md §1.1, including CHECK constraints and idx_turns_session_created). Do NOT create turns_archive, tool_runs, or sync_files yet.
3. Implement runtime/main.py (FastAPI) with these endpoints and a stable response envelope:
   - GET  /api/memory/health        -> { sqlite: bool } (chroma/vault/sync fields return null until M2)
   - POST /api/sessions             -> { sessionId }   body { sessionMemoryEnabled, incognito }
   - DELETE /api/sessions/{id}      -> 204
   - POST /api/memory/retrieve      -> { conversation: Turn[] } (semantic/episodic/procedural keys present but empty)
   - POST /api/memory/store         -> 204   body { sessionId, turn, agentId }
4. Add Vite proxy '/runtime' -> http://127.0.0.1:8000 in app/vite.config.ts (changeOrigin + strip /runtime prefix).
5. Create app/src/services/memory.ts: thin fetch client (createSession, endSession, retrieveMemory, storeTurn) shaped like services/whisper.ts — graceful failure returns empty/degraded, NEVER throws into the voice flow.
6. Wire app/src/hooks/useRealtimeConversation.ts: startConversation -> createSession (hold sessionIdRef); clearSession -> endSession + mint new session; processTurn -> storeTurn for user turn and again for assistant reply, fire-and-forget (.catch(() => {})). Leave the existing history slice logic unchanged (retrieval augmentation is M2).
7. Do NOT modify services/jarvis.ts think() in M0.
8. Add a runtime:dev script (`cd runtime && uv run uvicorn main:app --reload --port 8000`).

Exit criteria (verify each with tool output before claiming done):
1. GET /api/memory/health returns { sqlite: true } with the dev server running (verify via curl).
2. Kill the browser tab mid-conversation and reopen: turns are present in ~/jarvis/db/memory.db `turns` table (verify via sqlite3 query), even though UI state resets.
3. Voice pipeline latency is unaffected — turn storage is fire-and-forget, never awaited before speakText().
```

---

## Phase M1 — Memory Settings UI

**Goal:** memory is controllable the same way Voice / JARVIS / AI settings already are. Mostly copy-and-adapt.

```
/goal Build Phase M1 of the JARVIS memory module per MEMORY_IMPLEMENTATION_PLAN.md §2, memory.md §4, and goal.md Phase B. Make memory controllable at user/session level, matching the existing settings pattern. Keep working until ALL exit criteria pass.

Scope (do only M1 — assumes M0 is merged; do NOT start M2+):
1. Create app/src/stores/memory-settings-store.ts by copying jarvis-settings-store.ts line-for-line as the template (same schemaVersion + STORAGE_KEY + migrate() + useXSettings() hook pattern). Fields per memory.md §4.2 MemorySettings interface (memoryEnabled, per-layer toggles, conversationTurnLimit default 4, conversationRetentionDays default 30, semanticTopK, embeddingModel nomic-embed-text, vaultPath ~/jarvis/vault, etc.).
2. Migration: move (not duplicate) JarvisSettings.conversationMemory -> MemorySettings.conversationTurnLimit, gated on schemaVersion < 2, mirroring the existing ollamaModel migration in jarvis-settings-store.ts. Update the read site at useRealtimeConversation.ts (currently reads conversationMemory).
3. Create app/src/sections/MemorySettingsSheet.tsx by copying JarvisSettingsSheet.tsx structure. Sections per memory.md §4.3: Master, Session, Conversation, Semantic, Episodic, Procedural, Sync, Debug. Render Semantic/Episodic/Procedural/Sync controls but keep them disabled with a "ships in Phase M2/M3/M4" tooltip — do NOT hide them.
4. StatusBar: add a Memory button (Database or Layers icon from lucide-react) next to Voice/JARVIS/AI, same click -> sheet-open pattern. Wire it in App.tsx.
5. useRealtimeConversation.ts clearSession: read incognitoMode from the new store; if true, skip the endSession/createSession round trip entirely (no read, no write).
6. Health pills call GET /api/memory/health on sheet open and on a 30s interval while open, matching useServiceHealth.ts polling.

Exit criteria (verify each):
1. Toggling memoryEnabled OFF stops all /api/memory/* calls — verify zero requests to /runtime in the Network tab across a full conversation.
2. Settings persist across reload (localStorage is source of truth for M1; backend sync is optional here — do not over-build it before M2).
3. User can enable/disable memory globally, per layer, and per session from the sheet.
```

---

## Phase M2 — Semantic memory + sync

**Goal:** "How do I set up Docker for agents?" pulls in past notes. This is the phase with real new engineering — everything before it was plumbing.

```
/goal Build Phase M2 of the JARVIS memory module per MEMORY_IMPLEMENTATION_PLAN.md §3, memory.md §§3/6.3/7, and goal.md Phase C. Add semantic retrieval over the Obsidian vault with hash-based sync and orchestrator intent gating. Keep working until ALL exit criteria pass.

Scope (do only M2 — assumes M0+M1 merged; do NOT start M3+):
1. Dependencies: `uv add chromadb watchdog httpx`. `ollama pull nomic-embed-text`. Embeddings via Ollama /api/embeddings called directly at http://127.0.0.1:11434 (NOT through the Vite proxy — the proxy is browser-only).
2. Initialize ~/jarvis/vault with index.md, agents.md, and the folder skeleton (agents/, projects/, learnings/, wiki/, raw/, outputs/, runs/) per goal.md §5.4. Vault path is ~/jarvis/vault (NOT repo-relative — avoids git noise).
3. runtime/memory/semantic.py: Chroma PERSISTENT client pointed at runtime/chroma/ (a directory, not a file). Collection jarvis_vault. Chunk strategy: split on ## headings first, ~512 token max, 64 token overlap. Metadata { path, agent, created_at, content_hash, chunk_index }. Document id = vault-relative path.
4. runtime/memory/sync/: watcher.py (watchdog observer on the vault, 2s debounce), embedder.py (chunk + embed + upsert), state.py (sync/last_sync.json). Add the sync_files table via runtime/db/migrations/0002_semantic.sql. Implement the reconcile algorithm from memory.md §7.2 verbatim (hash compare -> re-embed changed only; handle rename/delete/Ollama-down).
5. runtime/memory/orchestrator.py: intent gating as a regex/keyword classifier first (question words, "last time"/"that note" references, research/setup/decision intents; skip greetings/vitals/"stop"/command-deck ops) — NOT an LLM call. Hard timeout 300ms on the Chroma query; on timeout proceed without semantic context.
6. Extend POST /api/memory/retrieve to populate the semantic block; add POST /api/memory/search (debug) and POST /api/memory/sync (manual reconcile).
7. Frontend: services/jarvis.ts think() calls /api/memory/retrieve before buildSystemPrompt(); add buildContextBlock() in lib/jarvis-prompt.ts inserted after persona/personality blocks and before the vitals block. Enable the MemorySettingsSheet Semantic section; wire the Debug section's test-query input to /api/memory/search.

Exit criteria (verify each via the Debug panel's retrieved-chunks preview, not by eyeballing the voice reply):
1. Ask "how do I set up Docker for agents" with learnings/containerization.md present in the vault -> response cites content from that note.
2. Stop Ollama mid-session -> JARVIS still answers from conversation memory only; the health pill shows Chroma/embedding degraded, not a hard error.
3. Edit a vault note in Obsidian while the app runs -> re-embedded within the 2s debounce window (verify via sync_files.embedded_at timestamp).
```

---

## Phase M3 — Episodic writes

**Goal:** the research-agent scenario in `memory.md` §3.3 runs end-to-end.

```
/goal Build Phase M3 of the JARVIS memory module per MEMORY_IMPLEMENTATION_PLAN.md §4, memory.md §§3.2/3.3/6.2, and goal.md Phase D. Let JARVIS write episodic notes into the vault and auto-embed them. Keep working until ALL exit criteria pass.

Scope (do only M3 — assumes M0–M2 merged; do NOT start M4+):
1. runtime/memory/episodic.py: write-only to agents/{agent_id}/{slug}.md. Never touch user-authored files; never delete; only append or create new dated files. Frontmatter must include jarvis_id (uuid4, generated HERE so it exists before the first embed pass), agent, session_id, created_at, tags, sources — per memory.md §6.2. agent_id defaults to 'jarvis' (no real multi-agent routing yet — that is Phase F).
2. Post-LLM write pipeline: hook the place services/jarvis.ts think() returns reply. After the reply, if the write is allowed (allowEpisodicWrite / agent context), call POST /api/memory/store with a flag that triggers episodic.py to write the note (memory.md §3.2 steps 3-4).
3. Auto-embed newly written notes: immediate high-priority embed queue so the note is queryable in Chroma within one sync cycle.

Exit criteria (verify each):
1. Trigger a research-flavored query -> a new .md file appears under agents/research/ (or agents/jarvis/) with correct frontmatter, and it shows up in a Chroma query within one sync cycle.
2. Edit that file afterward in Obsidian -> it is NOT silently overwritten by JARVIS on a later write. Confirm the jarvis_id dedup guards against duplicate writes and that no code path does anything but append/create on that path.
```

---

## Phase M4 — Procedural memory + archive

**Goal:** close out the schema and retention. Low urgency until the Tool Registry (main-roadmap Phase 3 / goal.md Phase F) exists to populate `tool_runs`.

```
/goal Build Phase M4 of the JARVIS memory module per MEMORY_IMPLEMENTATION_PLAN.md §5, memory.md §6.1, and goal.md Phase E. Ship the procedural schema/CRUD and the retention/archive job. Keep working until ALL exit criteria pass.

Scope (do only M4 — assumes M0–M3 merged):
1. Add the tool_runs table via runtime/db/migrations/0003_procedural.sql (exact DDL from memory.md §6.1) and runtime/memory/procedural.py with a working CRUD layer. Do NOT build a fake data generator — an empty, correctly-shaped table with CRUD is the right amount of "ready" until the Tool Registry lands.
2. Add the turns_archive table (migration) if not already present.
3. Retention/archive as an asyncio background task under uvicorn (NOT cron), daily interval:
   - turns older than conversationRetentionDays -> summarize via one LLM call (call Ollama directly on the Python side) -> insert into turns_archive -> delete raw rows.
   - tool_runs older than proceduralRetentionDays -> straight delete, no summarization.

Exit criteria (verify each):
1. Manually backdate a test session's created_at past the retention window and run the background task once -> turns move to turns_archive as a summary, raw rows are gone, and semantic search is unaffected (archive is not embedded).
```

---

## Tips while running

| Tip | How | Why |
|-----|-----|-----|
| **Watch context, then compact** | `/context` to see what's filling the window; `/compact` to summarize and free space | Long multi-file builds bloat the window. Compact between big steps, not mid-edit. |
| **Fewer permission prompts** | `/fewer-permission-prompts` | Scans transcripts for common read-only Bash/MCP calls and allowlists them in `.claude/settings.json`. Does NOT allowlist secret reads. |
| **Continue autonomously** | Just say "continue" (or let `/goal` keep going); avoid re-confirming reversible steps | `CLAUDE.md` grants autonomy for build steps, tests, edits, and routine commands — don't stall on them. |
| **Clear a goal** | `/goal clear` (also `stop`, `off`, `reset`, `cancel`) | Ends the active goal cleanly before starting the next phase. `/goal` with no arg shows the current/last goal. |
| **Obsidian vault path** | Point Obsidian at `~/jarvis/vault` (created in M2) | The runtime memory vault is `~/jarvis/vault`, separate from git-tracked repo docs in `.cursor/aidocs/`. Obsidian opens THIS, not the repo root. |

---

## Workflow note

- **One phase per `/goal`.** Run M0 to green, verify its exit criteria against real tool output (curl, `sqlite3`, Network tab), then move on.
- **`/goal clear` between phases.** Clear the previous goal before pasting the next phase's block so Claude isn't juggling two objectives.
- **Do NOT combine M0–M4 into a single `/goal`.** The phases have real dependencies (M1 needs M0's health endpoint; M3 needs M2's semantic sync; M4's procedural half waits on the Tool Registry). Combining them defeats the "one phase at a time, minimal diff" discipline in `CLAUDE.md` and makes exit criteria impossible to verify cleanly.
