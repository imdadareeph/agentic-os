# JARVIS × Friday — `/goal` Playbook

> Copy-paste `/goal` commands for porting the **best-fitting** patterns from the Friday (MARK XLVII) prototype into agentic-os JARVIS — without copying its stack (PyQt6, Gemini Live, monolithic `main.py`, `long_term.json` blob).
>
> **Session rules live in [`../../CLAUDE.md`](../../CLAUDE.md)** — read it first. Autonomy, secrets handling, allowed paths, and build discipline apply here too.
>
> **UI rule (non-negotiable):** All new UI must match the existing JARVIS Mission Control — scoped CSS + CSS custom properties (`app/src/index.css`, `App.css`), Settings sheet pattern (`JarvisSettingsSheet`, `MemorySettingsSheet`, `ToolSettingsSheet`), StatusBar icon buttons, RightPanel / Command Deck layout, lucide-react icons, WCAG 2.2 AA. **Do not** introduce PyQt, Tailwind, or Friday's HUD visuals.
>
> **Reference only:** Read `extras/Friday/Friday.md` and `extras/Friday/` for behavior patterns. **`extras/` is gitignored — never commit it.**
>
> **Do not copy:** Friday §5.1 dual registration (`TOOL_DECLARATIONS` + `if/elif` in `main.py`). agentic-os uses `runtime/tools/registry.py` — extend that.
>
> Related playbooks: [`claude_goals.md`](claude_goals.md) (memory M0–M4), [`claude_tools_goals.md`](claude_tools_goals.md) (tools T0–T4).

---

## What Friday gives us (and what we skip)

| Friday concept | JARVIS approach | Phase |
|----------------|-----------------|-------|
| `long_term.json` categories + silent `save_memory` | SQLite `profile_facts` + `memory.profile.save` tool + prompt block | **F0** |
| `core/prompt.txt` routing rules | `router.py` keywords + `buildRoutingBlock()` in `jarvis-prompt.ts` | **F1** |
| `web_search` modes (news/research/price/compare) | Extend `browser.search` + router hints | **F2** |
| `open_app`, `weather_report`, `reminder`, `file_controller` move/copy | `system.open_app`, `system.weather`, `system.reminder`, `filesystem.move` | **F3** |
| `player.show_content`, silent tool results, spoken errors | Tool content panel in RightPanel; `{ silent: true }` in loop | **F4** |
| Morning briefing + `[SYSTEM_ALERT]` | Connect-time greeting + optional headlines; vitals threshold toasts | **F5** |
| `screen_process`, `send_message`, `game_updater`, `computer_control` | **Out of scope** — MCP/plugins later, not core Friday port | — |

---

## Prerequisites

Run memory and tools base phases first (or confirm they are merged):

| Prerequisite | Minimum for Friday phases |
|--------------|---------------------------|
| Memory **M0** | Sessions + turns in SQLite |
| Memory **M1** | MemorySettingsSheet (profile toggles wire here) |
| Memory **M2** | Orchestrator + `buildContextBlock()` in `jarvis-prompt.ts` |
| Tools **T0** | Registry + loop + `router.py` |
| Tools **T1** | ToolSettingsSheet + filesystem read/list |
| Tools **T2** | Permission Agent + approval dialog |
| Tools **T3** | `browser.search` / `browser.fetch` (F2 builds on this) |

**Recommended order:** M0–M2 → T0–T3 → **F0 → F1 → F2 → F3 → F4 → F5** (one `/goal` per phase).

---

## Before you start (once per session)

```
/config permissionMode=acceptEdits
```

```
/effort high
```

- **`acceptEdits`** — reversible build steps proceed without stalling.
- **Secrets:** ASK before reading `.env`, API keys, `extras/Friday/config/api_keys.json`, or `.cursor/aidocs/do-not-commit/`.
- **Friday code:** READ `extras/Friday/` for logic inspiration; IMPLEMENT in `runtime/` and `app/` only.

---

## Phase F0 — Profile memory (Friday §4)

**Goal:** Durable user facts (name, language, preferences) saved silently and injected naturally — not a 2.2 KB JSON blob in every prompt.

```
/goal Build Phase F0 of the Friday-inspired profile memory layer per extras/Friday/Friday.md §4 and memory.md profile patterns. Add structured profile facts with a silent model-initiated save tool. Keep working until ALL exit criteria pass.

Scope (do only F0 — do NOT start F1+):
1. Schema: runtime/db/migrations/0005_profile_facts.sql
   - profile_facts(id TEXT PK, category TEXT NOT NULL, fact_key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL, source TEXT DEFAULT 'user')
   - UNIQUE(category, fact_key)
   - Categories mirror Friday taxonomy: identity, preferences, projects, relationships, wishes, notes
   - Per-value cap 380 chars (truncate with … like Friday memory_manager)
2. runtime/memory/profile.py:
   - load_profile_facts() -> grouped dict
   - upsert_fact(category, key, value, source='tool'|'reflection'|'user')
   - format_profile_for_prompt(max_chars=1200) — "WHAT YOU KNOW ABOUT THIS PERSON — use naturally, never recite like a list"
   - Do NOT dump entire vault; profile block is separate from semantic/episodic retrieve
3. Tool: memory.profile.save (register in registry.py)
   - permission=allow, latency_class=fast
   - Args: category, key, value (English-normalized values per Friday §4.6)
   - Handler returns ToolResult with silent=true (see F4 if flag not yet implemented — add minimal silent support in loop only for this tool)
   - Tool description: save durable facts silently; do NOT save weather, one-off commands, or reminders
4. Retrieve: extend POST /api/memory/retrieve to include profile block when memoryEnabled + profile layer enabled
5. Frontend:
   - memory-settings-store: add profileMemoryEnabled (default true) under Master or new "Profile" section in MemorySettingsSheet — same sheet/chip/toggle styling as existing sections
   - buildContextBlock() in jarvis-prompt.ts: inject profile block after persona, before semantic chunks (order: persona → profile → semantic → vitals)
6. Optional idle path: if reflection.py classifies preference/identity on a dirty turn, call upsert_fact with source='reflection' (rule-based only, no extra LLM)

Exit criteria (verify each):
1. Say "My name is Alex and I prefer concise answers" in voice → memory.profile.save or reflection writes identity/name + preferences/* without spoken "I saved that"
2. sqlite3 ~/jarvis/db/memory.db "SELECT category, fact_key, value FROM profile_facts" shows rows
3. New session / retrieve → buildContextBlock includes name naturally; JARVIS does not read the list aloud unless asked
4. profileMemoryEnabled=false → profile block omitted from retrieve; facts remain on disk
5. Value >380 chars truncated at store time
6. Voice latency: profile save is fire-and-forget; never awaited before speakText()
```

---

## Phase F1 — Prompt routing (Friday §5.5 + §3.4)

**Goal:** Friday's `core/prompt.txt` routing rules — implemented as data-driven router hints + a prompt slice, not a monolithic file.

```
/goal Build Phase F1 of Friday-inspired tool routing per extras/Friday/Friday.md §5.5 and TOOLS.md §6.1. Extend the Tool Router and system prompt with intent→tool mappings. Keep working until ALL exit criteria pass.

Scope (do only F1 — assumes F0 optional, T0+ merged; do NOT start F2+):
1. runtime/tools/router.py — extend _TOOL_KEYWORDS and add intent tags per Friday §5.5:
   - os_tweak → system.open_app, system.volume (stub deny until F3 if not built), terminal.run fallback
   - hardware_metrics → system.status, vitals.fetch
   - current_events / news → browser.search with mode hint in candidates metadata
   - games → exclude browser.search; prefer future MCP stub message "game tools not configured"
   - weather → system.weather (stub candidate until F3)
   - multi_step_explicit → prefer tool loop max_turns path (NOT dead Friday agent_task)
   - Skip greetings/small talk (already in _SKIP)
2. Add router metadata on plan response: { intent, candidates[], hints: { browser.search: { mode: 'news' } } } when applicable
3. app/src/lib/jarvis-prompt.ts:
   - buildRoutingBlock(settings) — short static slice: "Route OS tweaks to system tools; news to browser.search mode news; never use browser for Steam/Epic; use memory.profile.save silently for durable facts; respond in user's language, tool args in English"
   - Append in buildSystemPrompt() after personality, before vitals — NOT a separate prompt.txt file
4. jarvis-settings-store: optional routingHintsEnabled (default true) — toggle in JarvisSettingsSheet Advanced section (existing sheet, same UI patterns)
5. Wire POST /api/tools/plan hints into loop.py so browser.search receives mode param when router sets it
6. Tests: runtime/tests/test_router_friday.py — "what's in the news" → browser.search candidate + mode news; "open Spotify" → system.open_app candidate; "hello" → useTools false

Exit criteria (verify each):
1. POST /api/tools/plan "latest AI news" → useTools true, candidates include browser.search, hints.mode=news
2. POST /api/tools/plan "open Chrome" → candidates include system.open_app (or explicit stub if F3 not merged)
3. routingHintsEnabled=false → buildRoutingBlock omitted; router.py still works
4. No reference to Friday agent_task in code or prompts (dead in Friday)
5. Voice: routing adds zero extra LLM round-trips (router remains non-LLM)
```

---

## Phase F2 — Search modes + content panel (Friday §5.3 web_search + §5.4 UI)

**Goal:** Friday-style search modes and long results in the Mission Control UI — not PyQt `show_content`.

```
/goal Build Phase F2 of Friday-inspired search and content display per extras/Friday/Friday.md §5.3 web_search and §5.4 UI feedback. Extend browser tools and add a Content Panel in the existing RightPanel. Keep working until ALL exit criteria pass.

Scope (do only F2 — assumes T3 browser tools + F1 router; do NOT start F3+):
1. runtime/tools/handlers/browser.py — extend browser.search:
   - mode enum: search | news | research | price | compare (default search)
   - mode affects query template / result formatting (study extras/Friday/actions/web_search.py for behavior, reimplement with httpx + existing stack)
   - latency_class=slow, permission=ask (T2)
   - Return structured payload: { summary, detail, mode, sources[] } — detail may exceed 120 chars
2. When result.detail length > 120 OR mode=research, set ToolResult.showContent=true, contentTitle, contentBody for frontend
3. Frontend — app/src/stores/content-panel-store.ts + ContentPanel section:
   - Slide-in or expandable panel below Command Deck in RightPanel.tsx — reuse existing border-radius, --sidebar-bg, --content-border, .label / .body typography from index.css
   - Shows title + scrollable markdown/plain body; close button; keyboard ESC; aria-labelledby
   - Hook runToolLoop / useToolEvents: on TOOL_EXECUTED with showContent, open panel (do not block voice)
4. Command Deck: TREND-SCAN / AM-REPORT buttons call browser.search with mode=news preset (wire existing stub in command-deck-skills.ts)
5. Router F1 hints pass mode through to execute

Exit criteria (verify each):
1. "Search news about SpaceX" → after approval, spoken short summary + Content Panel shows full list
2. Panel matches existing dark theme tokens (no new color hardcodes — CSS vars only)
3. showContent=false for short answers (e.g. time.now) — panel stays closed
4. tool_runs logs browser.search with mode in input_json
5. Voice: user hears first speakText() before slow search completes (ack-then-async per T2)
```

---

## Phase F3 — Desktop assistant tools (Friday §5.3 best fit)

**Goal:** The Friday tools that fit local-first JARVIS: open app, weather, reminders, filesystem move/copy.

```
/goal Build Phase F3 of Friday-inspired desktop assistant tools per extras/Friday/Friday.md §5.3 (open_app, weather_report, reminder, file_controller). Add handlers via registry.py — NOT main.py dispatch. Keep working until ALL exit criteria pass.

Scope (do only F3 — assumes T2 permissions; do NOT start F4+):
1. runtime/tools/handlers/system_desktop.py:
   - system.open_app(app_name, alias?) — cross-platform: Darwin open -a, Linux xdg-open/deskop entry, Windows start. Alias table inspired by extras/Friday/actions/open_app.py (read only). permission=ask, latency=fast
   - system.weather(city?) — Open-Meteo or wttr.in via httpx (no API key in repo). permission=allow, latency=slow
   - system.reminder(message, when_iso) — launchd (Darwin) / schtasks (Windows) / cron user crontab (Linux). permission=ask, latency=slow. Clear spoken confirmation with time
2. runtime/tools/handlers/filesystem.py — add filesystem.move, filesystem.copy if missing (path allowlist from tool settings)
3. Register all in registry.py with schemas; extend router.py keywords from F1
4. ToolSettingsSheet: enable "Desktop" category toggle (same section pattern as Filesystem/Git)
5. Deny list: no pyautogui volume/brightness in F3 (Friday computer_settings) — document as future MCP in tool description

Exit criteria (verify each):
1. "Open Safari" (or default browser app) → approval → app launches; logged in tool_runs
2. "Weather in Dubai" → spoken summary; no approval if allow
3. "Remind me in 5 minutes to stretch" → approval → reminder scheduled; JARVIS confirms time
4. filesystem.move within allowlist works; outside allowlist → structured error
5. All UI for permissions uses existing ToolApprovalDialog — no new dialog chrome
6. Voice latency: open_app fast path <300ms after approval
```

---

## Phase F4 — Cross-cutting action patterns (Friday §5.4)

**Goal:** Silent tools, spoken errors, tool→UI feedback — the glue Friday has in `player.write_log` / `show_content`.

```
/goal Build Phase F4 of Friday cross-cutting tool patterns per extras/Friday/Friday.md §5.4. Standardize silent results, voice-friendly errors, and tool progress in the existing JARVIS UI. Keep working until ALL exit criteria pass.

Scope (do only F4 — can merge before F2/F3 if needed for F0 silent save):
1. runtime/tools/schemas.py — ToolResult fields: silent: bool, showContent, contentTitle, contentBody, spokenError: str | None
2. runtime/tools/loop.py:
   - If silent=true: omit tool result from user-visible transcript; still log tool_runs
   - On handler exception: map to spokenError short string for LLM (Friday speak_error pattern) — no stack traces to voice
3. runtime/tools/executor.py — consistent wrapper: duration_ms, success, procedural.record_tool_run
4. Frontend:
   - useToolEvents / transcript: show tool start/complete chips in RightPanel (existing notification/toast patterns — sonner for failures only)
   - Map displayStatus THINKING when tool loop active (reuse resolveJarvisDisplayStatus / jarvis-status.ts)
   - memory.profile.save uses silent=true (F0)
5. Document in TOOLS.md § cross-cutting: OS abstraction lives in handlers; API keys centralized in AI settings — never per-handler json files like Friday

Exit criteria (verify each):
1. memory.profile.save produces no visible tool chip in transcript (silent)
2. Failed system.open_app → user hears actionable error, not raw exception
3. Tool loop active → HUD/status shows THINKING equivalent (existing status pipeline)
4. tool_runs row exists even for silent tools
5. No new UI frameworks; chips/buttons use existing .button / .label classes
```

---

## Phase F5 — Proactive assistant (Friday §8)

**Goal:** Startup greeting + optional headlines + system threshold alerts — voice-safe, settings-gated.

```
/goal Build Phase F5 of Friday-inspired proactive services per extras/Friday/Friday.md §8 (morning briefing, system monitor). Wire connect-time greeting and optional alerts using existing vitals/health — no Gemini Live injection. Keep working until ALL exit criteria pass.

Scope (do only F5 — assumes F0 profile + T0 vitals):
1. runtime/jobs/proactive.py (or extend existing jobs module):
   - on_session_start hook (called from POST /api/sessions or frontend startConversation): build greeting from profile_facts identity/name + local time (Friday phase 1 — no tools, no network)
   - optional briefingEnabled in jarvis-settings-store: phase 2 async fetch headlines via browser.search mode=news internally; return { greeting, headlines[], panelBody } — frontend speaks greeting immediately, headlines after delay (~3s) if enabled
2. System monitor (lightweight):
   - Poll vitals or psutil CPU/RAM every 30s in background job when alertsEnabled
   - Threshold breach → POST /api/notifications or SSE to frontend → toast + optional one-line proactive speak (5 min cooldown per alert type, Friday §8.2)
   - Respect reduceMotion / disableProactiveAlerts settings
3. Frontend:
   - useRealtimeConversation startConversation: if proactive payload returned, speak greeting before user talks; open ContentPanel for headline list if briefingEnabled
   - JarvisSettingsSheet: "Proactive" section — briefingEnabled, alertsEnabled toggles (same Settings sheet pattern)
4. Do NOT bind Friday dashboard :8000 — agentic-os runtime already uses 8000

Exit criteria (verify each):
1. Fresh session with profile name "Alex" → JARVIS speaks time-aware greeting using name
2. briefingEnabled=false → greeting only, no network headline fetch
3. briefingEnabled=true → Content Panel shows headlines; voice summarizes top 2 after delay
4. Simulated CPU threshold → one toast/alert within cooldown rules; no alert spam
5. alertsEnabled=false → monitor does not notify
6. Voice latency: phase-1 greeting never waits on network
```

---

## Explicitly out of scope (Friday §5.3)

Do **not** implement in these phases — use MCP, skills (T4), or separate plugins later:

| Friday tool | Reason |
|-------------|--------|
| `screen_process` | Different stack (Gemini Live vision + separate TTS thread) |
| `send_message` | Fragile WhatsApp/Telegram UI automation |
| `computer_settings` / `computer_control` | High-risk pyautogui; Permission + sandbox heavy |
| `game_updater` | Large domain; Steam/Epic automation |
| `flight_finder`, `youtube_video`, `dev_agent`, `file_processor` | T4 skills / MCP candidates |
| `shutdown_jarvis` | App lifecycle — UI quit, not LLM tool |
| PyQt HUD / dashboard `:8000` | Replaced by React Mission Control + existing runtime |

---

## Tips while running

| Tip | How | Why |
|-----|-----|-----|
| **Read Friday, build JARVIS** | `extras/Friday/Friday.md` + `actions/*.py` | Logic reference only — output goes to `runtime/` + `app/` |
| **UI consistency** | Copy sheet/panel patterns from `MemorySettingsSheet.tsx`, `RightPanel.tsx` | User asked for existing JARVIS theme, not MARK XLVII HUD |
| **One phase per `/goal`** | `/goal clear` between F0–F5 | Keeps exit criteria verifiable |
| **Registry only** | `runtime/tools/registry.py` + `handlers/` | Never adopt Friday §5.1 dual declaration |
| **Voice first** | Test via mic after each phase | Silent save, ack-then-async, and routing only show up in real flow |
| **Verify profile** | `sqlite3 ~/jarvis/db/memory.db "SELECT * FROM profile_facts"` | Friday memory equivalent |

---

## Workflow note

- **Depends on:** Memory M0–M2 and Tools T0–T3 for most phases. F4 can land early if you need `silent` for F0.
- **Order:** F0 (profile) → F1 (routing) → F2 (search UI) → F3 (desktop tools) → F4 (cross-cutting; or F4 before F0 if silent flag needed) → F5 (proactive).
- **Combine with other playbooks:** Finish T3 before F2; finish M2 before F0 retrieve wiring.
- **Never commit** `extras/` or Friday API keys.

---

## Quick reference — phases

| Phase | Goal | Key deliverable |
|-------|------|-----------------|
| **F0** | Profile memory | `memory.profile.save` + `profile_facts` + context block |
| **F1** | Prompt routing | `router.py` hints + `buildRoutingBlock()` |
| **F2** | Search + content panel | `browser.search` modes + RightPanel ContentPanel |
| **F3** | Desktop tools | `system.open_app`, `system.weather`, `system.reminder` |
| **F4** | Cross-cutting | `silent`, spoken errors, THINKING status |
| **F5** | Proactive | Connect greeting + optional briefing + alerts |

**Start here:** confirm M0 + T0 are green, then paste the **Phase F0** block into Claude Code `/goal`.
