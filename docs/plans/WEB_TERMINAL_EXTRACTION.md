# JARVIS Web Terminal — Extraction Catalog

**Status:** Analysis only — no code copied into agentic-os  
**Date:** 2026-09-15  
**Clones (outside this workspace):**

| Repo | Path | License |
|------|------|---------|
| aictl | `/Users/imdadareeph/Documents/dev/2026/git-downloads/aictl` | **PolyForm Noncommercial 1.0.0** — reimplement ideas in Python; do not vendor Rust |
| Ghost OS | `/Users/imdadareeph/Documents/dev/2026/git-downloads/ghost-os` | **MIT** — wrap as external MCP binary later; do not merge Swift into `runtime/` |
| Hyper Canary | `/Users/imdadareeph/Documents/dev/2026/git-downloads/hyper-canary` | **MIT** (Vercel) — extract PTY↔Xterm protocol; do not ship Electron/Hyper |

Parent analysis: [`WEB_TERMINAL_ANALYSIS.md`](WEB_TERMINAL_ANALYSIS.md).

---

## 1. What each clone actually is

| Clone | Interactive PTY in a renderer? | Use for JARVIS web terminal |
|-------|--------------------------------|-----------------------------|
| aictl | No (`exec_shell` = `sh -c`) | Security / approval / audit |
| Ghost OS | No (native AX computer-use) | Later MCP “hands” |
| **Hyper Canary 4.0.0** | **Yes** (Electron `node-pty` ↔ Xterm.js 5.3) | **PTY session protocol for WT1** |

aictl desktop voice is Whisper → chat composer, not a shell. Ghost OS has no browser terminal.

Hyper **is** a real TTY, but the host is Electron IPC, not a browser WebSocket. JARVIS keeps FastAPI as the PTY master and copies Hyper’s **session API and Xterm wiring**, not the app.

The web-terminal stack remains: **Xterm.js in Mission Control + Python-owned PTY over WebSocket**, with Hyper as the reference implementation of that loop.

---

## 2. aictl — extract (reimplement in Python)

Do not copy files. Rewrite the behavior in `runtime/tools/permissions.py`, `handlers/terminal.py`, and related modules.

### 2.1 Must-extract for `terminal.run` and a future PTY

| Idea | Where in aictl | JARVIS target | Why |
|------|----------------|---------------|-----|
| Policy object (shell / paths / resources / env / disabled tools) | `crates/aictl-core/src/security.rs` `SecurityPolicy` (~L66–96) | `runtime/tools/permissions.py` + Tool Settings | Today JARVIS has a deny regex + cautious allowlist only |
| Blocked command **names** (not regex-on-the-whole-line) | `DEFAULT_BLOCKED_COMMANDS` (~L19–22): `rm`, `sudo`, `dd`, `nc`, `eval`, … | `permissions.py` | `ls \| rm` can hide behind JARVIS’s current whole-string regex |
| Split `\|` `&&` `\|\|` `;` with quote awareness | `split_shell_commands` (~L726+) | `permissions.py` | Compound commands |
| Strip prefixes (`sudo`, `env`, `nohup`, `nice`, `command`) | `COMMAND_PREFIXES` (~L60–62) | `permissions.py` | `sudo ls` must still be `sudo` |
| Block `$(…)`, backticks, process substitution | `check_shell` (~L680–691) | `permissions.py` | Bypass of deny-list |
| CWD jail + `..` normalize without touching disk | `normalize_path` (~L1082–1095) + path checks | filesystem + terminal | Align with `allowedPaths[]` |
| Blocked paths | `DEFAULT_BLOCKED_HOME_PATHS` / `ABSOLUTE` (~L26–28): `.ssh`, `.gnupg`, `.aws`, `/etc/shadow` | permissions | Missing today |
| Env scrub allowlist + `*_KEY`/`*_SECRET`/`*_TOKEN`/`*_PASSWORD` | `SAFE_ENV_VARS`, `scrubbed_env` (~L32–47, L1101–1139) | `terminal.py` before `create_subprocess_shell` | Stop secrets in child env / leaked stdout |
| 30s timeout | `DEFAULT_SHELL_TIMEOUT_SECS` + `shell.rs` `tokio::time::timeout` | already 30s; add **kill process group** on timeout | Current handler can leave orphans |
| Output sanitization | `sanitize_output` (~L1156) | tool loop before feeding LLM | Prompt injection via stdout |
| JSONL audit (executed / denied_by_policy / denied_by_user) | `crates/aictl-core/src/audit.rs` | extend `tool_runs` or a session JSONL | Reviewer log for voice-approved shells |
| Dedicated `git` (no shell, flag allowlist) | `crates/aictl-core/src/tools/git.rs` | existing `git.*` handlers | Safer than `terminal.run "git …"` |
| MCP deny-servers / HTTPS-only remote MCP | `check_mcp_tool`, `validate_mcp_url` (~L447–538) | `runtime/tools/mcp_config.py` | JARVIS already has MCP; host allow/deny is missing |
| Workspace required before shell | `has_workspace_sentinel` in `check_shell` (~L671) | PTY open | Don’t spawn a shell in a random CWD |

### 2.2 Should-extract for voice Mission Control (UX, not PTY)

| Idea | Where | JARVIS mapping |
|------|-------|----------------|
| Tool approval: Allow / Deny / **Always allow** | `webview/src/components/ToolApproval.tsx` | `ToolApprovalDialog.tsx` has Approve/Deny only. “Always this session” maps to `elevatedSession` in `TOOLS.md` §8.3 |
| Keyboard: Enter allow, Esc deny, ⌘A always | same | Voice: “yes” / “no” / “always this session” |
| Security shield (ok / warn / unprotected) | `webview/src/components/SecurityShield.tsx` | StatusBar Tools button — show if terminal category on + unrestricted |
| Hooks as harness (PreToolUse can block/approve) | `crates/aictl-core/src/hooks.rs` | agentic-os already has `.claude/hooks`; runtime should fire `TOOL_APPROVAL_REQUIRED` hooks that **cannot** be talked out of by the model |
| `--unrestricted` stays a **launch flag**, not a config toggle | `UNRESTRICTED` OnceLock in `security.rs` | Never expose “disable security” to STT |

### 2.3 Nice-to-read, do not port

| Piece | Path | Reason to skip |
|-------|------|----------------|
| XML `<tool name>` parser | `tools.rs` | JARVIS uses native provider tool APIs |
| 35 built-in tools | `tools/*.rs` | Keep T0–T4 catalog |
| `memory.json` | `memory.rs` | Five-layer JARVIS memory |
| `aictl-server` LLM proxy | `crates/aictl-server/` | Vite + FastAPI already proxy |
| Whisper.cpp in Tauri | `crates/aictl-desktop/src/voice.rs` | JARVIS already has Chrome STT + Whisper refine on `:9000` |
| VoiceModal download/record/accept | `VoiceModal.tsx` | Composer-mic pattern; JARVIS is conversation-first |
| GGUF/MLX local inference | `llm/gguf.rs`, `llm/mlx.rs` | Ollama is the local brain |
| Desktop maps/charts | `view_map`, `draw_chart` | Not a terminal |
| Coding-agent phase tags | `coding.rs` | Later T4 if ever |

### 2.4 Voice-session translation (aictl → JARVIS)

aictl desktop voice is **batch STT → chat composer**. JARVIS needs **continuous conversation → tool loop → spoken ack**.

| aictl | JARVIS |
|-------|--------|
| Mic → Whisper → insert into textarea → user hits send | STT final → Intent Agent → tool loop |
| y/N or `--auto` | Permission Agent + spoken yes/no |
| Tool result printed in chat | Summarize for TTS; show raw in terminal panel |
| Session JSON under `~/.aictl/sessions/` | Existing SQLite session + `tool_runs` |
| Kill shell? **No PTY to kill** | Must kill PTY on NEW SESSION |

`exec_shell` in `tools/shell.rs` is ~45 lines: `sh -c`, scrubbed env, timeout, truncate. That is JARVIS `terminal.run` today, plus env scrub. **It still is not an interactive terminal.**

---

## 3. Ghost OS — extract later (MCP “hands”), not for WT1

### 3.1 What to keep as an **external binary**

JARVIS already has T3 MCP (`runtime/tools/handlers/mcp_bridge.py`). The right incorporation is:

```text
User: “send an email to Bob about Q4”
  → speak ack
  → mcp.ghost-os.ghost_recipes  (or cache recipe list)
  → mcp.ghost-os.ghost_run { recipe: "gmail-send", params: … }
  → Permission Agent ask (destructive / send)
  → never block speakText() on the 7-step recipe
```

Do **not** rewrite AXorcist in Python.

| Idea | Where | JARVIS mapping |
|------|-------|----------------|
| 29 MCP tools (perceive / act / wait / recipes / learn / vision) | `Sources/GhostOS/MCP/MCPTools.swift` | MCP catalog entries, `ask` by default |
| 60s per-tool timeout + slow-tool log (>5s) | `MCPDispatch.swift` L14–45 | Voice: treat all Ghost tools as `latency_class=slow` |
| Orient-before-act (`ghost_context` first) | `GHOST-MCP.md` Rule 2 | Skill prompt for a `skill.computer_use` wrapper — not the hot path |
| Recipes-first | `GHOST-MCP.md` Rule 1 + `Recipes/RecipeTypes.swift` | T4 skill / procedural memory |
| Recipe JSON schema v2 | `recipes/gmail-send.json` | Auditable, voice-parameterized (`{{recipient}}`) |
| Preconditions (`app_running`, `url_contains`) | `RecipePreconditions` | Fail fast, speak “Chrome isn’t on Gmail” |
| Wait conditions | `RecipeWaitCondition` | Don’t sleep blindly in the voice loop |
| Learn-by-watching | `Learning/LearningRecorder.swift` | Voice: “watch me” → `ghost_learn_start` / `_stop` — **Input Monitoring** permission |
| `ghost doctor` | `Sources/ghost/Doctor.swift` | Pattern for JARVIS tools health (AX, MCP, recipes) — optional `system.ghost_doctor` wrapper |
| Perception vs action vs focus rules | `GHOST-MCP.md` Rule 4 | Skill text so the model doesn’t `ghost_press` without `app` |

### 3.2 Recipe shape (the portable part)

From `recipes/gmail-send.json`: parameterized steps, AX locators, `wait_after`, `on_failure: stop`. This is the piece JARVIS should **understand** (list/run/show) even if Ghost executes it.

Voice fit: one spoken intent → one `ghost_run`. Do not have JARVIS narrate seven clicks.

### 3.3 Do not extract into the web terminal

| Ghost piece | Why not |
|-------------|---------|
| Opening Terminal.app via `ghost_focus` + `ghost_type` | Leaves Mission Control; no PTY stream; no session bind |
| Vision sidecar / ShowUI-2B (`vision-sidecar/server.py`) | Slow, GPU, not needed for a shell panel |
| Screenshots on the voice hot path | `ghost_screenshot` returns PNG; don’t TTS it |
| Swift sources in `runtime/` | Keep `ghost` on PATH; MCP stdio |

### 3.4 macOS permission tax (call out in Tool Settings if/when wired)

From `Doctor.swift`: Accessibility, Screen Recording, Input Monitoring. A voice “open Ghost” without those grants will fail. Surface as a settings health row, same idea as aictl’s Security Shield.

---

## 4. Priority for JARVIS (when implementation starts)

Still not implementing here. Order that matches the clones:

| Priority | Work | Source of truth |
|----------|------|-----------------|
| **P0** | Harden `terminal.run`: segment split, prefix strip, subshell block, env scrub, blocked paths, kill-on-timeout | aictl `security.rs` + `shell.rs` (reimplement) |
| **P1** | Web PTY: `terminal.open/write/close` + Xterm.js + WS, session-scoped | Original analysis — **not in either clone** |
| **P2** | Approval “always this session” + security shield on StatusBar | aictl `ToolApproval.tsx`, `SecurityShield.tsx` |
| **P3** | MCP host allow/deny + Ghost as optional server | aictl MCP URL gate + Ghost binary |
| **P4** | Voice “send this email” via `ghost_run` recipes | Ghost `recipes/*.json` + `GHOST-MCP.md` |

P1 does not depend on Ghost. P0 can ship without a visible terminal and already makes voice “run this command” safer.

---

## 5. File map (read these, ignore the rest)

### aictl — ~12 files

```
crates/aictl-core/src/security.rs          # policy, check_shell, split, scrub, sanitize
crates/aictl-core/src/tools/shell.rs       # exec_shell
crates/aictl-core/src/tools/git.rs         # no-shell git
crates/aictl-core/src/audit.rs             # JSONL outcomes
crates/aictl-core/src/hooks.rs             # PreToolUse block/approve
crates/aictl-core/src/run.rs               # agent loop + confirm
crates/aictl-core/src/mcp.rs               # MCP merge (already have a bridge)
docs/TOOLS.md                             # operator-facing security list
crates/aictl-desktop/webview/src/components/ToolApproval.tsx
crates/aictl-desktop/webview/src/components/SecurityShield.tsx
crates/aictl-desktop/src/voice.rs          # skip porting; contrast only
crates/aictl-desktop/webview/src/components/VoiceModal.tsx  # skip porting
```

### Ghost OS — ~10 files

```
GHOST-MCP.md                               # agent rules (recipes first, orient, focus)
Sources/GhostOS/MCP/MCPTools.swift         # 29 tool schemas
Sources/GhostOS/MCP/MCPDispatch.swift      # timeout + routing
Sources/GhostOS/Recipes/RecipeTypes.swift  # schema
Sources/GhostOS/Recipes/RecipeEngine.swift # runner
recipes/gmail-send.json                    # canonical example
recipes/slack-send.json
recipes/finder-create-folder.json
Sources/GhostOS/Learning/LearningRecorder.swift
Sources/ghost/Doctor.swift
```

---

## 6. Legal reminder

- **aictl:** PolyForm Noncommercial. Reading the clone is fine. Pasting `security.rs` into agentic-os is not. Reimplement in Python with original tests.
- **Ghost OS:** MIT. Shipping `ghost` as a user-installed MCP server is the clean path. Copying Swift into this repo is unnecessary.

---

## 7. Next step (when you want implementation)

Say which slice: **P0 harden `terminal.run`**, **P1 web PTY**, or **P3/P4 Ghost MCP**. One slice at a time. Voice latency stays sacred on all of them.
