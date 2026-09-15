---
description: Build JARVIS tool calling phase-by-phase (T0–T4) from docs/playbooks/claude_tools_goals.md
argument-hint: [T0|T1|T2|T3|T4]
---

# Goal — JARVIS Tools

Implement the JARVIS **tools module** for the phase given in `$ARGUMENTS`, using the copy-paste playbook in `docs/playbooks/claude_tools_goals.md`.

## Variables

PHASE: $ARGUMENTS

## Before anything else

1. Read [`CLAUDE.md`](../../CLAUDE.md) — session rules, allowed paths, build discipline.
2. Read [`docs/specs/TOOLS.md`](../../docs/specs/TOOLS.md) — registry, loop, permissions, API contract.
3. Read [`docs/specs/CONVERSATION_AGENTS.md`](../../docs/specs/CONVERSATION_AGENTS.md) — Tool Router, Tool Agents, Permission Agent, Security Agents, conversation flow.
4. Read [`docs/playbooks/claude_tools_goals.md`](../../docs/playbooks/claude_tools_goals.md) — find the section **Phase {PHASE}** and follow that `/goal` block exactly.

If `PHASE` is empty, show the user the phase table from `docs/playbooks/claude_tools_goals.md` §Quick reference and ask which phase to run (recommend **T0**).

Valid values: `T0`, `T1`, `T2`, `T3`, `T4` (case-insensitive).

## Workflow

1. Confirm prerequisites for the requested phase (see Workflow note in `docs/playbooks/claude_tools_goals.md`). Memory M0+ required; M4 `tool_runs` recommended for procedural logging.
2. Execute **only** the scope for that phase — do NOT start the next phase.
3. Match existing conventions: `app/` stores and services patterns, `runtime/` FastAPI layout, fire-and-forget logging, voice latency sacred.
4. Before claiming done, verify **every** exit criterion in the phase block with real tool output (curl, sqlite3, tests, Network tab, voice if applicable).
5. Report: bullet summary, files changed, exit criteria checklist with pass/fail per item.

## Hard rules

- **Runtime executes tools** — LLM proposes inside supervised loop; never browser-side shell/file access.
- **Voice latency is sacred** — fast tools inline (<300ms); slow tools ack then async; never block first `speakText()`.
- **One phase at a time** — minimal diff; independent testability per CONVERSATION_AGENTS.md.
- **ALWAYS ASK** before `.env`, API keys, `.cursor/aidocs/do-not-commit/`, or credential files.
- **Log every tool run** to `tool_runs` via `procedural.record_tool_run` / `POST /api/memory/tool-run`.
- **Permissions** — destructive ops require approval (T2+); T0/T1 read-only tools are `allow`.

## Reference knowledge (consult as needed)

- `.cursor/aidocs/docs/knowledge/AGENT_SDK_AGENT_LOOP.md`
- `.cursor/aidocs/docs/knowledge/MANAGED_AGENTS_TOOLS.md`
- `.cursor/aidocs/docs/knowledge/MANAGED_AGENTS_PERMISSION_POLICIES.md`
- `.cursor/aidocs/docs/knowledge/CLAUDE_FABLE_5_PROMPTING.md`

## Report format

```
## Phase {PHASE} — done / blocked

### Summary
- ...

### Exit criteria
- [ ] criterion 1 — evidence
- [ ] criterion 2 — evidence

### Files changed
(git diff --stat)

### Next
Run `/goal clear` then `/goal_tools T{n+1}` when ready.
```
