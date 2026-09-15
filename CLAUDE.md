# agentic-os

Project memory for Claude Code. See `goal.md` and `docs/specs/` (`memory.md`, `MEMORY_IMPLEMENTATION_PLAN.md`, `TOOLS.md`) for the authoritative specs.

## JARVIS build — session rules

You are building JARVIS for agentic-os (memory M0–M4, tools T0–T4). Operate autonomously: proceed without asking for reversible build steps, tests, file edits, and routine commands.

**ALWAYS ASK** before reading or using: `.env` files, API keys, passwords, tokens, `.cursor/aidocs/do-not-commit/`, or any `*-key.md` / `*secret*` / `*credential*` file. Never echo secrets into chat, commits, or Obsidian notes.

**NEVER COMMIT** the `extras/` folder — local reference code only (e.g. Friday prototype, certs). It is gitignored; do not `git add extras/` even if the user asks unless they explicitly override this rule. You may read `extras/` for inspiration when building JARVIS.

### Authoritative specs (read before coding)

- `goal.md` — north star, phases A–G, on-disk layout `~/jarvis/`
- `docs/specs/memory.md` — five-layer model, orchestrator, settings hierarchy
- `docs/specs/MEMORY_IMPLEMENTATION_PLAN.md` — exact files, endpoints, exit criteria M0–M4
- `docs/specs/TOOLS.md` — tool registry, loop, permissions, phases T0–T4
- `docs/specs/CONVERSATION_AGENTS.md` — Tool Router, Tool Agents, Permission Agent
- `docs/playbooks/claude_goals.md` / `docs/playbooks/claude_tools_goals.md` — copy-paste `/goal` playbooks per phase

### Reference knowledge (consult as needed)

- `.cursor/aidocs/docs/knowledge/CLAUDE_FABLE_5_PROMPTING.md` — long runs, verify progress against tool results
- `.cursor/aidocs/docs/knowledge/MANAGED_AGENTS_MEMORY.md` — memory store patterns (conceptual reference)
- `.cursor/aidocs/docs/knowledge/AGENT_SDK_AGENT_LOOP.md` — orchestrator/retrieve/store flow
- `.cursor/aidocs/docs/knowledge/CLAUDE_CODE_COMMANDS.md` — `/goal`, `/permissions`, `/context`

### Allowed paths

- `docs/` — git-tracked specs, playbooks, and reference (see `docs/README.md`)
- `.cursor/aidocs/docs/` — local engineering knowledge base (READ freely; gitignored)
- `.obsidian/` — repo Obsidian config (READ; not the runtime vault)
- `app/`, `runtime/` — implementation
- `~/jarvis/` — runtime memory vault + db + chroma (CREATE as needed per goal.md §5.4)

### Runtime vault vs repo docs

- Repo specs live in `docs/` (git-tracked); `goal.md` at repo root is the north star
- Local-only engineering notes may also exist under `.cursor/aidocs/` (gitignored)
- Operational memory vault is `~/jarvis/vault/` (Obsidian opens THIS, not the repo root)

### Build discipline

- Before reporting progress, audit each claim against tool output (tests, curl, sqlite queries).
- One phase at a time (M0 → M4 per `docs/specs/MEMORY_IMPLEMENTATION_PLAN.md`; T0 → T4 per `docs/specs/TOOLS.md`).
- Minimal diff. Match existing conventions in `app/` stores and services.
- Voice latency is sacred — memory writes and slow tools are fire-and-forget / ack-then-async, never block `speakText()`.
