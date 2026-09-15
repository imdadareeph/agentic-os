# Agentic OS — Project Overview

> A working snapshot of what **Agentic OS** is, what has actually been built so far, and what remains on the roadmap.
>
> _Last reviewed against the codebase on the `main` branch (commit `47321c0`)._

---

## 1. What is being built

**Agentic OS** is positioned as a **local-first, modular, event-driven "AI operating system"** — not just another chatbot. The long-term vision is a desktop runtime where voice, memory, reasoning, tools, automation, knowledge, and autonomous multi-agent workflows all cooperate through a unified event bus, with the LLM being only _one_ component.

The concrete thing shipping today is **JARVIS** — a real-time voice command center ("Mission Control") that you talk to with your microphone. The current deliverable is the **frontend + a thin dev-server backend**; the engine architecture described in the READMEs is still aspirational. Language for that runtime is analyzed in §2 (**Python-first**, Rust optional later).

**Two distinct layers exist in the docs:**

| Layer | Status | Reality |
|-------|--------|---------|
| **JARVIS voice command center** (React app in `app/`) | ✅ Built & working | This is the real, running product |
| **Agentic OS runtime** (engines, event bus, tool registry) | 📋 Planned | Vision only — no backend language chosen in code yet (READMEs say Rust) |

---

## 2. Runtime language: Rust vs Python

The READMEs plan **Rust (Axum + Tokio)**. That is viable — but for the work that is actually next (memory, RAG, tools, agents), **Python is the better default**. Rust remains a strong option later for a desktop kernel / packaging layer.

### What the runtime must do next

| Workload | Ecosystem fit | Notes |
|----------|---------------|--------|
| Memory / embeddings / RAG | **Python** | Mature clients for Qdrant, Neo4j, LlamaIndex, etc. |
| Tool calling & agent loops | **Python** | LangGraph, CrewAI, AutoGen, custom tool registries |
| Planner / workflows | **Python** | Fast iteration; most agent frameworks are Python-first |
| Event bus + WebSocket API | Either | FastAPI (Python) or Axum (Rust) both fine |
| Long-running “OS” process, low RAM | **Rust** | Better for a always-on desktop runtime |
| Single-binary desktop ship | **Rust** | Especially if Tauri wraps the UI later |
| Voice STT/TTS | Neither (already done) | Browser + Docker Whisper + Voicebox; do not rewrite |

There is **no backend code yet** (no `.rs` or product `.py` runtime). Language choice is still open; only docs assume Rust.

### Rust — when it wins

**Use Rust if** the priority is a true OS-like kernel: predictable latency, tiny memory footprint, process supervision, and a shippable binary.

| Pros | Cons |
|------|------|
| Matches the published architecture (Axum, Tokio) | AI/agent/RAG ecosystem is thinner than Python |
| Excellent concurrent event bus | Slower to prototype memory, tools, multi-agent flows |
| Strong fit for desktop packaging (Tauri path) | Embeddings, agent frameworks, many ML tools are Python-first |
| No GC pauses for a long-lived runtime | Higher cost to hire/iterate for agentic features |

Rust is **possible and correct long-term** for the runtime shell. It is **not** the fastest path to Phase 2–4.

### Python — when it wins

**Use Python if** the priority is shipping Memory Engine, tools, and agents against the existing React UI.

| Pros | Cons |
|------|------|
| Best-in-class agent / RAG / tool ecosystem | Weaker as a permanent “OS kernel” (GIL, packaging, RAM) |
| FastAPI gives REST + WebSocket quickly | Less “desktop OS” feel than a Rust binary |
| Aligns with Whisper stack (already Python in Docker) | Need discipline so the runtime does not become a script pile |
| Fastest path from today’s UI to real engines | May later need a Rust (or other) shell for packaging |

Python is **the pragmatic choice for the next 1–2 phases**.

### Recommendation (update the plan)

**Hybrid, Python-first:**

1. **Now (Phases 2–4):** implement the runtime in **Python (FastAPI + asyncio)** — event bus, memory, planner, tool registry, agent loops. Talk to the React app over REST + WebSocket. Keep Ollama / Whisper / Voicebox as external processes (as today).
2. **Later (Phase 5 / desktop):** optionally introduce **Rust** as the host process (Tauri or a thin supervisor) that owns lifecycle, permissions, and packaging — calling into the Python engines as services, or gradually rewriting hot paths.
3. **Do not** move the voice pipeline into either language yet; it already works in the browser.

```
Recommended near-term stack
───────────────────────────
React Mission Control
        │  REST + WebSocket
Python runtime (FastAPI)
        │  internal event bus (asyncio)
  Memory · Planner · Tools · Agents
        │
Ollama · Whisper (Docker) · Voicebox · SQLite/Qdrant/Neo4j

Optional later
──────────────
Rust host / Tauri shell → supervises Python runtime + UI
```

**Decision rule:** if the next milestone is “agents that remember and use tools,” use **Python**. If the next milestone is “ship a single-binary desktop OS,” use **Rust** (or Rust host + Python engines). For Agentic OS today, that means **Python first**.

---

## 3. Architecture: aspiration vs. reality

### The documented target architecture (READMEs)

```
React Mission Control → REST + WebSocket → Runtime (Rust) → Event Bus
  → Voice / Memory / Planner / Search / Plugin / Automation engines
  → Tool Registry (GitHub, Docker, FS, Browser, Terminal, ...)
  → Ollama · Whisper · Voicebox
  → SQLite · PostgreSQL · Neo4j · Qdrant
```

### Recommended target architecture (this overview)

```
React Mission Control → REST + WebSocket → Runtime (Python / FastAPI) → Event Bus
  → Memory · Planner · Tools · Agents
  → Ollama · Whisper · Voicebox
  → SQLite · Qdrant · Neo4j
  → (optional later) Rust host / Tauri for desktop packaging
```

### What actually runs today

```
Browser (React 19 + Vite 7)
  ├─ Voice pipeline runs entirely client-side
  │    Browser SpeechRecognition (live STT)  ─┐
  │    Whisper @ :9000 (Docker, refine STT)   ├─ transcription
  │    Voicebox @ :17493 (fallback STT/TTS)  ─┘
  │    Browser TTS / Voicebox TTS            ── speech out
  ├─ LLM routing → Ollama (:11434) | Anthropic | Gemini  (via Vite proxy)
  └─ Vite dev-server plugin
       └─ /api/vitals → YouTube + Instagram + Ollama live metrics
```

There is **no dedicated backend runtime, no event bus, no persistent database, and no tool registry** yet. State lives in React memory + browser `localStorage`. All service integration happens through Vite dev-server proxies (`/whisper`, `/voicebox`, `/ollama`, `/anthropic`, `/gemini`, `/gitnexus`).

---

## 4. What is done so far ✅

### Voice conversation pipeline (the core, and it works)
- **Two interaction modes**, switchable in Voice Settings:
  - **Push-to-talk** (`useVoiceAssistant`) — hold `Space` to talk, release to send.
  - **Continuous conversation** (`useRealtimeConversation`) — always-listening, with silence-based turn detection, interim transcript display, and a manual "Send" button.
- **Live STT** via the browser Web Speech API (Chrome/Edge).
- **Whisper refinement** — final audio is re-transcribed by a Dockerized Whisper (`onerahmet/openai-whisper-asr-webservice`, `base` model, faster-whisper) in the background without blocking JARVIS's reply; refined turns are marked `· refined`.
- **Voicebox fallback** for both STT and TTS when Whisper/browser TTS are unavailable.
- **Speech output** via browser TTS or Voicebox (with a JARVIS voice profile).
- Graceful degradation and explicit, actionable error messages throughout.

### Multi-provider LLM routing
- Provider registry + router supporting **Ollama, Anthropic (Claude), and Gemini** (`services/llm/`).
- Per-provider config (base URL, API key, model), health checks, active-provider selection.
- Falls back to Voicebox `llmGenerate` if the active provider fails and Voicebox is enabled.

### JARVIS settings (persisted in `localStorage`)
- Editable **system prompt / persona**, short-answer mode, deep-thinking (`think`) mode for reasoning models.
- Personality (default / technical / casual / executive) and formality tuning.
- Model selection, temperature, max tokens.
- **Conversation memory** — last N user+assistant turns sent to the model (default 4).
- **Inject vitals** — appends live metrics into the system prompt.
- Inline test-prompt (query JARVIS without the mic). Schema-versioned settings with migrations.

### Mission Control dashboard (three-panel HUD)
- **Left panel** — System Vitals with canvas sparklines, Directives checklist, Documents list.
- **Center panel** — 3D `NeuralSphere` (three.js / react-three-fiber) reacting to voice, "Voice Active" indicator, live display.
- **Right panel** — Command Deck buttons, voice controls, waveform, live transcript, input-level meter.
- **Status bar** with entry points into Voice / JARVIS / AI settings sheets.
- Ambient music that reacts to session/voice phase.

### Live system vitals (real data)
- A Vite server plugin exposes `/api/vitals`, aggregating:
  - **YouTube** — subscriber count + latest video views (requires `YOUTUBE_API_KEY`).
  - **Instagram** — follower count (via Instagram Graph or Meta Page token).
  - **Ollama** — loaded models + VRAM usage (`/api/ps`).
- History is cached to disk (`.vitals-cache.json`) to compute monthly deltas and sparklines.

### Tooling & foundation
- React 19, Vite 7, TypeScript, Tailwind + a full **shadcn/ui** component library (~60 UI primitives), Framer Motion, three.js.
- `FeatureShowcase` scrolling section presenting the 5-level "Agentic OS" narrative.
- npm scripts for Whisper Docker (`voice:whisper`) and health checks (`voice:check`).

---

## 5. What is mocked / placeholder ⚠️

These appear in the UI but are **not yet backed by real logic**:

- **Command Deck buttons** — `INBOX-BRIEF` opens a hardcoded mock panel; `METRICS-PULL` triggers a vitals refresh; `NEW SESSION` clears the transcript. The rest (`AM-REPORT`, `TREND-SCAN`, `GH-TRENDING`, `PLAN-TODAY`, `YT-WEEK`, `WK-REVIEW`) are decorative toggles.
- **Center panel "Views" counter** — a simulated random-increment number.
- **Directives & Documents** (left panel) — hardcoded static lists.
- **GitNexus** integration — only a health-probe stub, disabled by default.

---

## 6. Roadmap & next items

The README defines 5 phases. Here is their real status:

### Phase 1 — Foundation → ~90% done ✅
Voice conversation, Ollama integration, Whisper, dashboard: **done**. Dedicated runtime service: **not done** (the app runs in-browser).

### Phase 2 — Memory & knowledge → 🔜 **next up** (Python runtime)
Only lightweight conversation memory (last-N turns) exists today. Still to build:
- [ ] Stand up **Python runtime** (FastAPI + asyncio event bus) and wire React via REST + WebSocket.
- [ ] Real **Memory Engine** (working / episodic / semantic / procedural / knowledge layers).
- [ ] **Vector search** + embeddings (Qdrant) and knowledge-graph retrieval (Neo4j).
- [ ] **Session persistence** — SQLite (or PostgreSQL) instead of `localStorage`.
- [ ] Retrieval-before-response context building.

### Phase 3 — Plugins, tools & automation → 📋 planned (Python)
- [ ] **Tool Registry** with real tools (GitHub, Docker, Filesystem, Browser, Terminal, Email, Calendar) — currently only a GitNexus stub.
- [ ] **Plugin architecture** (loading, capability registration, permissions, lifecycle).
- [ ] **Automation Engine** — scheduled tasks, background jobs, workflows.
- [ ] Wire the Command Deck buttons to real actions.

### Phase 4 — Multi-agent runtime → 📋 planned (Python)
- [ ] Multiple collaborating agents.
- [ ] Background/autonomous execution.

### Phase 5 — Full AI Operating System → 📋 vision (optional Rust host)
- [ ] Autonomous workspace + full Mission Control observability.
- [ ] Optional **Rust host / Tauri shell** for desktop packaging, process supervision, and permissions — Python engines remain the AI layer unless hot paths need a rewrite.

### Cross-cutting foundational gaps (prerequisites for Phases 2–5)
- [ ] Stand up the **Python runtime** (FastAPI) and **internal event bus** — the architectural centerpiece that currently doesn't exist.
- [ ] Define **REST + WebSocket** contracts between the React UI and the runtime.
- [ ] Introduce a **persistence layer** (start with SQLite; add Qdrant / Neo4j when memory needs them).
- [ ] Add the **observability surface** (events, state transitions, latency, health, metrics).
- [ ] Replace mocked dashboard sections with live runtime data.
- [ ] Defer **Rust** until desktop packaging or kernel-level supervision is the bottleneck — not before agents and memory work.

---

## 7. Quick orientation for contributors

- **Everything real lives in `app/`** — start with `app/README.md`.
- **Voice logic:** `app/src/hooks/useRealtimeConversation.ts`, `useVoiceAssistant.ts`, and `app/src/services/voice.ts`.
- **LLM routing:** `app/src/services/llm/` and `app/src/services/jarvis.ts`.
- **Dashboard:** `app/src/sections/{Left,Center,Right}Panel.tsx`.
- **Live metrics:** `app/server/fetch-vitals.ts` (+ the Vite plugin `vite-vitals-plugin.ts`).
- **Config/proxies:** `app/vite.config.ts` and `app/src/config/`.
- **Run it:** `cd app && pnpm install && npm run dev` (then optionally `npm run voice:whisper` and `ollama serve`).
- **Next backend:** Python FastAPI runtime (see §2); do not start a Rust rewrite for Phase 2.

**Bottom line:** the voice command center is a polished, functional product. The "operating system" — runtime, engines, memory, tools, agents — is still ahead. **Use Python for that runtime now; keep Rust as an optional later host for desktop packaging.** Both are possible; Python is the right next move.
