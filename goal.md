# Agentic OS — Project Goal

> **North star:** Build a **local-first AI operating system** where **JARVIS** is the voice interface into persistent memory, knowledge, tools, and agents — not a disposable chat session.
>
> _Living document. Synthesized from `docs/reference/overview.md`, `docs/specs/memory.md`, `docs/specs/MEMORY_IMPLEMENTATION_PLAN.md`, `.cursor/aidocs/docs/`, and a local stack audit on 2026-07-04._

---

## 1. What we are building

**Agentic OS** is an event-driven runtime + **Mission Control** UI. The LLM is one component. The durable value is:

| Pillar | Outcome |
|--------|---------|
| **Voice** | Talk to JARVIS naturally; low-latency, deterministic feedback |
| **Memory** | Short- and long-term recall across sessions — the **keystone** of this project |
| **Knowledge (Obsidian vault)** | Human-readable Markdown as source of truth; agents read/write under rules |
| **Tools & agents** | Registry, plugins, multi-agent workflows (later phases) |
| **Observability** | Live vitals, session state, execution logs — Mission Control, not a chat box |

**Today:** JARVIS voice command center (React + Vite) is real and polished.  
**Next:** Python memory runtime + Obsidian vault + semantic retrieval wired into every JARVIS turn.  
**Later:** Tool registry, automation, optional Rust/Tauri desktop shell.

---

## 2. Definition of done (project-level)

The project reaches its first major milestone when a user can:

1. **Speak to JARVIS** in Chrome/Edge with Whisper refinement (optional) and Ollama or Anthropic as brain.
2. **Close the browser**, reopen, and **continue the same conversation** (SQLite conversation memory).
3. **Ask about past work** (“How did we set up Docker for agents?”) and get answers grounded in **Obsidian notes** (Chroma semantic search).
4. **See JARVIS write structured notes** under `agents/` after research-style turns, with notes visible and editable in Obsidian.
5. **Control memory** at user, session, and layer level via a **Memory Settings** sheet (same UX pattern as Voice / JARVIS / AI settings).
6. **Run everything locally** — no cloud dependency for core voice + memory + vault (Anthropic optional upgrade path).

Until memory ships, Agentic OS remains a strong **voice demo**; with memory, it becomes an **OS**.

---

## 3. Current state (verified)

### ✅ Shipped

| Area | Status | Location |
|------|--------|----------|
| Voice pipeline | Live STT, Whisper refine, TTS, push-to-talk + conversation mode | `app/src/hooks/`, `app/src/services/voice.ts` |
| Multi-provider LLM | Ollama, Anthropic, Gemini via Vite proxy | `app/src/services/llm/` |
| JARVIS + AI settings | Persona, model, temperature, last-N turns (in-memory only) | `app/src/stores/`, `app/src/sections/*SettingsSheet.tsx` |
| Mission Control HUD | Vitals, neural sphere, command deck, status bar | `app/src/sections/` |
| Live vitals | YouTube, Instagram, Ollama metrics | `app/server/fetch-vitals.ts` |
| Dev orchestration | `./run.sh` starts Ollama + JARVIS (restarts if already running) | `run.sh` |

### ⚠️ Partial / placeholder

| Area | Gap |
|------|-----|
| Conversation memory | Last-N turns in `localStorage` + React state — **lost on refresh** |
| Command deck | Most buttons decorative; only INBOX-BRIEF / METRICS-PULL / NEW SESSION partially wired |
| Directives & documents | Static mock data |
| Backend runtime | **No `runtime/` directory yet** — no FastAPI, no SQLite memory DB, no Chroma |
| Obsidian context | Repo has `.obsidian/` but JARVIS does not inject vault context yet |

### 🔬 Local stack audit (2026-07-04)

| Service | Port | Status | Notes |
|---------|------|--------|-------|
| **Ollama** | 11434 | ✅ Online | Models: `llama3.2:latest` (default brain), `gemma4`, `llava:7b`, others |
| **Ollama chat test** | — | ✅ Pass | `llama3.2:latest` responds correctly |
| **JARVIS UI** | 3000 | Start via `./run.sh` | Vite dev server + API proxies |
| **Whisper STT** | 9000 | ✅ Online | **Not** from this repo’s `docker-compose.voice.yml` — a **separate project** runs an equivalent Whisper container on `:9000`. Do not start a second instance. |
| **Voicebox** | 17493 | Optional | STT/TTS fallback when enabled in Voice Settings |
| **Memory runtime** | 8000 | ❌ Not built | Target: FastAPI `runtime/` |
| **Chroma** | — | ❌ Not installed | Planned: `chromadb` in Python runtime |
| **Embeddings** | — | ❌ Pending | Pull `nomic-embed-text` via Ollama for M2 |
| **uv (Python)** | — | ✅ v0.7.13 | Use for `runtime/` env |

---

## 4. LLM providers for JARVIS

### Primary: Ollama (local)

- **Default active provider** in AI Settings.
- **Proxy:** `/ollama` → `http://127.0.0.1:11434` (`app/vite.config.ts`).
- **Recommended model:** `llama3.2:latest` (installed, chat-verified).
- **Deep thinking:** enable for reasoning models (`think` mode) in JARVIS Settings.
- **No API key required.**

### Secondary: Anthropic (optional cloud)

- **Proxy:** `/anthropic` → `https://api.anthropic.com`.
- **API key:** configure in **AI Settings** (stored in browser `localStorage`). For local dev reference only, see `.cursor/aidocs/do-not-commit/anthropic-key.md` — **never commit keys**.
- **Registry default model:** `claude-sonnet-4-20250514` (`app/src/config/ai-providers.ts`).
- **Key doc test model:** `claude-sonnet-4-6` — verify the model string in AI Settings matches an account-enabled model.
- **Health check:** AI Settings → Anthropic panel → online/offline pill (uses minimal `/v1/messages` probe).
- **Use when:** local Ollama is slow, unavailable, or you need stronger reasoning for memory summarization / archival jobs.

### Gemini

- Available via `/gemini` proxy; API key in AI Settings. Lower priority than Ollama + Anthropic for this milestone.

### Provider testing checklist

- [ ] AI Settings → Ollama → health green, model selected (`llama3.2:latest`).
- [ ] JARVIS Settings → Test prompt returns a reply with Ollama active.
- [ ] AI Settings → Anthropic → paste key from do-not-commit file → health green.
- [ ] Switch active provider to Anthropic → JARVIS test prompt succeeds.
- [ ] Status bar shows `Brain: <provider> · <model>` when enabled.

---

## 5. Memory — the keystone

Memory is the **primary engineering goal** after voice. It transforms JARVIS from a stateless assistant into an OS that **remembers, retrieves, and writes back**.

Full design: **`docs/specs/memory.md`**. Build order: **`docs/specs/MEMORY_IMPLEMENTATION_PLAN.md`**.

### 5.1 Five-layer model

| Layer | Storage | Lifetime | Role |
|-------|---------|----------|------|
| **Working** | Python in-process + React mirror | Current request | `current_task`, `agent_id`, retrieved chunk IDs |
| **Conversation (hot)** | SQLite `turns` | Session + 30 days | Last N turns; replaces in-memory `conversationMemory` |
| **Conversation (archive)** | SQLite `turns_archive` | After retention | Summarized history |
| **Episodic** | Obsidian Markdown | Permanent | Tasks, decisions, learnings — **human editable** |
| **Semantic** | Chroma vectors | Until note deleted | Similarity search over vault |
| **Procedural** | SQLite `tool_runs` | Configurable | Tool outcomes (populated when tool registry ships) |

**Prerequisite:** Memory **cannot** live in the browser alone. A **Python FastAPI runtime** owns SQLite file locks, Chroma, vault writes, and sync workers.

### 5.2 When JARVIS uses memory

Not every layer, every turn. An orchestrator gates reads/writes:

```
User message
  → master switch off? → skip all
  → session incognito? → skip persistence
  → working memory (always if session active)
  → conversation (if enabled) — last N from SQLite
  → semantic (if enabled + intent match) — Chroma top-k, 300ms timeout
  → episodic (if semantic hit or research agent) — full note bodies
  → procedural (if tools + debug intent)
  → buildContextBlock() → system prompt → LLM
```

After reply: store turn → optional Obsidian write → queue Chroma embed.

### 5.3 Settings hierarchy

| Level | Controls |
|-------|----------|
| **User** | `memoryEnabled`, per-layer toggles, vault path, retention, embed model, top-k |
| **Session** | `sessionMemoryEnabled`, `incognitoMode` — reset on NEW SESSION |
| **Request** | Orchestrator overrides (intent gating, write permissions) |

UI: `MemorySettingsSheet.tsx` + StatusBar **Memory** button (mirror Voice / JARVIS / AI pattern).

### 5.4 On-disk layout (target)

```
~/jarvis/                          # recommended — avoids git noise
├── vault/                         # Obsidian vault (episodic + knowledge)
│   ├── agents/                    # JARVIS/agent writes (default namespace)
│   ├── projects/
│   ├── learnings/
│   ├── wiki/                      # curated knowledge (Karpathy pattern)
│   ├── raw/                       # captures / imports
│   ├── outputs/                   # deliverables
│   ├── runs/                      # execution logs
│   ├── index.md                   # root navigation map
│   ├── agents.md                  # vault conventions for JARVIS
│   └── .obsidian/
├── db/
│   └── memory.db                  # SQLite
├── chroma/                        # Chroma persistent directory
└── sync/
    └── last_sync.json             # embed state / pending queue
```

**Note:** This repo (`agentic-os/`) currently holds **project docs** and has a `.obsidian/` folder for authoring PRDs/specs. The **runtime memory vault** should live at **`~/jarvis/vault`** (or user-configured path) — separate from git-tracked source code.

---

## 6. Obsidian — use it properly

Obsidian is the **memory surface for humans**, not the runtime engine. See `.cursor/aidocs/docs/VAULT_CONCEPT.md`.

### Principles

1. **Vault = folder of Markdown** — no special server required; Obsidian is optional UI.
2. **`index.md` at every meaningful level** — highest-leverage file; mall-directory navigation for agents.
3. **`agents.md` at vault root** — conventions, folder map, write rules (equivalent to CLAUDE.md in other setups).
4. **Karpathy pipeline:** `raw/` → `wiki/` → `outputs/` with `runs/` for loop logs.
5. **JARVIS writes only under `agents/`** by default — never overwrite user notes; use frontmatter `jarvis_id` for dedup.
6. **Ignore when embedding:** `.obsidian/`, attachments, templates (configurable patterns).
7. **Sync:** hash-based Obsidian → Chroma reconcile; file watcher + 15 min poll + manual “Sync now”.

### Obsidian note frontmatter (episodic writes)

```yaml
---
jarvis_id: "<uuid>"
agent: research
session_id: "<session-uuid>"
created_at: 2026-07-04T12:00:00Z
tags: [jarvis, research]
sources: ["learnings/containerization.md"]
---
```

### Open in Obsidian

Point Obsidian at `~/jarvis/vault` (once created). The agentic-os repo docs remain in `.cursor/aidocs/` for engineering specs; the **runtime vault** holds operational memory.

---

## 7. Local infrastructure

### What `./run.sh` manages

| Service | Action |
|---------|--------|
| Ollama | Kill if running → restart → `:11434` |
| JARVIS | Kill if running → `npm run dev` → `:3000` |
| Whisper | **Status only** — expects external Docker on `:9000` |
| Voicebox / GitNexus | **Status only** — optional |

### What `./run.sh` will manage (after memory runtime ships)

Add to `run.sh` (or `run-memory.sh`):

```bash
cd runtime && uv run uvicorn main:app --reload --port 8000
```

Vite proxy entry (planned):

```ts
'/runtime': { target: 'http://127.0.0.1:8000', changeOrigin: true, rewrite: ... }
```

### Docker policy

| Component | Policy |
|-----------|--------|
| **`docker-compose.voice.yml` in this repo** | **Do not use** — Whisper already provided by another project on `:9000` |
| Whisper | Shared external instance; JARVIS reaches it via Vite `/whisper` proxy |
| Chroma | Embedded Python persistent client — **no Docker** |
| Ollama | Native install (`ollama serve`) |

### Open-source stack (all local)

| Tool | Purpose | Install |
|------|---------|---------|
| [Ollama](https://ollama.com) | LLM + embeddings | `ollama pull llama3.2` + `ollama pull nomic-embed-text` |
| [ChromaDB](https://github.com/chroma-core/chroma) | Vector store | `uv add chromadb` in `runtime/` |
| [FastAPI](https://fastapi.tiangolo.com) | Memory API | `uv add fastapi uvicorn` |
| [watchdog](https://github.com/gorakhargosh/watchdog) | Vault file watcher | `uv add watchdog` |
| [Obsidian](https://obsidian.md) | Vault UI | Desktop app → open `~/jarvis/vault` |
| [Whisper ASR webservice](https://github.com/ahmetoner/whisper-asr-webservice) | STT refine | External Docker (existing `:9000`) |
| [Voicebox](https://github.com/jianfch/voicebox) | Optional STT/TTS | Local `:17493` |

### Related local project: Agent-Monitor

Separate codebase: `/Users/imdadareeph/Desktop/ai-projects/Agent-Monitor`  
Shared DB path: `~/.claude/agent-dashboard/dashboard.db`

Use Agent-Monitor for **Claude Code session observability**; Agentic OS for **JARVIS voice + memory**. Avoid running two writers against the same SQLite file without coordination.

---

## 8. Implementation roadmap

Aligned with `docs/specs/MEMORY_IMPLEMENTATION_PLAN.md` and `docs/reference/overview.md`.

### Phase A — Memory runtime scaffold (M0) ← **START HERE**

**Goal:** Turns survive browser refresh.

- [ ] Create `runtime/` with `uv init`, FastAPI, `aiosqlite`
- [ ] Ship SQLite schema: `user_profile`, `sessions`, `turns`
- [ ] Endpoints: `/api/memory/health`, `/api/sessions`, `/api/memory/retrieve`, `/api/memory/store`
- [ ] Vite proxy `/runtime` → `:8000`
- [ ] `app/src/services/memory.ts` — fetch client, graceful degradation
- [ ] Wire `useRealtimeConversation.ts`: createSession, storeTurn (fire-and-forget), clearSession
- [ ] Add `runtime:dev` script

**Exit:** Kill tab mid-chat → turns in `~/jarvis/db/memory.db`; voice latency unchanged.

### Phase B — Memory settings UI (M1)

- [ ] `memory-settings-store.ts` + `MemorySettingsSheet.tsx`
- [ ] StatusBar Memory button + health pills
- [ ] Migrate `JarvisSettings.conversationMemory` → `MemorySettings.conversationTurnLimit`
- [ ] Session incognito + NEW SESSION behavior

### Phase C — Semantic + sync (M2)

- [ ] `uv add chromadb watchdog httpx`
- [ ] `ollama pull nomic-embed-text`
- [ ] Initialize `~/jarvis/vault` with `index.md`, `agents.md`, folder skeleton
- [ ] Chroma collection `jarvis_vault` + Ollama embeddings
- [ ] Vault watcher + `last_sync.json` reconcile
- [ ] Orchestrator intent gating + 300ms retrieval timeout
- [ ] Wire `jarvis.ts` `think()` → `/api/memory/retrieve` → `buildContextBlock()`

**Exit:** “How do I set up Docker for agents?” retrieves `learnings/containerization.md`.

### Phase D — Episodic writes (M3)

- [ ] `memory/episodic.py` — write under `agents/{agent_id}/`
- [ ] Post-LLM write pipeline after `think()` returns
- [ ] Auto-embed on new notes

### Phase E — Procedural + archive (M4)

- [x] `tool_runs` table + daily retention/archive task
- [x] Conversation summarization into `turns_archive`
- [x] `proceduralMemoryEnabled` actually gates `tool_runs` logging (was UI-only until 2026-07-05; `MemorySettingsSheet` section un-gated from stale `phase="M4"` lock)

### Phase E.5 — Memory Budget + dirty-idle processing (M2.5)

**Goal:** resource ceilings for memory; heavy work deferred off the voice path.

- [x] Memory Budget settings (v2 schema) + `MemorySettingsSheet` "Memory Budget" section
- [x] `turns.dirty` / `sync_files.dirty` tracking + `0004_dirty.sql` migration
- [x] `runtime/memory/idle.py` (activity clock) + `runtime/memory/jobs.py` (bounded idle worker)
- [x] Wire idle worker into `main.py` lifespan; `POST /api/memory/heartbeat`
- [x] Budget flows to retrieve/`context_builder` (`maxRetrievedMemories`, `sessionContextTokens`)
- [x] `VOICE_INTERRUPT.md` FR-10 (deferred memory during active voice)

**Exit:** turns/vault edits flag dirty and are embedded/reflected only while idle; voice latency unchanged.

### Phase MV — Memory Galaxy View

**Goal:** navigable left-panel entry point + full-page 3D visualization of the Obsidian vault as a star field. Spec: [`docs/plans/memory-view.md`](docs/plans/memory-view.md).

- [x] `LeftPanel.tsx` "Mission Links" strip below System Vitals (Memory Galaxy live, Agents/Tools/Vault Browser stubbed)
- [x] `react-router` `Routes` in `App.tsx` — `/` unchanged, `/memory` → `MemoryGalaxyPage`
- [x] `GET /api/memory/graph` (`runtime/memory/graph.py`) — vault walk, `[[wikilinks]]` + frontmatter `sources:` edges, `sync_files` recency, capped + `truncated` flag
- [x] `app/src/services/memory.ts` `fetchMemoryGraph()` — graceful degradation, on-demand only
- [x] `MemoryGalaxyPage.tsx` + `MemoryGalaxyScene.tsx` — `@react-three/fiber` star field, brightness ∝ recency, size ∝ link degree, orbit/zoom/click, pausable auto-flight
- [x] Empty/offline states; Recent/Notes/Galaxy tabs stubbed "soon" (MV.2)

**Exit:** `curl /api/memory/graph` returns real vault data; `/memory` renders the galaxy; graph never fetched during a voice conversation; `npm run runtime:test` + app typecheck pass.

### Phase F — Tools, agents, Command Deck (project Phases 3–4)

- [x] Python event bus (`runtime/tools/events.py`, SSE `/api/tools/events`)
- [x] Tool registry — memory/system/filesystem/git/docker/terminal/browser/mcp/skill (T0–T3, `runtime/tools/registry.py`)
- [x] Wire Command Deck buttons to real skills (T3/T4: METRICS-PULL, PLAN-TODAY, AM-REPORT, TREND-SCAN, GH-TRENDING, WK-REVIEW)
- [x] Multi-agent routing (T4: `agent_policies.py` scopes the catalog by `agent_id`; `research` agent gets `memory.search`/`browser.search`/`memory.episodic.write`/`agent.research.run`)
- [x] Skill loader (T4: `~/jarvis/skills/*.yaml|json` manifests, `POST /api/tools/register`, `POST /api/tools/skills/reload`)
- [x] Composite tools: `skill.plan_today`, `skill.am_report` (deterministic, allow+fast), `agent.research.run` (search + vault write in one approval, ask+slow)
- [x] Ollama tool-calling support alongside Anthropic (`runtime/tools/loop.py`) — the project's default provider can now actually run the loop
- [x] Ack-then-async voice contract for approval-gated tools (`jarvis.ts` speaks the ack before waiting on the dialog/execution, never blocks first `speakText()`)
- [x] Incognito mode disables tools, not just memory (`areToolsActive()`)

### Phase G — Desktop shell (optional)

- [ ] Rust/Tauri host for packaging, permissions, process supervision
- [ ] Python runtime remains AI layer unless hot paths need rewrite

---

## 9. Architecture target (near-term)

```
Browser — JARVIS Mission Control (React 19 + Vite)
        │  REST + WebSocket (future)
        ▼
Python runtime (FastAPI + asyncio)          ← BUILD NOW
  ├── memory/orchestrator.py
  ├── memory/conversation.py  → SQLite
  ├── memory/semantic.py      → Chroma
  ├── memory/episodic.py      → Obsidian vault
  └── memory/sync/            → watcher + embedder
        │
        ├── Ollama :11434       (LLM + embeddings)
        ├── Whisper :9000       (external Docker — shared)
        └── Voicebox :17493     (optional)

Obsidian ←→ ~/jarvis/vault (human edits, agent writes)
```

Long-term docs (`ARCHITECTURE.md`, `ROADMAP.md`) mention Rust + Qdrant + Neo4j. **Decision (`docs/reference/overview.md`): Python-first for Phases 2–4.** Revisit Rust when desktop packaging is the bottleneck.

---

## 10. Success metrics

| Metric | Target |
|--------|--------|
| Voice round-trip (no semantic) | No regression vs today |
| Memory retrieve p95 | < 300ms or skip semantic |
| Turn persistence | 100% of turns stored when memory enabled |
| Vault sync lag | Re-embed within 2s debounce after Obsidian save |
| Provider failover | Ollama down → user can switch to Anthropic in settings |
| Local-only path | Full memory loop works with Ollama + Chroma + Obsidian, no cloud |

---

## 11. Constraints & decisions (locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime language (now) | **Python (FastAPI)** | Best agent/RAG ecosystem; fastest path to memory |
| Vector store | **Chroma** (local persistent) | Zero-config, matches memory.md |
| Embed model | **Ollama `nomic-embed-text`** | Stays local-first |
| Vault location | **`~/jarvis/vault`** | Avoids git noise; Obsidian opens one canonical path |
| Whisper Docker | **External `:9000`** | Do not run repo `docker-compose.voice.yml` |
| Agent routing (now) | **Single JARVIS** | `agent_id` field ready; multi-agent later |
| API keys | **AI Settings localStorage** | Never in repo; reference do-not-commit files locally |
| Deprecate `conversationMemory` | **Move to Memory settings** | One slider, one source of truth |

---

## 12. Immediate next actions

1. **Run JARVIS:** `./run.sh` → open http://localhost:3000
2. **Verify Ollama** in AI Settings (`llama3.2:latest`)
3. **Verify Anthropic** in AI Settings (key from do-not-commit file; confirm model string)
4. **Scaffold `runtime/`** — Phase M0 from `docs/specs/MEMORY_IMPLEMENTATION_PLAN.md`
5. **Create vault skeleton** at `~/jarvis/vault` with `index.md` + `agents.md`
6. **Pull embed model:** `ollama pull nomic-embed-text`
7. **Keep Whisper** on existing `:9000` — do not duplicate Docker

---

## 13. Related documents

| Document | Purpose |
|----------|---------|
| [`docs/README.md`](docs/README.md) | Documentation index |
| [`docs/reference/overview.md`](docs/reference/overview.md) | What’s built vs aspirational; Python-first decision |
| [`docs/specs/memory.md`](docs/specs/memory.md) | Full memory design, schemas, sync, settings |
| [`docs/specs/MEMORY_IMPLEMENTATION_PLAN.md`](docs/specs/MEMORY_IMPLEMENTATION_PLAN.md) | Executable M0–M4 build order |
| [`docs/specs/TOOLS.md`](docs/specs/TOOLS.md) | Tool registry, loop, permissions, T0–T4 |
| [`docs/specs/CONVERSATION_AGENTS.md`](docs/specs/CONVERSATION_AGENTS.md) | Agent architecture (Tool Router, Permission Agent) |
| [`docs/playbooks/claude_tools_goals.md`](docs/playbooks/claude_tools_goals.md) | Copy-paste `/goal` commands for tools T0–T4 |
| [`.cursor/aidocs/docs/VAULT_CONCEPT.md`](.cursor/aidocs/docs/VAULT_CONCEPT.md) | Obsidian vault philosophy (Chase AI / Karpathy) |
| [`.cursor/aidocs/docs/PRD.md`](.cursor/aidocs/docs/PRD.md) | Product requirements |
| [`.cursor/aidocs/docs/ARCHITECTURE.md`](.cursor/aidocs/docs/ARCHITECTURE.md) | Engine layout (long-term) |
| [`.cursor/aidocs/docs/ROADMAP.md`](.cursor/aidocs/docs/ROADMAP.md) | UI + backend phase list |
| [`app/README.md`](app/README.md) | JARVIS voice setup |
| [`run.sh`](run.sh) | Local dev orchestration |

---

## 14. One-line goal

**Give JARVIS a body (voice), a brain (Ollama/Anthropic), and a memory (Obsidian + SQLite + Chroma) — all running locally, with Obsidian as the durable, human-readable layer agents and users share.**
