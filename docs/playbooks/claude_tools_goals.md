# JARVIS Tools — `/goal` Playbook

> Copy-paste `/goal` commands for building JARVIS tool calling in Claude Code, phase by phase (T0 → T4), plus running tips.
>
> **Session rules live in [`../../CLAUDE.md`](../../CLAUDE.md)** — read it first. It governs autonomy, secrets you must ask before touching, allowed paths, and build discipline (one phase at a time, minimal diff, voice latency is sacred).
>
> Authoritative specs this file is derived from: [`../specs/TOOLS.md`](../specs/TOOLS.md) (registry, loop, permissions, phases T0–T4), [`../specs/CONVERSATION_AGENTS.md`](../specs/CONVERSATION_AGENTS.md) (Tool Router, Tool Agents, Permission Agent, Security Agents), [`../../goal.md`](../../goal.md) Phase F, [`../specs/memory.md`](../specs/memory.md) (procedural layer / `tool_runs`).

**Prerequisite:** Memory runtime M0+ should be merged (FastAPI on `:8000`, `/runtime` Vite proxy, `tool_runs` table + `POST /api/memory/tool-run` from M4). Tool phases can start once M0 is green; procedural logging assumes M4 CRUD exists.

---

## Before you start (once per session)

Run these once at the top of a fresh Claude Code session before your first `/goal`:

```
/config permissionMode=acceptEdits
```

```
/effort high
```

- **`permissionMode=acceptEdits`** — auto-accepts file edits so the build doesn't stall on every write.
- **`/effort high`** — maximum reasoning for multi-file runtime + frontend wiring.
- **Permissions note:** `acceptEdits` does **not** grant read access to secrets. Per `CLAUDE.md`, always let Claude **ASK** before reading `.env`, API keys, tokens, `.cursor/aidocs/do-not-commit/`, or any `*-key.md` / `*secret*` / `*credential*` file.

Reference knowledge (consult as needed during build):
- `.cursor/aidocs/docs/knowledge/AGENT_SDK_AGENT_LOOP.md` — tool loop turns, max_turns, message types
- `.cursor/aidocs/docs/knowledge/MANAGED_AGENTS_TOOLS.md` — tool schema patterns
- `.cursor/aidocs/docs/knowledge/MANAGED_AGENTS_PERMISSION_POLICIES.md` — allow/ask/deny

---

## Phase T0 — Tool loop skeleton

**Goal:** JARVIS calls `vitals.fetch` during conversation. Proves registry + loop + procedural logging.

```
/goal Build Phase T0 of the JARVIS tools module per TOOLS.md §§4.2/6/11/12/15 and CONVERSATION_AGENTS.md Tool Agents + conversation flow. Stand up the runtime tool registry, supervised tool loop, and wire the frontend behind toolsEnabled. Keep working until ALL exit criteria pass.

Scope (do only T0 — do NOT start T1+):
1. Create runtime/tools/ package per TOOLS.md §11:
   - registry.py — ToolDefinition dataclass, load core tools at startup, list/get/filter
   - schemas.py — ToolResult, ToolCall, Pydantic request/response types
   - router.py — keyword/regex intent gating (execute_tool triggers: run, execute, pull, fetch, check, metrics, status; skip greetings/small talk) — NOT an LLM call (TOOLS.md §6.1)
   - executor.py — validate args, call handler, record tool_run via procedural.record_tool_run
   - loop.py — supervised loop: max_turns=5, per-turn timeout; LLM proposes tool_calls, runtime executes
   - permissions.py — stub for T0: all T0 tools are permission=allow
   - handlers/vitals.py — vitals.fetch wraps existing app vitals (proxy http://127.0.0.1:3000/api/vitals or duplicate fetch logic in Python with httpx)
   - handlers/memory_tools.py — memory.search (calls semantic.query), memory.retrieve (calls orchestrator), system.status (runtime health), time.now
2. Register T0 catalog only (TOOLS.md §4.2 Phase T0): vitals.fetch, memory.search, memory.retrieve, system.status, time.now — all latency_class=fast, permission=allow.
3. Add runtime/models/tools.py Pydantic types and wire endpoints in runtime/main.py:
   - GET  /api/tools/health     -> { loaded: bool, toolCount: int }
   - GET  /api/tools/catalog    -> { tools: ToolDefinition[] } filtered by toolsEnabled flag in request
   - POST /api/tools/plan       -> { useTools, candidates[], intent }
   - POST /api/tools/loop       -> { reply, toolRuns[], turns } — primary voice integration
   - POST /api/tools/execute    -> single tool (for tests)
   Log every execution via existing POST /api/memory/tool-run / procedural.record_tool_run (input_json, output_json, duration_ms).
4. LLM tool loop (runtime-side): loop.py calls Anthropic /v1/messages with tools param first (TOOLS.md §14). Pass tool schemas from filtered registry. For providers without native tools, degrade to text-only and log warning. Do NOT put secrets in tool schemas.
5. Frontend (minimal T0 wiring):
   - app/src/services/tools.ts — planTools(), runToolLoop(), getToolsHealth() — graceful failure like services/memory.ts, NEVER throw into voice flow
   - Add toolsEnabled: false default to a minimal store OR a single flag in jarvis-settings-store until T1 — do not block T0 on full ToolSettingsSheet
   - app/src/services/jarvis.ts — add thinkWithTools(): if toolsEnabled, POST /api/tools/plan; if useTools, POST /api/tools/loop; else existing think()
   - Wire useRealtimeConversation.ts processTurn to call thinkWithTools when toolsEnabled (hold sessionIdRef)
6. Voice rule (TOOLS.md §2): fast tools run inline; NEVER await slow work before first speakText(). T0 tools are all fast.
7. Add runtime/tests/test_tools_t0.py — registry load, router skips "hello", vitals.fetch handler mock, loop max_turns cap.

Exit criteria (verify each with tool output before claiming done):
1. GET /api/tools/health returns { loaded: true, toolCount: 5 } with runtime dev server running (curl).
2. POST /api/tools/plan with "hello" -> { useTools: false }.
3. POST /api/tools/plan with "pull my YouTube metrics" -> { useTools: true, candidates includes vitals.fetch }.
4. With Anthropic active in AI Settings, say "pull my metrics" in JARVIS -> spoken answer includes live vitals data.
5. sqlite3 ~/jarvis/db/memory.db "SELECT tool_name, success FROM tool_runs ORDER BY created_at DESC LIMIT 1" shows vitals.fetch success row.
6. toolsEnabled=false -> zero calls to /api/tools/*; plain think() path unchanged.
7. Voice latency: first speakText() not blocked by tool execution (T0 tools inline <300ms).
```

---

## Phase T1 — Settings + read-only local tools

**Goal:** User controls tools like Memory settings. JARVIS reads local filesystem/git/docker without approval.

```
/goal Build Phase T1 of the JARVIS tools module per TOOLS.md §§4.2/8/13/15 and CONVERSATION_AGENTS.md Filesystem Agent, Git Agent, Docker Agent. Add Tool Settings UI and read-only local inspection tools. Keep working until ALL exit criteria pass.

Scope (do only T1 — assumes T0 merged; do NOT start T2+):
1. Create app/src/stores/tool-settings-store.ts copying memory-settings-store.ts pattern (schemaVersion + STORAGE_KEY + migrate() + useToolSettings()). Fields per TOOLS.md §8.3:
   - toolsEnabled (master)
   - category toggles: memory, filesystem, git, docker, terminal, browser, mcp
   - defaultPermission: cautious | balanced | trusted
   - allowedPaths[] default [project root, ~/jarvis/]
   - inlineFastToolsOnly default true
2. Create app/src/sections/ToolSettingsSheet.tsx copying MemorySettingsSheet structure. Sections: Master, Categories, Paths, Session (toolsEnabledForSession), Debug (test tool execute input). Browser/MCP/Terminal sections disabled with "ships in T2/T3" tooltip.
3. StatusBar: add Tools button (Wrench or Hammer icon from lucide-react) next to Memory, same sheet-open pattern. Wire in App.tsx.
4. runtime/tools/handlers/:
   - filesystem.py — filesystem.read, filesystem.list with path allowlist enforcement (allowedPaths + deny .. traversal)
   - git.py — git.status, git.log (read-only, subprocess in project dir)
   - docker.py — docker.ps (read-only)
   All permission=allow, latency_class=fast.
5. Extend router.py to map filesystem/git/docker intents to T1 tools. Filter catalog by tool-settings category toggles passed from frontend in /api/tools/catalog and /api/tools/loop requests.
6. GET /api/tools/health — include per-category enabled counts.

Exit criteria (verify each):
1. Toggling toolsEnabled OFF stops all /api/tools/* calls (Network tab, full conversation).
2. "What's in the runtime folder?" -> filesystem.list + spoken summary; no approval dialog.
3. "Git status" -> git.status result spoken; logged in tool_runs.
4. docker.ps works when Docker is running; graceful error spoken when Docker is down (not a crash).
5. Path outside allowlist -> structured error to LLM, not a filesystem escape.
6. Settings persist across reload (localStorage).
```

---

## Phase T2 — Permissions + mutating tools

**Goal:** Destructive ops require approval. Slow tools ack first, never block voice.

```
/goal Build Phase T2 of the JARVIS tools module per TOOLS.md §§6.2/8/9/15 and CONVERSATION_AGENTS.md Permission Agent, Sandbox Agent, Terminal Agent, Filesystem Agent, Git Agent, Docker Agent. Add approval UX and mutating tools with async voice ack. Keep working until ALL exit criteria pass.

Scope (do only T2 — assumes T0+T1 merged; do NOT start T3+):
1. runtime/tools/permissions.py — full Permission Agent:
   - allow | ask | deny per tool + args
   - T2 mutating tools default permission=ask: filesystem.write, filesystem.delete, terminal.run, git.commit, docker.run, docker.stop, memory.episodic.write
   - terminal.run: deny destructive patterns (rm -rf, mkfs, dd, curl|sh); read-only allowlist for cautious mode (ls, cat, git status, docker ps)
2. runtime/tools/loop.py — when permission=ask: pause loop, return approvalRequired payload with approvalId, toolName, args preview, diff preview where applicable. POST /api/tools/approve { approvalId, approved } resumes loop. Approval timeout 5min then cancel (TOOLS.md §18).
3. Slow-tool async path: latency_class=slow -> loop returns early ack text ("Checking Docker — one moment"); execute in background; frontend speaks ack via onAcknowledge BEFORE awaiting completion; follow-up speak when done. NEVER block first speakText() on slow tools.
4. Handlers: terminal.py, filesystem write/delete, git commit, docker run/stop, episodic write (wrap memory/episodic.py).
5. Procedural retrieval (TOOLS.md §9.2): extend memory orchestrator — when user message matches retry/debug patterns ("how did we", "last time we ran", "that command failed"), query recent_tool_runs and inject into context block before tool loop.
6. Frontend:
   - app/src/components/ToolApprovalDialog.tsx — native dialog, shows command/diff/path, Approve/Deny, keyboard accessible (WCAG 2.2 AA)
   - Wire runToolLoop onApprovalRequired -> show dialog -> POST /api/tools/approve
   - Enable Terminal/Filesystem write sections in ToolSettingsSheet

Exit criteria (verify each):
1. "Commit with message test" -> approval dialog shows diff -> deny -> JARVIS explains blocked; approve -> commit succeeds + tool_runs row.
2. terminal.run with rm -rf -> denied without dialog (Permission Agent deny).
3. Slow tool (docker.run): user hears ack within one speakText() before tool completes.
4. "How did we start Docker last time?" -> response cites prior tool_runs entry (after a prior docker.run).
5. Incognito session (memory settings) -> tools disabled, matching memory incognito rule.
```

---

## Phase T3 — MCP + browser + Command Deck

**Goal:** External tools via MCP. Command Deck buttons trigger real tool/skills stubs.

```
/goal Build Phase T3 of the JARVIS tools module per TOOLS.md §§4.2/13.3/15 and CONVERSATION_AGENTS.md MCP Agent, Browser Agent, Notification Agent, Metrics Agent. Add MCP bridge, browser tools, and wire Command Deck to tool execution. Keep working until ALL exit criteria pass.

Scope (do only T3 — assumes T0–T2 merged; do NOT start T4+):
1. runtime/tools/handlers/mcp_bridge.py — MCP Agent:
   - Discover connected MCP servers (config in tool settings or runtime config file — no secrets in repo)
   - Normalize MCP tools to registry entries: mcp.{server}.{tool}
   - Default permission=ask; proxy execute through MCP with timeout
   - Exclude MCP tools from catalog when server unhealthy
2. runtime/tools/handlers/browser.py — browser.search, browser.fetch (httpx + readability/markdown strip); permission=ask, latency=slow.
3. Wire Command Deck (app/src/sections/RightPanel.tsx or command deck components):
   - METRICS-PULL -> invoke vitals.fetch via tools service (replace decorative toggle)
   - PLAN-TODAY, AM-REPORT -> skill stubs that call tool loop with preset prompts (minimal skill manifest, not full T4 loader)
4. WebSocket or SSE stub on runtime for tool progress events (TOOL_STARTED, TOOL_EXECUTED, TOOL_FAILED) — frontend Notification area shows tool running/failed (CONVERSATION_AGENTS.md Notification Agent).
5. Enable Browser + MCP sections in ToolSettingsSheet; MCP health in /api/tools/health.

Exit criteria (verify each):
1. METRICS-PULL button triggers vitals.fetch and updates vitals display (not just refresh stub).
2. With a configured MCP server (e.g. GitHub), a GitHub tool appears in catalog and executes with approval.
3. MCP server down -> catalog excludes MCP tools; health pill shows degraded, not hard error.
4. browser.search returns summarized result after approval; logged in tool_runs.
5. Tool progress visible in UI during slow MCP/browser execution.
```

---

## Phase T4 — Skills & multi-agent

**Goal:** Skills and agents register composite tools. Research agent workflow end-to-end.

```
/goal Build Phase T4 of the JARVIS tools module per TOOLS.md §10/15 and CONVERSATION_AGENTS.md Planning Agents, Memory Agents, Tool Agents, Background Agents. Add skill/agent registration and composite tools for multi-step workflows. Keep working until ALL exit criteria pass.

Scope (do only T4 — assumes T0–T3 merged):
1. Skill loader: read manifests from ~/jarvis/skills/ (or .cursor/skills/ fallback) — YAML/JSON with { id, title, tools[], prompt, agent_id? }.
   - POST /api/tools/register { source: "skill"|"agent", id, tools[] }
   - DELETE /api/tools/register/{id}
   - Composite handlers: skill.am_report, skill.plan_today, agent.research.run
2. Agent tool policies per agent_id (from memory sessions schema): research agent gets memory.search + browser.search + memory.episodic.write; jarvis default gets T0–T2 core set.
3. Handoff: one agent tool result JSON becomes next agent context (event bus messages TOOL_EXECUTED -> Memory Coordinator per CONVERSATION_AGENTS.md).
4. Wire remaining Command Deck buttons (AM-REPORT, TREND-SCAN, GH-TRENDING, WK-REVIEW) to skill stubs.
5. End-to-end research flow: user research query -> agent.research.run -> browser + memory tools -> episodic write -> JARVIS voice summary.

Exit criteria (verify each):
1. Drop a skill manifest in ~/jarvis/skills/ -> appears in GET /api/tools/catalog after reload.
2. agent.research.run completes multi-step loop (search + note write) without user micromanaging each tool.
3. Episodic note written under agents/research/ and queryable via memory.search in a follow-up turn.
4. agent_id on session scopes tool catalog (research session sees research toolset).
5. Unregister skill -> tools removed from catalog.
```

---

## Tips while running

| Tip | How | Why |
|-----|-----|-----|
| **Watch context, then compact** | `/context` then `/compact` | Tool phases touch runtime + app + tests — window fills fast |
| **Fewer permission prompts** | `/fewer-permission-prompts` | Allowlists safe read-only commands; does NOT allowlist secrets |
| **Continue autonomously** | Say "continue" | Reversible steps need no re-confirmation per CLAUDE.md |
| **Clear a goal** | `/goal clear` before next phase | Avoid juggling T0 and T1 objectives |
| **Anthropic for T0 loop** | Set Anthropic active in AI Settings for first tool-use testing | Best native tool support (TOOLS.md §14); Ollama gated on model capability |
| **Verify with sqlite** | `sqlite3 ~/jarvis/db/memory.db "SELECT * FROM tool_runs ORDER BY created_at DESC LIMIT 5"` | Procedural memory is the audit trail |
| **Voice first** | Test via mic, not only curl | Latency and ack behavior only show up in real voice flow |

---

## Workflow note

- **One phase per `/goal`.** Run T0 to green, verify exit criteria (curl, sqlite3, Network tab, voice), then `/goal clear` and paste T1.
- **Do NOT combine T0–T4 into a single `/goal`.** Dependencies: T1 needs T0 loop; T2 needs T1 settings; T3 needs T2 permissions; T4 needs T3 MCP/command deck patterns.
- **Memory dependency:** T0 can ship with M0+; procedural logging is best with M4 `tool_runs` CRUD. If M4 isn't merged, T0 should still create/use the table via existing migration 0003_procedural.sql.
- **Agent architecture:** Implement Tool Router + Permission Agent as runtime modules (TOOLS.md), not as separate processes yet — matches CONVERSATION_AGENTS.md "agents are replaceable services" without premature microservices.

---

## Quick reference — phases

| Phase | Goal | Key deliverable |
|-------|------|-----------------|
| **T0** | Tool loop skeleton | `vitals.fetch` during voice; `tool_runs` logged |
| **T1** | Settings + read-only local | ToolSettingsSheet; filesystem/git/docker read |
| **T2** | Permissions + mutating | ToolApprovalDialog; terminal/git commit/docker run |
| **T3** | MCP + browser + Command Deck | METRICS-PULL real; MCP proxy |
| **T4** | Skills & multi-agent | skill.am_report; agent.research.run |

**Start here:** paste the **Phase T0** block above into Claude Code `/goal`.
