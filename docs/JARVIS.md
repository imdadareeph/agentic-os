# J.A.R.V.I.S.

## What it is

`goal.md` calls it a *"local-first AI operating system where JARVIS is the voice interface into persistent memory, knowledge, tools, and agents."* Five pillars: **Voice** (the interaction surface), **Memory** (the keystone — nothing else matters if it forgets you), **Knowledge** (your Obsidian vault), **Tools & agents** (what it can actually do, not just say), **Observability** (you can always see what it's doing and why).

Today it's a voice command center (React + Vite) talking to a growing Python memory runtime. Not finished — being built phase by phase (M0–M4 memory, T0–T4 tools) inside this repo.

## Capabilities & responsibilities

Definition-of-done, from `goal.md`:

- Speak to it (Chrome mic / Whisper) and hear it back (Ollama local model, or Anthropic/Gemini when routed there)
- Remember the conversation across sessions — every turn persisted to SQLite, not just kept in a React state that dies on refresh
- Answer questions from your own notes — semantic search over the Obsidian vault via Chroma embeddings
- Write structured notes back into the vault under `agents/` — it's not just a reader, it journals
- Let you steer all of the above from a Memory Settings sheet, not a config file you have to go find

The UI is framed as a **Mission Control HUD**: vitals, a neural sphere, a command deck, a status bar — the metaphor is a cockpit, not a chat window.

## Who you are to it

There's a profile layer (`runtime/memory/profile.py`) that extracts durable facts about you from conversation — deterministic pattern rules, not vibes: "my name is X" → `identity/name`, "call me X" → same, "I prefer X" / "always/don't use X" → `preferences/*`. Stored in a `user_facts` table (SQLite, `runtime/db/migrations/0006_user_facts.sql`) with a `confidence` and `superseded_by` column — new facts version over old ones, nothing silently overwrites what you told it before. Exposed at `GET /api/memory/profile`.

So: you're not an anonymous session. You're a small, growing, versioned dossier of facts it pulls into context — name, preferences, stack conventions — the same way a person remembers what you've told them, not by re-reading a settings file.

## The glowing sphere

`app/src/components/NeuralSphere.tsx` — a React Three Fiber particle field (`ParticleSphere`, 4000 particles, radius 3.5) with bloom post-processing. It cycles through a 10-color glow palette (gold, amber, cyan, violet, pink, green…) and its size/opacity/bloom intensity react live to `isSpeaking`, `isPaused`, and voice `volume` props — it's not decoration, it's the voice state made visible. Sits in `CenterPanel.tsx`, the literal center of the HUD layout (`LeftPanel` / `CenterPanel` / `RightPanel` / `StatusBar`).

## Memory & the Memory Galaxy

Five layers (`docs/specs/memory.md`):

| Layer | Storage | What it holds |
|---|---|---|
| Working | in-process / React | current turn |
| Conversation | SQLite | session history |
| Episodic | Obsidian vault (markdown) | journaled notes |
| Semantic | Chroma (persistent) | embeddings for recall |
| Procedural | SQLite | tool-use logs |

On disk: `~/jarvis/vault/` (the actual Obsidian vault), `~/jarvis/db/memory.db`, `~/jarvis/chroma/`, `~/jarvis/sync/last_sync.json`.

The **Memory Galaxy** (`app/src/pages/MemoryGalaxyPage.tsx`) is the visual front end onto all of that: four tabs — Recent (last 12), Notes, Graph (live), Galaxy (3D) — rendering a `MemoryGalaxyScene` plus a `VaultNotePanel` for reading a note in place. Backed by `memory.ts`'s `fetchMemoryGraph` / `fetchVaultNote` / `getMemoryHealth`. Its own settings live in `MemorySettingsSheet.tsx`.

## Settings & configuration

Five independent stores under `app/src/stores/` — `jarvis-`, `ai-`, `voice-`, `memory-`, `tool-settings-store.ts` — each with its own sheet in `app/src/sections/`. Settings partial-merge over defaults (per root `CLAUDE.md`: the store only holds what you've *changed*; a derived store merges it with defaults via `ts-deepmerge`), versioned with a `schemaVersion` + migrator per bump so old saved settings don't break on update.

`app/src/config/services.ts` centralizes service wiring — Ollama base URL, GitNexus base + an explicit `GITNEXUS_ENABLED` flag (default off, so a dead :4747 doesn't spam proxy errors), and the default JARVIS system prompt (persona: concise, confident, calm, 1–3 sentences — it isn't supposed to monologue at you).

## Obsidian vault access

Two separate paths, deliberately not merged:

1. **Direct filesystem** (`runtime/memory/*` — episodic writes, `vault_read.py` for reads) — this is the real path. Reads/writes `~/jarvis/vault` directly, works even if the Obsidian app isn't running. `vault_read.py` guards path traversal (rejects `..` segments, requires `.md`) and is only used for the Memory Galaxy note preview — never on the voice-latency path.
2. **Local REST API** (`obsidian_client.py`, config in `obsidian_config.py`) — used *only* as a health-check dot in the UI. Self-signed TLS, so `verify=False` is intentional there. Tri-state result: not-configured / up / down.

This is exactly the split that caused the vault-switch bug documented in `docs/plans/OBSIDIAN_VAULT_SWITCH_FIX.md` — the REST API config (`~/jarvis/obsidian.json`) is a second cache of credentials that can drift from whichever vault is actually open, independent of the MCP server's own config in `~/.claude.json`.

## GitNexus access

Currently frontend-only: `config/services.ts` proxies `/gitnexus` → `:4747`, and `services/gitnexus.ts`'s `checkGitNexusHealth` feeds a status dot in `StatusBar.tsx` and the voice settings sheet. No Python runtime tool-handler wires into it yet — it's a passive "is it up" indicator, not a callable tool for JARVIS itself (yet). Separately, this whole repo is GitNexus-indexed for *Claude Code's* own code intelligence (`.gitnexus/`, per root `CLAUDE.md`) — that's a dev-tooling layer, not something JARVIS the assistant persona uses.

## How it's built

- **Frontend**: React + Vite (not SvelteKit/Tauri — that's a different, unrelated project). Pages under `app/src/pages/` (`Home.tsx`, `MemoryGalaxyPage.tsx`), layout split into `LeftPanel` / `CenterPanel` / `RightPanel` / `StatusBar` / `FeatureShowcase`.
- **Voice**: `app/src/hooks/useRealtimeConversation.ts` drives the mic-in → transcribe → LLM → speak loop that the sphere visualizes.
- **Backend**: Python, FastAPI (`runtime/main.py`), SQLite (`aiosqlite`) for conversation/profile/procedural memory, Chroma for embeddings, Ollama as the default local model (Anthropic/Gemini reachable via proxy when routed there).
- **Build discipline** (root `CLAUDE.md`): one memory/tool phase at a time, minimal diffs, voice latency treated as sacred — memory writes and slow tools are fire-and-forget or ack-then-async, never blocking `speakText()`.

## UI surface, end to end

- **Mission Control HUD** — `LeftPanel`, `CenterPanel` (the neural sphere), `RightPanel`, `StatusBar`, on the main voice page
- **Memory Galaxy** — separate page, 4-tab explorer (Recent / Notes / Graph / Galaxy) over the vault + graph data
- **5 settings sheets** — Jarvis, AI, Voice, Memory, Tool — each a thin UI over its own store
- **Onboarding flow** exists per component org (`components/onboarding/`) for first-run setup

Note: the `A.D.A.M` / `J.A.R.V.I.S` / `run` "spaces" seen in terminal screenshots this session belong to `herdr`, an unrelated terminal multiplexer tool — not part of the JARVIS web app itself.
