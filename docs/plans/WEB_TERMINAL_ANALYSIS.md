# JARVIS Web Terminal — Analysis Report

**Project:** J.A.R.V.I.S. / Agentic OS  
**Date:** 2026-09-15  
**Status:** Analysis only — no implementation  
**Constraint:** every surface must stay voice-controlled inside a JARVIS session  
**Related:** [`../specs/TOOLS.md`](../specs/TOOLS.md) · [`../specs/CONVERSATION_AGENTS.md`](../specs/CONVERSATION_AGENTS.md) · [`../../goal.md`](../../goal.md)

---

## 1. Verdict (read this first)

JARVIS should get a **real in-browser PTY**, opened on voice request, bound to the current session, and driven by the existing tool loop + Permission Agent. The right stack is **Xterm.js in Mission Control + a Python-owned PTY over WebSocket**. Ready-made web shells (ttyd, Wetty) and full apps (Hyper, aictl desktop, Ghost OS) are **references**, not drop-in products.

| Source | Clone outside workspace? | Fit for *web terminal*? | Fit for JARVIS overall? |
|--------|--------------------------|-------------------------|-------------------------|
| **Xterm.js** | No — npm dependency | **Yes — use this** | Frontend renderer only |
| **ttyd** | Optional later (binary sidecar) | Partial — visual fidelity, weak voice control | Sidecar only |
| **Wetty** | No | Poor — SSH/login product, extra Node runtime | Skip |
| **Hyper Canary** | **Yes — extract PTY↔Xterm protocol** | Strong as a *pattern* (do not ship the app) | Session write/resize/kill + FitAddon |
| **[aictl](https://github.com/pwittchen/aictl)** | **Yes — extract security + loop patterns** | No — `exec_shell` is one-shot, not a PTY UI | **Strong** for T2 hardening |
| **[Ghost OS](https://github.com/ghostwright/ghost-os)** | **Yes later — extract recipes + MCP computer-use** | No — native macOS AX, not a web terminal | **Strong** for a later “hands” phase |

Do **not** vendor these into this repo. Clones live outside this workspace:

- `/Users/imdadareeph/Documents/dev/2026/git-downloads/aictl`
- `/Users/imdadareeph/Documents/dev/2026/git-downloads/ghost-os`
- `/Users/imdadareeph/Documents/dev/2026/git-downloads/hyper-canary`

File-level extraction (what to reimplement vs skip): [`WEB_TERMINAL_EXTRACTION.md`](WEB_TERMINAL_EXTRACTION.md).

---

## 2. What JARVIS already has (and what it is not)

The Terminal Agent already exists as Phase T2:

| Piece | Location | Behavior |
|-------|----------|----------|
| Tool | `terminal.run` in `runtime/tools/registry.py` | One-shot `sh -c`, 30s timeout, stdout/stderr truncated |
| Handler | `runtime/tools/handlers/terminal.py` | `asyncio.create_subprocess_shell` — **no PTY, no stdin after launch** |
| Permissions | `runtime/tools/permissions.py` | Hard deny (`rm -rf`, `mkfs`, `curl \| sh`, fork bomb, force-push). Cautious = read-only allowlist. Else **ask** |
| UI | `ToolApprovalDialog.tsx` | Shows command preview; voice yes/no is specified, modal is shipped |
| Settings | Tool Settings → category `terminal` | **Off by default** (`terminal: false`) |
| Voice | `TOOLS.md` §6.2 | Slow tools ack-then-async; never block `speakText()` |

That is a **command runner**, not a terminal.

It cannot:

- Keep a live shell (`cd` then `ls` in the same process)
- Run interactive programs (`vim`, `htop`, `python -i`, `ssh`, pagers)
- Show ANSI color / cursor / resize
- Let the user type while JARVIS also types
- Open on “Jarvis, open a terminal” as a visible Mission Control surface

The feature request is therefore a **new capability** (`terminal.session`), not a rewrite of `terminal.run`. Keep both.

```text
Voice: “open a terminal”
  → Permission Agent (ask)
  → speak ack (“Opening a terminal.”)
  → runtime allocates a PTY bound to session_id
  → Mission Control mounts Xterm.js
  → user can type; JARVIS can write via tools

Voice: “run docker ps”
  → if session open: terminal.write { text: "docker ps\n" }
  → else: existing terminal.run (one-shot)

Voice: “close the terminal”
  → terminal.close → PTY killed → panel hides
```

---

## 3. Two products that look similar (do not collapse them)

| Mode | What it is | Voice UX | Security |
|------|------------|----------|----------|
| **A. Command runner** (already shipped) | `sh -c` one shot | “Run `git status`.” Ack → result spoken as a summary | Per-command deny/ask/allowlist |
| **B. Interactive web terminal** (requested) | Real PTY + Xterm.js | “Open a terminal.” Then type or speak further commands | Gate **session open**. Once open, the shell is a full TTY — per-line filtering is lossy |

Mode B is what ttyd/Wetty/Xterm.js exist for. Mode A is what aictl `exec_shell` and JARVIS `terminal.run` are. JARVIS needs **A for most voice turns** and **B only when asked or when the task is interactive**.

A planner rule should prefer A:

- Greeting / Q&A → no terminal
- “What does `ls` print here?” → `terminal.run`
- “Open a terminal”, “I need a shell”, “ssh into…”, “run htop”, “keep a session” → Mode B
- Native Mac apps (Mail, Slack, Finder) → **not** this feature (Ghost OS later)

---

## 4. Ready-to-deploy web shells

Sources reviewed: [ttyd](https://github.com/tsl0922/ttyd), [Wetty](https://github.com/butlerx/wetty), [Xterm.js](https://github.com/xtermjs/xterm.js), [Hyper](https://github.com/vercel/hyper).

### 4.1 Xterm.js — use this

MIT. The actual terminal **emulator** in the browser (VT100/xterm protocol, WebGL renderer, addons for fit/web-links/search). ttyd, Wetty, Hyper, VS Code’s terminal, and most “web terminals” sit on top of it.

**JARVIS fit:** embed in Mission Control (RightPanel or a dedicated sheet), theme with existing CSS tokens, attach to a runtime WebSocket that speaks the PTY byte stream.

It is **not** a shell by itself. Something else must spawn `zsh`/`bash` with a PTY and shuttle bytes.

### 4.2 ttyd — optional sidecar, not the product

C binary. Shares a local terminal over HTTP/WebSockets. Frontend is Xterm.js. Battle-tested, tiny, MIT.

| Pros | Cons for voice JARVIS |
|------|------------------------|
| Real PTY in minutes | Separate process; not session-aware |
| No Node | Once attached, **no Permission Agent** on each keystroke |
| Good visual fidelity | Voice injection means driving *its* WebSocket, not ours |
| Localhost bind possible | Extra binary to ship/supervise |

**Fit:** useful as a **fallback sidecar** if a Python PTY is too flaky (resize, signals, `TIOCSWINSZ`). Not the primary design. If used, runtime must spawn it on `127.0.0.1` with a random token, proxy it, and kill it on session end. Never bind `0.0.0.0`.

### 4.3 Wetty — skip

Node.js + WebSockets. Full **SSH/login** terminal in the browser. Designed for jumping onto remote hosts through a web UI.

| Why skip | Notes |
|----------|--------|
| Adds a Node server to a Python + React stack | JARVIS runtime is FastAPI |
| SSH/login is the wrong primitive | Local-first OS; SSH can later be *inside* the PTY (`ssh host`) |
| Auth/session model is Wetty’s, not JARVIS’s | Would fight Permission Agent and `session_id` |
| Attack surface | Web-exposed login shells are a classic footgun |

Revisit only if a future phase is “JARVIS as a remote jump host.” That is not the current goal.

### 4.4 Hyper Canary — extract the PTY protocol, do not ship the app

Local clone: `/Users/imdadareeph/Documents/dev/2026/git-downloads/hyper-canary` (Vercel Hyper **4.0.0-canary.5**, MIT).

Hyper is still **not** something JARVIS embeds (Electron main process, Redux, plugin HOCs, native `node-pty`). It **is** the best worked example of the loop JARVIS needs:

```text
uid session
  spawn(shell --login, cols, rows, cwd, env TERM=xterm-256color)
  pty.onData → batch 16ms → renderer term.write
  term.onData → pty.write          ← this is also terminal.write from voice
  term.onResize → pty.resize
  destroy → pty.kill
```

That lives in `app/session.ts` + `lib/components/term.tsx` + `app/ui/window.ts` RPC. File-level extract: [`WEB_TERMINAL_EXTRACTION.md`](WEB_TERMINAL_EXTRACTION.md) §3.

Do not port: Electron IPC, Redux session store, tab/split chrome, Hyper plugins.

### 4.5 Comparison

| | Xterm.js | ttyd | Wetty | Hyper Canary |
|--|----------|------|-------|--------------|
| Role | Emulator library | Share local PTY over HTTP | Browser SSH/login | Desktop terminal app |
| Language | TypeScript | C | Node.js | Electron + node-pty |
| Interactive TTY | Yes (needs backend) | Yes | Yes | Yes |
| Voice-injectable | Yes, if we own the socket | Awkward | Awkward | Yes **if we copy the write() API**, not the app |
| Matches JARVIS stack | **Yes** | Sidecar | No | Protocol yes / app no |
| Permission Agent | We implement | Lost after attach | Lost after attach | None (full local shell) |
| License | MIT | MIT | MIT | MIT |
| Recommendation | **Adopt** | Optional sidecar | Do not adopt | **Extract session protocol** |

---

## 5. Recommended JARVIS architecture (when this is built)

Voice latency stays sacred. Opening a PTY is a **slow** tool: acknowledge first, then attach.

```text
┌─────────────────────────────────────────────────────────┐
│ Mission Control (React)                                 │
│  voice STT ──► tool loop ──► speak ack                  │
│  TerminalPanel ── Xterm.js ◄── WS /runtime/pty/{id}     │
│  user keystrokes ─────────────────────────────┐         │
└───────────────────────────────────────────────┼─────────┘
                                                │
┌───────────────────────────────────────────────▼─────────┐
│ Python runtime                                          │
│  terminal.open  → allocate pty, bind session_id         │
│  terminal.write → inject bytes (from LLM / voice)       │
│  terminal.close → SIGHUP, destroy, hide panel           │
│  Permission Agent on open (+ optional write policy)     │
│  tool_runs log: open/write/close (truncate I/O)         │
└─────────────────────────────────────────────────────────┘
```

### 5.1 Tool catalog (proposed, not implemented)

| Tool | Permission | Latency | Voice behavior |
|------|------------|---------|----------------|
| `terminal.open` | ask | slow | “Opening a terminal.” Panel appears. |
| `terminal.write` | ask (or session-trusted after open) | slow | Do not speak raw TTY. Summarize. |
| `terminal.read` / snapshot | allow | fast | Optional: last N lines for the model |
| `terminal.close` | allow | fast | “Terminal closed.” |
| `terminal.run` | ask (existing) | slow | Unchanged one-shot path |

### 5.2 Voice session rules

1. **Session-scoped.** PTY dies on NEW SESSION, tab close, and `terminal.close`. No orphan shells.
2. **One PTY per JARVIS session** (v1). Tabs later if needed.
3. **Ack, don’t narrate.** Never TTS the byte stream. Speak a one-line summary (“Command finished, exit 0”) or “Watch the terminal.”
4. **Approval is voice-native.** “Jarvis wants to open a shell — yes or no?” maps to existing `ToolApprovalDialog` + spoken yes/no. Do not invent a second permission chrome.
5. **Category toggle stays off by default.** Opening a PTY is more dangerous than `terminal.run` because interactive shells bypass the deny-list the moment the user (or model) types `rm`.
6. **Localhost only.** WebSocket origin check; no WAN bind; optional one-time attach token.
7. **CWD jail.** Default repo root + `~/jarvis/`, same as filesystem tools.
8. **Timeouts.** Idle PTY auto-close (e.g. 15 min) so a forgotten shell does not sit open.

### 5.3 Why not “just spawn ttyd”?

ttyd gives a real terminal fast, but JARVIS would then have two brains: the tool loop (structured, logged, permissioned) and an opaque browser shell (unstructured, unaudited). Voice control needs the runtime to **be** the PTY master so `terminal.write` is a normal tool result in `tool_runs`.

ttyd remains a valid **implementation tactic** behind that API if Python PTY handling proves insufficient.

---

## 6. Ghost OS — good fit, wrong layer

Repo: [ghostwright/ghost-os](https://github.com/ghostwright/ghost-os) (MIT, Swift, macOS 14+, MCP). README reviewed from the uploaded capture plus public docs.

### 6.1 What it actually is

Full **computer-use**: 29 MCP tools that read the macOS accessibility tree (vision fallback via local ShowUI-2B), then click/type/hotkey/scroll any native app. Self-learning **recipes** (JSON workflows). Learn-by-watching (`ghost_learn_*`). Not a web terminal. Not a shell.

### 6.2 Fit for the web-terminal request

**No.** Ghost OS would open **Terminal.app / iTerm** on the Mac desktop. That is a different product: the user leaves Mission Control; JARVIS is driving native UI; there is no Xterm.js session inside the HUD.

Using Ghost to “open a terminal” would also fight voice latency (AX round-trips, waits, recipes) and would not give JARVIS a structured PTY byte stream.

### 6.3 Fit for JARVIS as an OS (later, separate track)

**Yes — clone outside the workspace when you are ready to add “hands.”** Strong overlap with the north star (local-first OS, tools, agents) and with Friday playbook items that were explicitly deferred (`computer_control` is out of scope for the Friday port).

Worth extracting later:

| Ghost idea | JARVIS mapping |
|------------|----------------|
| MCP tool surface (29 tools) | T3 `mcp.{server}.{tool}` — already specified. Ghost becomes an **optional MCP server**, not core Python |
| Recipes as JSON | Procedural memory / T4 skills: “send this email” as a replayable skill, not a prompt |
| `ghost_learn_*` | Voice: “Watch me do this” → store recipe → later “do that again” |
| AX-first, screenshots last | Better than Operator-style pixel agents for a local Mac |
| `ghost doctor` | Pattern for a JARVIS tools health check |

Do **not** extract:

- Swift MCP server into `runtime/` (keep Ghost as an external binary)
- Vision sidecar / ShowUI-2B into the voice hot path
- Screenshot-first computer use
- Any flow that blocks `speakText()`

### 6.4 Voice-control implications

Ghost actions are **slow + side-effecting**. They must go through Permission Agent (`ask` by default) with a spoken ack (“Clicking Send in Mail”). Recipes are the only way this stays usable: a frontier model authors the recipe once; later voice turns just `ghost_run`.

macOS permissions (Accessibility, Screen Recording, Input Monitoring) are a setup tax. That is acceptable for a later phase, not for the first web terminal.

**Clone advice:** yes, outside this workspace, **after** the web PTY is designed — Ghost is complementary, not a substitute.

---

## 7. aictl — good fit for hardening, not for the web TTY

Repo: [pwittchen/aictl](https://github.com/pwittchen/aictl) ([docs/TOOLS.md](https://github.com/pwittchen/aictl/blob/master/docs/TOOLS.md), [docs/ARCH.md](https://github.com/pwittchen/aictl/blob/master/docs/ARCH.md), [docs/EXTENSIONS.md](https://github.com/pwittchen/aictl/blob/master/docs/EXTENSIONS.md)). Native AI agent for terminal + macOS desktop; cloud and local models; Tauri desktop; HTTP LLM proxy.

### 7.1 What it actually is

aictl is a **text agent loop with tools**, not a browser PTY.

- `exec_shell` = `sh -c` (same class as JARVIS `terminal.run`)
- Confirmation y/N or `--auto`
- Security policy before every tool
- Desktop app is Tauri **chat** over `aictl-core`, not an embedded terminal emulator
- `aictl-server` is an OpenAI-compatible **LLM proxy** (redaction, injection guard). Explicitly: no agent loop, no tools, no sessions

It will not give Mission Control a live shell.

### 7.2 License (blocking for copy-paste)

**PolyForm Noncommercial 1.0.0.** Free for personal / research / non-profit. Commercial use needs a separate license from the author.

JARVIS must **not copy aictl source** into this repo. Clone outside, read, **reimplement patterns** in Python under this project’s license. Same discipline as Friday: inspiration, not vendoring.

### 7.3 Patterns worth extracting (high value)

These map almost 1:1 onto `TOOLS.md` Permission Agent / Sandbox Agent / procedural memory — and they are stronger than what `terminal.run` does today.

| aictl pattern | Why JARVIS should steal the *idea* |
|---------------|-------------------------------------|
| Shell deny-list + split `\|` `&&` `;` segments | JARVIS deny-list is regex-on-the-whole-string; compound commands can hide `rm` |
| CWD jail + canonicalization (block `..`) | Align with filesystem allowed roots |
| Blocked paths (`~/.ssh`, `~/.gnupg`, `~/.aws`, `/etc/shadow`) | Missing today |
| Env scrub (`*_KEY`, `*_SECRET`, `*_TOKEN`) | Prevents tool output leaking keys into the LLM / TTS |
| 30s shell timeout + kill | Already have timeout; add kill-on-cancel / session end |
| Output sanitization (strip forged tool tags) | Prompt-injection via command output |
| Injection guard on **user** text | Voice STT can be poisoned less often, but typed follow-ups can |
| JSONL audit per session | Extends `tool_runs`; keep a reviewer log of what the shell actually ran |
| PreToolUse / PostToolUse **hooks** | Matches `.claude/hooks` already in this repo; harness rules the model cannot ignore |
| Confirm-or-auto | Maps to cautious / balanced / trusted + voice yes/no |
| Skills as one-turn markdown | T4 skills — JARVIS already headed here |
| MCP merge `mcp__server__tool` | T3 MCP bridge — naming/security lessons |
| Restricted `git` tool (no shell, flag allowlist) | Safer than `terminal.run "git …"` |

### 7.4 Patterns to reject

| aictl choice | Why not JARVIS |
|--------------|----------------|
| XML `<tool name>` in model text | JARVIS already uses native Anthropic/Ollama/Gemini tool APIs (`TOOLS.md` §14) |
| 35 built-in tools in one binary | Keep the phased catalog (T0–T4). Don’t dump `view_map` / `draw_chart` / `csv_query` |
| `~/.aictl/memory.json` blob | JARVIS five-layer memory is the keystone — do not regress to a JSON file |
| Tauri desktop as the terminal | Optional Phase 5 shell in `goal.md`; web PTY lands in React first |
| `aictl-server` LLM proxy | JARVIS already has Vite proxies + Python runtime |
| `--unrestricted` | Too easy to voice-trigger; if ever added, require typed + settings, never STT |
| PolyForm code | Legal, not technical |

### 7.5 Voice-control implications

aictl is a **keyboard REPL**. Its confirm prompt is y/N in a TTY. JARVIS must keep:

- Spoken ack before slow shell
- Approval in Mission Control + “yes/no”
- No 20-iteration silent tool storm during conversation mode without a spoken heartbeat

The agent-loop shape (propose → gate → execute → feed result → final speech) is already specified in `TOOLS.md` §6. aictl is a mature **worked example** of that loop with a serious security gate — which JARVIS `terminal.run` still lacks (no CWD jail, no env scrub, no segment split, no blocked paths).

**Clone advice:** **yes, now, outside this workspace**, specifically to harvest security + audit + hooks for both `terminal.run` and the future PTY. Do not harvest the desktop UI or the XML tool parser.

---

## 8. Cross-walk: who owns which JARVIS gap

```text
Need                              Best source              Not
────────────────────────────────  ───────────────────────  ────────────────────
VT display in the HUD             Xterm.js                 Hyper, Wetty
PTY bytes + resize + signals      Python pty / ttyd sidecar Wetty SSH
Voice open / write / close        JARVIS tool loop         aictl REPL, Ghost AX
Per-command safety                aictl security patterns  ttyd (none after attach)
Session + memory of runs          JARVIS tool_runs         aictl memory.json
Native app control (Mail, Slack)  Ghost OS via MCP         web terminal
Tauri desktop later               aictl-desktop as *shape* not as code
```

Ghost OS and aictl **do not compete** with Xterm.js. They sit on other layers:

```text
Voice JARVIS session
 ├─ Brain / memory          already JARVIS (do not take aictl memory.json)
 ├─ Tool loop + permissions extract from aictl (reimplement)
 ├─ Web PTY (this feature)  Xterm.js + runtime PTY
 ├─ One-shot shell          terminal.run (harden with aictl ideas)
 └─ Native Mac “hands”      Ghost OS MCP (later)
```

---

## 9. Risks unique to a voice-driven real TTY

1. **Open PTY = policy hole.** After `terminal.open`, the user or model can type anything. Mitigate: off-by-default, ask on open, idle timeout, destroy on new session, still refuse `terminal.write` that matches the destructive deny-list (best-effort; user typing in Xterm.js cannot be fully gated without a kernel sandbox).
2. **TTS vs ANSI.** Speaking `htop` output is unusable. Summarize or stay silent.
3. **STT vs shell syntax.** “dash RF” must not become `rm -rf`. Prefer structured `terminal.write` from the LLM (it saw the transcript) over dumping raw STT into the PTY.
4. **Two writers.** User typing and JARVIS injecting will collide. v1: while JARVIS writes, briefly lock human input or show a “JARVIS typing” state.
5. **Localhost web shell.** Classic RCE if the WS is reachable. Origin allowlist, bind `127.0.0.1`, attach token, no auth-bypass “for convenience.”
6. **License.** aictl is noncommercial; Ghost is MIT. Clone both outside; copy only MIT/our own code in-repo.
7. **Scope creep.** Ghost recipes and aictl’s 35 tools will try to become the project. Keep this feature = **visible, voice-opened PTY**. Harden `terminal.run` in the same slice if cheap; defer Ghost.

---

## 10. Suggested clone order (when you provide repo context)

Do this **outside** `/Users/imdadareeph/Downloads/agentic-os`.

1. **aictl** — first. Extract a one-pager of security checks to apply to `terminal.run` *and* the future PTY (`security.rs`, `exec_shell`, audit JSONL, hooks). Highest immediate value; no UI merge.
2. **Xterm.js docs / ttyd protocol** — second. Only when implementing the panel. Prefer owning the PTY in FastAPI; keep ttyd as a spike if needed.
3. **Ghost OS** — third, separate phase. MCP computer-use + recipes. Not required to open a web terminal.

Wetty and Hyper: do not clone.

---

## 11. Phased picture (for later `/goal`, not this report)

Informal only — not an implementation plan.

| Slice | Outcome |
|-------|---------|
| **WT0** | Harden existing `terminal.run` (aictl-inspired jail, env scrub, segment split, blocked paths). Still no PTY. |
| **WT1** | `terminal.open/write/close` + Xterm.js panel + WS PTY. Voice open/close. Category still default-off. |
| **WT2** | Session trust, idle timeout, destructive write intercept, procedural log of session I/O summaries. |
| **WT3** | Optional ttyd sidecar if Python PTY is insufficient. |
| **Hands** | Ghost OS as MCP (unrelated to WT except “open Terminal.app” as an alternative). |

WT0 can ship without any web terminal and already makes voice “run this command” safer.

---

## 12. Direct answers

**Should JARVIS open a real web terminal when asked?**  
Yes. Xterm.js + runtime-owned PTY, voice-gated, session-bound. Keep `terminal.run` for one-shot commands.

**ttyd / Wetty / Hyper?**  
Use Xterm.js. ttyd only as an optional local sidecar. Skip Wetty and Hyper.

**Is Ghost OS a good fit?**  
Not for this feature. Yes as a later MCP “hands” layer (recipes, AX computer-use). Clone outside when that phase starts.

**Is aictl a good fit?**  
Not for the web TTY UI. Yes as the security/agent-loop reference for shell tools. Clone outside now if you want that context next. Do not copy source (PolyForm Noncommercial).

**Everything voice-controlled in a JARVIS session?**  
Treat the PTY as a slow, approval-gated tool. Speak acks, never the stream. Kill the shell when the session ends. That is the difference between a web shell bolted onto the HUD and JARVIS actually *operating* one.
