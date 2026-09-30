<!--
Sync Impact Report
- Version change: (unfilled scaffold) → 1.0.0
- Modified principles: placeholders → I–V named below (first ratification)
- Added sections: Constraints; Build & Review Workflow; Governance (filled)
- Removed sections: none (template structure preserved)
- Follow-up TODOs: none
Sources consulted (high-level): goal.md, CLAUDE.md, README.md, docs/README.md,
docs/reference/overview.md, docs/reference/AUTHOR.md, docs/specs/memory.md,
docs/specs/TOOLS.md, docs/specs/CONVERSATION_AGENTS.md,
docs/plans/MEMORY_EVOLUTION_PLAN.md, docs/plans/WEB_TERMINAL_ANALYSIS.md,
.cursor/rules/jarvis-voice-latency.mdc
-->

# Agentic OS Constitution

## Core Principles

### I. Voice Latency Ceiling (NON-NEGOTIABLE)

JARVIS is a realtime voice interface, not a chat box that happens to speak.
From final user transcript to first `speakText()`, elapsed time MUST be
**≤ 3 seconds**. Inline fast tools MUST complete or be skipped within
**300ms**. Slow work (memory writes, embeddings, `terminal.run`, PTY open,
MCP, Ghost recipes, profile extraction) MUST be ack-then-async: speak first,
execute in the background, speak or notify the outcome later. Failures MUST
degrade (empty context, skip tools) — they MUST NOT stall speech. If a
command, setting, or `/goal` phase would await slow work before the first
utterance, the implementing agent MUST say so in the same turn (which
tool, why, that it is ack-then-async). There is no silent override.

Rationale: a delayed first word breaks the product. Memory and tools exist
to serve the voice session, not the other way around.

### II. Local-First Operating System

Core voice, memory, and vault MUST run without a cloud dependency. Default
brain is local (Ollama). Anthropic and Gemini are optional upgrades. Runtime
data lives under `~/jarvis/` (vault, SQLite, Chroma). Cloud keys stay in
user settings or OS keyring — never in git, chat, or Obsidian notes.
Operational vault is `~/jarvis/vault/` (Obsidian opens that path). Repo
`docs/` is the git-tracked spec; it is not the runtime vault.

Rationale: Agentic OS is an OS the user owns. Cloud is an accelerator, not
the substrate.

### III. Memory as Keystone

Until conversation memory persists across refresh, Agentic OS is a voice
demo. With memory it is an OS. The five-layer model is mandatory:
working (volatile), conversation (SQLite), episodic (Obsidian Markdown),
semantic (Chroma index of the vault), procedural (`tool_runs`). Obsidian
Markdown is durable human-readable truth. Chroma is an index, not a second
source of truth. Do not add another vector store on the voice hot path.
Deterministic intent gates MUST run before any retrieval or extraction LLM.
Writes to memory are warm/cold (after reply or idle) unless they are a
bounded conversation retrieve that respects Principle I.

Rationale: recall across sessions is the definition of done in `goal.md`.

### IV. Runtime Orchestrates; LLM Proposes

The Python runtime (FastAPI + event bus) owns lifecycle, permissions, and
execution. The LLM is a reasoning engine inside a bounded loop. It MUST
NOT shell out, read files, or hit APIs directly. Agents communicate via
events; they MUST NOT call each other. Privileged or mutating tools
(delete, terminal except read-only allowlist, git push, docker stop,
destructive MCP, writes outside `~/jarvis/agents/`) MUST pass the
Permission Agent (`allow` | `ask` | `deny`) before side effects. Every
tool run MUST be recorded in procedural memory. Planner gates MUST skip
the tool loop for greetings, small talk, and pure Q&A.

Rationale: `CONVERSATION_AGENTS.md` — JARVIS is a runtime of specialists,
not a self-orchestrating model.

### V. Evidence-Gated Phased Delivery

Build one spec phase at a time (memory M0→M4, tools T0→T4). Do not start
the next phase until the current exit criteria are proven against tool
output (tests, curl, sqlite). Diffs MUST stay minimal and match existing
`app/` stores/services and `runtime/` conventions. Before reporting
progress, audit each claim. Borrow patterns from Friday, aictl, Ghost OS,
Hyper, Mem0, VoiceMem — do not vendor those codebases. aictl is PolyForm
Noncommercial: reimplement ideas in Python; do not paste its source.

Rationale: the specs are executable. Skipping gates produces an
unverifiable OS.

## Constraints

- **Secrets:** MUST ASK before reading `.env`, API keys, tokens,
  `.cursor/aidocs/do-not-commit/`, or any `*secret*` / `*credential*` /
  `*-key.md` file. Never echo secrets into chat, commits, or the vault.
- **`extras/`:** local reference only (gitignored). MUST NOT `git add extras/`
  unless the user explicitly overrides this constitution.
- **Stack:** React + Vite Mission Control; Python FastAPI runtime for
  memory/tools/agents; optional Rust/Tauri later as a host — not the path
  for RAG or the tool loop. Do not rewrite the working browser voice
  pipeline into Python or Rust.
- **UI:** new surfaces MUST match Mission Control (existing CSS tokens,
  settings-sheet pattern, StatusBar, RightPanel / Command Deck, lucide-react,
  WCAG 2.2 AA). Do not introduce a second HUD (PyQt, Tailwind-first
  Friday chrome, Hyper Electron chrome).
- **Tools:** registry in `runtime/tools/`; LLM proposes, runtime executes.
  Interactive PTY (when built) is session-scoped, localhost-bound, and
  killed on NEW SESSION. One-shot `terminal.run` stays the default for
  voice “run this command.”
- **Third-party clones** under `~/Documents/dev/2026/git-downloads/` are
  pattern libraries outside this workspace. They MUST NOT be copied into
  `app/` or `runtime/`.

## Build & Review Workflow

Authoritative specs (read before coding): `goal.md`, `docs/specs/memory.md`,
`docs/specs/MEMORY_IMPLEMENTATION_PLAN.md`, `docs/specs/TOOLS.md`,
`docs/specs/CONVERSATION_AGENTS.md`, `docs/playbooks/claude_goals.md`,
`docs/playbooks/claude_tools_goals.md`. Plans under `docs/plans/` extend
those specs; they do not replace them.

Playbooks are one `/goal` per phase. Memory settings, tool settings, and
voice settings share one UX pattern. Runtime fetch clients MUST degrade to
empty results on failure and MUST NOT throw into the voice flow.

Compliance review on every change that touches: `speakText()` / conversation
hooks, memory retrieve/store on the hot path, tool permissions, or PTY
lifecycle. A change that cannot name its phase and exit criterion is out of
order.

## Governance

This constitution supersedes informal practice when they conflict. Feature
specs (`goal.md`, `docs/specs/`) remain the build playbooks; they MUST
comply with these principles. Cursor rule
`.cursor/rules/jarvis-voice-latency.mdc` restates Principle I for agents;
if that rule and this file diverge, this file wins and the rule MUST be
updated in the same amendment.

Amendments: edit this file, bump **Version** (MAJOR = removed/redefined
principle; MINOR = new principle or material expansion; PATCH = wording),
set **Last Amended** to today (ISO 8601), refresh the Sync Impact Report
comment. No principle is deleted without a migration note (what code or
docs still assume the old rule).

PRs and agent sessions that change voice, memory, or tools MUST verify
Principles I–V. Complexity beyond the current phase MUST be deferred, not
smuggled in.

**Version**: 1.0.0 | **Ratified**: 2026-09-15 | **Last Amended**: 2026-09-15
