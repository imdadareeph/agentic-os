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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **agentic-os** (3320 symbols, 6645 relationships, 256 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/agentic-os/context` | Codebase overview, check index freshness |
| `gitnexus://repo/agentic-os/clusters` | All functional areas |
| `gitnexus://repo/agentic-os/processes` | All execution flows |
| `gitnexus://repo/agentic-os/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
