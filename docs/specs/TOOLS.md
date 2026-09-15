# JARVIS Tools — Design & Implementation Plan

> How JARVIS discovers, selects, executes, and remembers tool use during conversation.
>
> Aligns with `CONVERSATION_AGENTS.md` (Tool Agents, Security Agents), `memory.md` (procedural layer), `MEMORY_DECISION.md` (tool events), `MEMORY_IMPLEMENTATION_PLAN.md` (M4 `tool_runs`), and `overview.md` (Phase 3 Tool Registry).
>
> Version: 1.0 · Status: Draft

---

## 1. What this document covers

JARVIS today is a voice-first assistant: transcript → LLM → spoken reply. There is **no tool registry, no tool loop, and no runtime execution layer** yet (`overview.md` §3). This document defines:

| Topic | Outcome |
|-------|---------|
| **Tool Registry** | Canonical catalog of tools JARVIS can use |
| **Tool Selection** | How JARVIS decides *whether* and *which* tool to call per turn |
| **Tool Execution** | Runtime-owned execution with permissions — not ad-hoc browser calls |
| **Tool Loop** | Multi-step tool use during a conversation turn |
| **Skills & Agents** | Higher-level bundles that expose tools (Phase 4+) |
| **Procedural Memory** | Every run logged to `tool_runs`; retrievable on retry/debug |
| **Voice Safety** | Tool work never blocks `speakText()` |

**Skills and dedicated agents** (research, terminal, GitHub, etc.) are planned but not required for the first tool-calling slice. The registry and loop ship first; skills/agents register on top.

---

## 2. Design principles

These inherit from `CONVERSATION_AGENTS.md`, `memory.md`, and `MEMORY_DECISION.md`:

| Principle | Meaning |
|-----------|---------|
| **Runtime orchestrates** | The Python runtime (FastAPI + event bus) owns scheduling, permissions, and execution. Agents communicate via events — they never call each other directly. |
| **LLM proposes, runtime executes** | The LLM may *request* tool calls within a supervised loop. It does not shell out, read files, or hit APIs directly. |
| **Planner gates expensive work** | Intent + Planner decide upfront if tools are likely needed. Skip the tool loop for greetings, small talk, and pure Q&A. |
| **Voice latency is sacred** | Fast tools may run inline (<300ms budget). Slow tools run async: JARVIS acknowledges, executes in background, speaks or notifies when done. |
| **Permissions before side effects** | Destructive or privileged operations require explicit approval (`Permission Agent`). |
| **Every tool run is remembered** | Success and failure append to procedural memory (`tool_runs`). Retrieval feeds retry/debug turns. |
| **Local-first** | Core tools run against local services (Ollama, filesystem, Docker socket, MCP on localhost). Cloud tools are optional plugins. |
| **Replaceable & testable** | Each tool is a registered capability with a schema, handler, and unit tests — not hard-coded in `jarvis.ts`. |

### Reconciling “the LLM never orchestrates itself”

`CONVERSATION_AGENTS.md` states the LLM is a **reasoning engine**, not the operating system. That holds:

```
User message
     │
     ▼
Runtime Coordinator          ← owns lifecycle, not the LLM
     │
     ├─ Intent Agent          ← “Execute Tool” vs “Ask Question”
     ├─ Planner Agent         ← need tools? which category?
     ├─ Memory retrieve       ← conversation + semantic + procedural
     │
     ▼
Tool Loop (if warranted)      ← LLM sees tool schemas, proposes calls
     │                            Runtime validates + executes + logs
     ▼
LLM (final reply)             ← synthesize tool results + memory into speech
     │
     ▼
Voice Output                  ← never waited on by tool work
```

The LLM participates in **tool selection inside a bounded loop** the runtime controls (`max_turns`, timeouts, permission hooks). The runtime — not the model — decides what tools exist, whether they may run, and when the loop ends.

---

## 3. Architecture

### 3.1 Component map

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Mission Control                        │
│  useRealtimeConversation → jarvis.ts → /runtime + /ollama       │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST (+ WebSocket future)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Python Runtime (FastAPI)                        │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │ Tool Registry│──▶│ Tool Router  │──▶│ Tool Executor        │ │
│  │ (catalog)    │   │ (selection)  │   │ (handlers + sandbox) │ │
│  └──────────────┘   └──────────────┘   └──────────┬───────────┘ │
│         ▲                    ▲                     │             │
│         │                    │                     ▼             │
│  ┌──────┴───────┐   ┌───────┴────────┐   ┌──────────────────────┐ │
│  │ Skill Loader │   │ Permission     │   │ Procedural Memory    │ │
│  │ Agent Loader │   │ Agent          │   │ tool_runs (SQLite)   │ │
│  │ MCP Bridge   │   │ (always_ask)   │   └──────────────────────┘ │
│  └──────────────┘   └────────────────┘                           │
│                                                                  │
│  Event Bus: TOOL_REQUESTED · TOOL_APPROVED · TOOL_EXECUTED ·     │
│             TOOL_FAILED · TOOL_LOOP_COMPLETED                    │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
   Filesystem              Docker / Git            MCP Servers
   Terminal                Browser                 External APIs
```

### 3.2 Agent alignment (`CONVERSATION_AGENTS.md`)

| Agent | Role in tools |
|-------|----------------|
| **Intent Agent** | Detects `execute_tool`, `search`, `modify_project`, etc. |
| **Planner Agent** | Builds plan: memory → tools → LLM → voice |
| **Tool Router** | Maps intent + message to candidate tools from registry |
| **Terminal / Filesystem / Git / Docker / Browser / MCP Agents** | One handler per domain; invoked by executor |
| **Permission Agent** | `always_allow` / `always_ask` / `deny` per tool + args |
| **Sandbox Agent** | Isolated execution for risky commands |
| **Memory Coordinator** | Retrieves prior `tool_runs` when user asks “how did we do X?” |

---

## 4. Tool Registry

### 4.1 What gets registered

Every tool is a **declarative record** plus a **Python handler**:

```python
@dataclass
class ToolDefinition:
    name: str                          # stable id, e.g. "memory.search"
    title: str                         # human label for UI + voice
    description: str                   # shown to LLM in tool schema
    category: ToolCategory             # memory | system | filesystem | git | docker | browser | mcp | skill
    parameters: JSONSchema             # arguments the LLM may pass
    permission: PermissionLevel        # allow | ask | deny
    latency_class: Literal["fast", "slow"]  # fast = inline budget; slow = async
    handler: Callable[..., Awaitable[ToolResult]]
    enabled: bool = True
    source: str = "core"               # core | skill:{id} | agent:{id} | mcp:{server}
```

Registry lives in `runtime/tools/registry.py`. Tools load at startup; skills/agents/MCP add entries dynamically later.

### 4.2 Initial catalog (phased)

#### Phase T0 — Read-only, fast (ship first)

| Tool | Purpose | Permission | Latency |
|------|---------|------------|---------|
| `vitals.fetch` | YouTube / Instagram / Ollama metrics (wraps existing `/api/vitals`) | allow | fast |
| `memory.search` | Semantic search over vault (`POST /api/memory/search`) | allow | fast |
| `memory.retrieve` | Full retrieve block for session | allow | fast |
| `system.status` | Runtime + service health | allow | fast |
| `time.now` | Current time / timezone | allow | fast |

These need no user approval, fit the 300ms retrieval budget, and prove the tool loop without side effects.

#### Phase T1 — Read-only, local inspection

| Tool | Purpose | Permission | Latency |
|------|---------|------------|---------|
| `filesystem.read` | Read file under allowed roots | allow | fast |
| `filesystem.list` | List directory | allow | fast |
| `git.status` | Working tree status | allow | fast |
| `git.log` | Recent commits | allow | fast |
| `docker.ps` | List containers | allow | fast |

Allowed roots: project dir, `~/jarvis/`, user-configured paths in settings.

#### Phase T2 — Mutating (approval required)

| Tool | Purpose | Permission | Latency |
|------|---------|------------|---------|
| `filesystem.write` | Create/overwrite file | ask | slow |
| `filesystem.delete` | Delete file | ask | slow |
| `terminal.run` | Shell command | ask | slow |
| `git.commit` | Stage + commit | ask | slow |
| `docker.run` | Start container | ask | slow |
| `docker.stop` | Stop container | ask | slow |
| `memory.episodic.write` | Write Obsidian note under `agents/` | ask | slow |

#### Phase T3 — External & MCP

| Tool | Purpose | Permission | Latency |
|------|---------|------------|---------|
| `browser.search` | Web search + summarize | ask | slow |
| `browser.fetch` | Fetch URL → markdown | ask | slow |
| `github.*` | Issues, PRs, repos (via MCP or REST) | ask | slow |
| `mcp.{server}.{tool}` | Proxied MCP tool | ask (default) | slow |

#### Phase T4 — Skills & agents as tools

Skills and agents register **composite tools** — e.g. `skill.am_report`, `agent.research.run` — that internally run multi-step workflows. Same registry, richer handlers.

---

## 5. How JARVIS knows what is available

### 5.1 Per-turn tool context

Before the LLM runs, the runtime builds a **Tool Context Block** (parallel to `buildContextBlock()` for memory):

1. **Filter** registry by: user settings (`toolsEnabled`), session flags, agent_id, intent, latency budget.
2. **Serialize** surviving tools to provider-native tool schemas (Anthropic `tools`, Ollama/OpenAI `functions`).
3. **Inject** into the request — not the system prompt prose — so the model sees structured definitions only for *allowed* tools this turn.

```markdown
## Available Tools (this turn)
You may call these tools if needed. Do not mention tool names unless the user asks.
If no tool is required, respond normally.

- vitals.fetch — Live YouTube, Instagram, Ollama metrics
- memory.search — Search Obsidian vault and past notes
- system.status — Check JARVIS runtime and service health
```

For providers without native tool support, fall back to a JSON-in-system-prompt pattern with strict output parsing.

### 5.2 Dynamic registration

| Source | When loaded | Example |
|--------|-------------|---------|
| **Core registry** | Runtime startup | `memory.search`, `vitals.fetch` |
| **Settings toggles** | User enables/disables categories | Docker tools off → omitted from schema |
| **Skills** | Skill manifest loaded | `skill.plan_today` |
| **Agents** | Agent registered for session | `agent.research` exposes research toolset |
| **MCP Bridge** | Server connected + healthy | `mcp.github.create_issue` |

JARVIS always sees the **effective set** for the current turn — never the full global catalog if disabled.

---

## 6. Tool selection flow

### 6.1 Decision pipeline (pre-LLM)

Mirrors `memory.md` §3.1 gating:

```
User message
     │
     ▼
┌─────────────────────┐
│ toolsEnabled?       │──no──▶ Skip tool loop → LLM text only
└─────────┬───────────┘
          │ yes
          ▼
┌─────────────────────┐
│ Intent classification│  keyword/regex first (zero extra LLM call)
│ execute_tool?       │  triggers: run, execute, commit, search web,
│ search?             │            check docker, pull metrics, open file
│ modify_project?     │
└─────────┬───────────┘
          │
          ├─ no tool intent ──▶ Skip tool loop (greeting, explain, chat)
          │
          ▼ yes
┌─────────────────────┐
│ Tool Router         │  rank candidates by intent + message keywords
│ max_tools = 8       │  drop slow tools if voice_mode=inline_only
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ Memory retrieve     │  include procedural hits if retry/debug intent
│ "how did we …"      │  e.g. prior docker.run failures
└─────────┬───────────┘
          ▼
     Enter Tool Loop
```

**Intent gating is deterministic first.** Revisit with a small classifier LLM only if false-negative rate is high in practice (`MEMORY_IMPLEMENTATION_PLAN.md` §3.4 precedent for semantic gating).

### 6.2 Tool loop (during turn)

When the pipeline enters the loop:

```
Turn N (max default: 5 tool-use turns)
     │
     ▼
LLM receives: system + memory context + tool schemas + history + user message
     │
     ├─ text only, no tool_calls ──▶ exit loop → final reply
     │
     └─ tool_calls[] ──▶ for each call:
              │
              ▼
         Permission Agent
              │
              ├─ deny ──▶ tool result = error; continue loop
              ├─ ask ──▶ emit TOOL_APPROVAL_REQUIRED → UI/voice prompt → wait (async)
              └─ allow ──▶ Tool Executor
                        │
                        ▼
                   record tool_run (procedural)
                        │
                        ▼
                   tool result → next loop turn
```

**Voice mode behavior:**

| Latency class | Voice behavior |
|---------------|----------------|
| **fast** | Execute inline; user hears answer with data included |
| **slow + approval** | JARVIS speaks ack (“Checking Docker — one moment”); tool runs async; follow-up utterance or notification when done |
| **slow + denied** | JARVIS explains what was blocked and how to approve |

Never `await` a slow tool before the first `speakText()` unless the user explicitly asked for a blocking operation in settings (debug mode).

### 6.3 Example: “Pull my YouTube metrics”

| Step | Component | Action |
|------|-----------|--------|
| 1 | Intent Agent | `execute_tool`, confidence 0.9 |
| 2 | Tool Router | candidate: `vitals.fetch` |
| 3 | Memory | skip semantic; load last 4 turns |
| 4 | Tool Loop turn 1 | LLM calls `vitals.fetch{}` |
| 5 | Executor | fetch `/api/vitals`; 120ms |
| 6 | Procedural | `INSERT tool_runs (vitals.fetch, success, 120ms)` |
| 7 | Tool Loop turn 2 | LLM text: “YouTube subs are …” |
| 8 | Voice | speakText(reply) |

### 6.4 Example: “Commit these changes”

| Step | Component | Action |
|------|-----------|--------|
| 1 | Intent | `modify_project` + `execute_tool` |
| 2 | Tool Router | `git.status`, `git.commit` |
| 3 | Tool Loop | LLM calls `git.status` → allow → result |
| 4 | Tool Loop | LLM calls `git.commit{message:"..."}` |
| 5 | Permission | **ask** → UI shows diff + confirm |
| 6 | User | approves |
| 7 | Executor | commit; log tool_run |
| 8 | Voice | “Committed 3 files on branch …” |

---

## 7. Tool schema (LLM-facing)

Use JSON Schema compatible with Anthropic tool use and OpenAI function calling:

```json
{
  "name": "memory.search",
  "description": "Search the Obsidian vault and JARVIS knowledge base for relevant notes.",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Natural language search query" },
      "top_k": { "type": "integer", "default": 3, "minimum": 1, "maximum": 10 }
    },
    "required": ["query"]
  }
}
```

**Rules:**

- Names are stable `category.action` identifiers — never rename without migration.
- Descriptions are written for the model, not the user.
- Defaults match `MemorySettings` / tool settings where applicable.
- No secrets in schemas; auth is runtime-side.

---

## 8. Permission model

Aligned with `CONVERSATION_AGENTS.md` Security Agents and `Permission Agent`:

### 8.1 Levels

| Level | Behavior |
|-------|----------|
| `allow` | Execute immediately; log run |
| `ask` | Pause loop; surface approval UI (Mission Control modal or voice “yes/no”) |
| `deny` | Return structured error to LLM; never execute |

### 8.2 Always-ask operations

From `CONVERSATION_AGENTS.md`:

- Delete file
- Terminal commands (except allowlisted read-only)
- Git push
- Docker stop/remove
- Any MCP tool marked `destructive`
- Writes outside `~/jarvis/agents/` namespace

### 8.3 Settings hierarchy

```
User level (ToolSettings in localStorage + runtime profile)
  · toolsEnabled (master)
  · per-category toggles: memory, filesystem, terminal, git, docker, browser, mcp
  · defaultPermission: cautious | balanced | trusted
  · allowedPaths[], deniedPaths[]
  · commandAllowlist[] (terminal)

Session level
  · toolsEnabledForSession
  · elevatedSession (temporary trust — expires on NEW SESSION)

Request level
  · inlineFastToolsOnly (voice mode — default true during speak)
```

**Effective rule:** a tool runs only if `toolsEnabled && categoryEnabled && sessionToolsEnabled && permission != deny && (allow || userApproved)`.

---

## 9. Procedural memory integration

Already scaffolded in `runtime/memory/procedural.py` and `POST /api/memory/tool-run` (`MEMORY_IMPLEMENTATION_PLAN.md` §5).

### 9.1 Write path

Every executor completion calls:

```python
await procedural.record_tool_run(
    conn,
    tool_name="docker.run",
    success=True,
    session_id=session_id,
    agent_id="jarvis",
    input_json=json.dumps(args),
    output_json=json.dumps(result),
    duration_ms=842,
)
```

Fire-and-forget from the conversation path — same pattern as `storeTurn()`.

### 9.2 Read path

When intent matches retry/debug patterns (`MEMORY_DECISION.md` §Retrieval Flow):

- “How did we start Whisper last time?”
- “That docker command failed — try again”

Orchestrator queries `recent_tool_runs(tool_name=..., limit=5)` and injects into context block (`memory.md` §8):

```markdown
### Prior tool usage
- docker.run (2026-07-01): success — launched whisper container on :9000
- docker.run (2026-06-28): failure — port 9000 already allocated
```

### 9.3 Memory decision flow

Tool execution creates events (`MEMORY_DECISION.md` Stage 1):

```yaml
type: tool_execution
source: runtime
tool: git.commit
success: true
importance: 5-7  # mutating ops score higher
```

Background agents may promote significant outcomes to episodic/decision memory — never inline during voice.

---

## 10. Skills and agents (later)

Skills and agents are **not** required for T0–T2. When they ship (`goal.md` Phase F, `CONVERSATION_AGENTS.md` Phase 4):

| Concept | Definition |
|---------|------------|
| **Skill** | Declarative workflow + prompt + tool subset. Registers one or more composite tools. Example: `skill.am_report` runs vitals + inbox scan + speaks briefing. |
| **Agent** | Longer-lived executor with own `agent_id`, memory namespace, and tool policy. Example: `agent.research` writes episodic notes, uses `memory.search` + `browser.search`. |
| **MCP Agent** | Discovers external MCP tools at runtime; normalizes to registry entries. |

Registration API (future):

```
POST /api/tools/register   { source: "skill", id: "am_report", tools: [...] }
DELETE /api/tools/register/{id}
GET /api/tools/catalog     → effective tools for session
```

Command Deck buttons (`overview.md` §5) wire to skills — e.g. `METRICS-PULL` → `skill.metrics_pull` → `vitals.fetch`.

---

## 11. Runtime layout

```
runtime/
  tools/
    __init__.py
    registry.py          # load, list, get, register
    router.py            # intent → candidate tools
    executor.py          # validate args, call handler, log
    permissions.py       # allow / ask / deny
    loop.py              # multi-turn tool loop supervisor
    schemas.py           # ToolDefinition, ToolResult, ToolCall
    handlers/
      vitals.py
      memory_tools.py
      filesystem.py
      git.py
      docker.py
      terminal.py
      browser.py
      mcp_bridge.py
  models/
    tools.py             # Pydantic request/response types
```

---

## 12. API contract (React ↔ runtime)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/tools/health` | Registry loaded; handler count; MCP status |
| `GET` | `/api/tools/catalog` | `{ sessionId, agentId }` → effective tool list (settings + intent optional) |
| `POST` | `/api/tools/plan` | `{ sessionId, userMessage, agentId }` → `{ useTools, candidates[], intent }` |
| `POST` | `/api/tools/execute` | `{ sessionId, toolName, args, approved? }` → `{ result, runId }` |
| `POST` | `/api/tools/loop` | Full supervised loop: message in → `{ reply, toolRuns[], turns }` out |
| `POST` | `/api/tools/approve` | `{ approvalId, approved }` → resume paused loop |
| `POST` | `/api/memory/tool-run` | *(exists)* procedural log — called by executor |

**Primary integration for voice:** `POST /api/tools/loop` replaces a single `think()` call when the planner says tools may be needed. Otherwise `think()` stays text-only (no regression).

---

## 13. Frontend integration

### 13.1 New files

| File | Role |
|------|------|
| `app/src/services/tools.ts` | Fetch client: `planTools`, `runToolLoop`, `approveTool` |
| `app/src/stores/tool-settings-store.ts` | User toggles, paths, permission mode |
| `app/src/sections/ToolSettingsSheet.tsx` | Settings UI (mirror MemorySettingsSheet) |
| `app/src/components/ToolApprovalDialog.tsx` | Diff / command preview + approve/deny |

### 13.2 `jarvis.ts` changes

```typescript
// Pseudocode — actual flow in useRealtimeConversation
async function thinkWithTools(userMessage, history, vitals, sessionId, signal) {
  const memoryContext = await retrieveMemory(...)
  const plan = await planTools(sessionId, userMessage)

  if (!plan.useTools) {
    return think(userMessage, history, vitals, signal, memoryContext)
  }

  return runToolLoop({
    sessionId,
    userMessage,
    history,
    vitals,
    memoryContext,
    signal,
    onApprovalRequired: (req) => showToolApprovalDialog(req),
    onAcknowledge: (text) => speakText(text),  // fast ack for slow tools
  })
}
```

### 13.3 StatusBar & observability

- **Tools** button next to Memory — catalog health, enabled count.
- **Notification Agent** surfaces: tool running, tool failed, approval needed.
- **Metrics Agent** tracks: tool loop turns, p95 execute latency, approval wait time.

Event bus messages (for future WebSocket stream):

```
TOOL_PLANNED · TOOL_APPROVAL_REQUIRED · TOOL_STARTED · TOOL_EXECUTED ·
TOOL_FAILED · TOOL_LOOP_COMPLETED
```

---

## 14. Provider compatibility

| Provider | Tool calling | Notes |
|----------|--------------|-------|
| **Anthropic** | Native `tools` param | Primary for tool loop — best schema adherence |
| **Ollama** | Model-dependent (`tools` / JSON mode) | Gate tool loop on model capability in AI Settings |
| **Gemini** | Function calling | Same pattern as Anthropic |
| **Voicebox fallback** | No tools | Degrade to text-only `think()` |

When active provider lacks tool support, runtime either switches to a tool-capable model for the loop only (setting: `toolModel`) or skips tools with a logged warning.

---

## 15. Implementation phases

Aligned with `goal.md` Phase F and memory M4 procedural readiness.

### Phase T0 — Tool loop skeleton (1 week)

**Goal:** JARVIS calls `vitals.fetch` during conversation.

- [ ] `runtime/tools/registry.py` + handlers for T0 catalog
- [ ] `runtime/tools/loop.py` with `max_turns=5`, timeout
- [ ] `POST /api/tools/loop` + `GET /api/tools/catalog`
- [ ] Wire `jarvis.ts` / `useRealtimeConversation.ts` behind `toolsEnabled`
- [ ] Log every run via existing `POST /api/memory/tool-run`
- [ ] Anthropic tool-use path first; Ollama if model supports

**Exit:** “Pull my metrics” → spoken answer with live vitals; run logged in `tool_runs`.

### Phase T1 — Settings + read-only local tools (1 week)

- [ ] `tool-settings-store.ts` + `ToolSettingsSheet.tsx`
- [ ] `filesystem.read/list`, `git.status/log`, `docker.ps`
- [ ] Path allowlist enforcement
- [ ] StatusBar Tools button + health pill

**Exit:** “What’s in the runtime folder?” reads and summarizes without approval.

### Phase T2 — Permissions + mutating tools (1–2 weeks)

- [ ] Permission Agent + `ToolApprovalDialog`
- [ ] `terminal.run`, `git.commit`, `filesystem.write`, `docker.run/stop`
- [ ] Async slow-tool path with voice ack
- [ ] Procedural retrieval in orchestrator (“how did we …”)

**Exit:** “Commit with message X” shows diff, waits for approval, commits, speaks confirmation.

### Phase T3 — MCP + browser + Command Deck (2 weeks)

- [ ] MCP Bridge — discover and proxy MCP tools
- [ ] Browser search/fetch handlers
- [ ] Wire Command Deck buttons to skill stubs
- [ ] WebSocket event stream for tool progress

**Exit:** `METRICS-PULL` runs real vitals tool; GitHub MCP tool works with approval.

### Phase T4 — Skills & multi-agent (Phase 4 roadmap)

- [ ] Skill loader + manifests under `.cursor/skills/` or `~/jarvis/skills/`
- [ ] Agent tool policies per `agent_id`
- [ ] Composite tools (`skill.am_report`, `agent.research.run`)
- [ ] Handoff: one agent’s tool result becomes another’s context

**Exit:** Research agent runs browser + memory tools, writes episodic note, JARVIS summarizes by voice.

---

## 16. Testing checklist

| Test | Expected |
|------|----------|
| `toolsEnabled` off | Zero tool API calls; plain `think()` |
| Greeting (“hello”) | Intent skips tool loop |
| `vitals.fetch` | Inline <300ms; spoken metrics |
| Permission ask | Loop pauses; deny → LLM explains; approve → executes |
| Provider without tools | Graceful text-only fallback |
| Voice latency | First speech not blocked by slow tool |
| `tool_runs` row | Every execution logged with duration |
| Procedural retrieve | “How did we run docker last time?” cites prior run |
| Incognito session | Tools disabled when session incognito (match memory rules) |
| MCP server down | Catalog excludes MCP tools; health pill degraded |

---

## 17. Decisions locked

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Orchestrator | **Python runtime** | Matches memory runtime; event bus colocated |
| Tool loop owner | **Runtime `loop.py`** | LLM proposes; runtime executes — consistent with agent architecture |
| Intent gating | **Keyword/regex first** | Zero extra LLM round-trip; same pattern as semantic gating |
| Procedural storage | **Existing `tool_runs`** | M4 schema already shipped |
| Approval UX | **Modal + voice confirm** | WCAG-friendly; explicit for destructive ops |
| First provider | **Anthropic** | Best tool-use support; Ollama follows per model |
| Skills/agents | **Deferred to T4** | Registry + loop prove the path first |
| Voice rule | **Ack then async** | Never block `speakText()` on slow tools |

---

## 18. Open questions (decide during T0)

| Question | Options | Recommendation |
|----------|---------|----------------|
| Tool loop location | Browser vs runtime | **Runtime** — secrets, permissions, logging stay server-side |
| Single vs split LLM calls | `/tools/loop` monolith vs stream | **Monolith first**; WebSocket stream in T3 |
| Ollama tool models | llama3.2 vs dedicated | Test `llama3.2`; document fallback model in AI Settings |
| Approval timeout | 60s / 5min / indefinite | **5min** then cancel with spoken “approval timed out” |

---

## 19. Related documents

| Document | Relevance |
|----------|-----------|
| [`CONVERSATION_AGENTS.md`](CONVERSATION_AGENTS.md) | Tool Agents, Permission Agent, conversation flow |
| [`memory.md`](memory.md) | Procedural layer, context injection, settings hierarchy |
| [`MEMORY_DECISION.md`](MEMORY_DECISION.md) | Tool events → memory classification |
| [`MEMORY_IMPLEMENTATION_PLAN.md`](MEMORY_IMPLEMENTATION_PLAN.md) | M4 `tool_runs`, `/api/memory/tool-run` |
| [`overview.md`](../reference/overview.md) | Phase 3 Tool Registry status |
| [`goal.md`](../../goal.md) | Phase F — tools, agents, Command Deck |
| [`.cursor/aidocs/docs/knowledge/AGENT_SDK_AGENT_LOOP.md`](.cursor/aidocs/docs/knowledge/AGENT_SDK_AGENT_LOOP.md) | Tool loop turns, messages, limits |
| [`.cursor/aidocs/docs/knowledge/MANAGED_AGENTS_TOOLS.md`](.cursor/aidocs/docs/knowledge/MANAGED_AGENTS_TOOLS.md) | Tool configuration patterns |

---

## 20. Summary

| Question | Answer |
|----------|--------|
| Does JARVIS decide to use tools? | **Yes** — via intent gating + LLM tool loop, supervised by runtime |
| Who executes tools? | **Python runtime** — never the browser or raw LLM |
| When are tools offered? | When intent + settings warrant; not every turn |
| How does JARVIS know what exists? | **Tool Registry** filtered per turn → schemas sent to LLM |
| Where are runs remembered? | **`tool_runs`** procedural memory; retrievable on debug/retry |
| What ships first? | **T0 read-only fast tools** (`vitals.fetch`, `memory.search`) + loop |
| Skills/agents? | **Later (T4)** — register on the same registry |

**Next concrete step:** Phase T0 — `runtime/tools/registry.py`, handler for `vitals.fetch`, `POST /api/tools/loop`, wire Anthropic tool-use in `jarvis.ts` behind `toolsEnabled`.
