# Memory Evolution Plan — Prefetch, Profile, Persona

**Project:** J.A.R.V.I.S. – Agentic OS  
**Version:** 1.0  
**Status:** Draft  
**Supersedes nothing** — extends [`../specs/memory.md`](../specs/memory.md), [`../specs/MEMORY_DECISION.md`](../specs/MEMORY_DECISION.md), [`../../goal.md`](../../goal.md)

---

## Overview

This plan adds three **orthogonal** memory upgrades without replacing the existing five-layer stack (SQLite conversation, Chroma semantic, Obsidian episodic, procedural `tool_runs`, working memory).

| Track | Codename | Inspiration | Hot path? |
|-------|----------|-------------|-----------|
| Perceived voice speed | **MP** — Memory Prefetch | VoiceMem left-brain / streaming pre-fetch | Yes — parallel, bounded |
| Cross-session “remember me” | **MF** — Memory Facts (profile) | Mem0 fact extraction | **No** — async only |
| Emotional / persona continuity | **ME** — Memory Emotion | VoiceMem right-brain | Yes — cheap static block |

**North star constraint (unchanged):** voice latency is sacred. Nothing in MF runs before `speakText()`. MP retrieve failures degrade to empty context within budget.

---

## Design principles

1. **Keep Obsidian as durable truth** — MF facts may mirror into `~/jarvis/vault/learnings/profile/` but never replace the vault.
2. **Keep Chroma as semantic index** — do not add a second vector store for MP/MF on the hot path.
3. **Deterministic before LLM** — keyword/intent gates (orchestrator) before any extraction or retrieval LLM.
4. **Three clocks**
   - **Hot** (0–300 ms): conversation turns + optional semantic hits + persona block
   - **Warm** (after reply): turn store, profile extraction queue, episodic write queue
   - **Cold** (idle worker): embed, reflect, Mem0-style consolidation, vault reconcile
5. **Do not adopt Mem0 or VoiceMem as frameworks wholesale** — borrow patterns; stay local-first Python + existing stores.

---

## Architecture after all phases

```text
User speaks (STT interim/final)
        │
        ├─ MP: speculative retrieve starts (parallel) ─────────────┐
        │                                                         │
        ▼                                                         ▼
Hot path (await ≤300ms semantic budget)              Prefetch cache (session-scoped)
  · SQLite recent turns (conversation layer)           · last retrieve result
  · Gated Chroma top-k (semantic layer)              · invalidated on new store
  · ME: persona block (no search)                    │
  · MF: profile snapshot (cached JSON, no search)    │
        │                                                         │
        ▼                                                         │
buildSystemPrompt + buildChatMessages(history) ◄─────────────────┘
        │
        ▼
LLM → speakText()  (first audio ASAP)
        │
        ▼
Warm path (fire-and-forget)
  · store turns → SQLite
  · MF: extract/update profile facts (queue)
  · M3 episodic write if researchy
  · queue Chroma embed (idle)
        │
        ▼
Cold path (idle worker — existing M2.5)
  · embed dirty vault files
  · reflect dirty turns
  · MF: consolidate / dedupe profile facts
  · optional: promote facts → Obsidian note
```

---

## Known bug — fix in MP0 (prerequisite)

**Symptom:** User asks “do you remember what we discussed a moment ago?” immediately after the session greeting; JARVIS denies memory and re-greets.

**Root causes (code-validated):**

| # | Cause | Location |
|---|--------|----------|
| B1 | Session greeting is **spoken** but never added to `turns[]` / LLM `history` | `useRealtimeConversation.ts` `startConversation()` |
| B2 | `retrieveMemory()` only runs when `semanticMemoryEnabled` — backend **conversation** turns are ignored when semantic is off (default) | `useRealtimeConversation.ts` |
| B3 | `conversationMemoryEnabled` exists in settings but is **not** checked when building `history` | `memory-settings-store.ts` vs hook |
| B4 | System prompt does not state that **in-session** message history is available | `config/services.ts` |

**MP0 exit:** After greeting + one Q&A, “what did we just discuss?” answers correctly using in-session history (no semantic layer required).

---

# Phase MP — Memory Prefetch (VoiceMem hot-path)

**Goal:** Reduce perceived “thinking” delay by overlapping retrieve with STT and fixing conversation context bugs.

### MP0 — Conversation context correctness (bugfix)

| Task | File(s) | Notes |
|------|---------|-------|
| Add greeting as assistant turn in `turns` + optional `persistTurn` | `useRealtimeConversation.ts` | Same text as TTS greeting |
| Gate `history` on `conversationMemoryEnabled && conversationTurnLimit > 0` | `useRealtimeConversation.ts` | Honor Memory Settings |
| Call `retrieveMemory` when conversation **or** semantic needed; merge `result.conversation` as fallback if local `turnsRef` lagging | `useRealtimeConversation.ts`, `memory.ts` | `semanticEnabled` stays separate flag |
| System prompt: JARVIS has in-session history via messages; distinguish session vs cross-session | `config/services.ts` | Short — fits voice |

**Exit criteria**

- [ ] Greeting appears in transcript UI and in LLM messages
- [ ] With semantic **off**, second turn still recalls first exchange
- [ ] With `conversationMemoryEnabled` off, history empty (by design)
- [ ] Live Activity shows retrieve only when semantic on OR conversation backend fetch runs

### MP1 — Parallel retrieve on utterance end

| Task | File(s) | Notes |
|------|---------|-------|
| Start `retrieveMemory()` in parallel with Whisper refine (do not await refine before retrieve) | `useRealtimeConversation.ts` | Refine updates turn text async |
| Shared `AbortController` per turn; cancel prefetch if user barges in | `useRealtimeConversation.ts` | Match `VOICE_INTERRUPT` |
| Session-scoped prefetch cache: `{ sessionId, queryKey, result, ts }` | `app/src/services/memory.ts` | ~30s TTL |

**Exit criteria**

- [ ] Retrieve begins before or alongside Whisper refine on final transcript
- [ ] p95 “Retrieve memory” in Live Activity drops vs baseline (measure 10 turns)
- [ ] No duplicate retrieve when cache hit within same turn

### MP2 — Speculative prefetch on interim STT (optional)

| Task | File(s) | Notes |
|------|---------|-------|
| On interim transcript stable ≥500ms, run **cheap** gate only (`should_retrieve` via HEAD or local regex mirror) | `useRealtimeConversation.ts`, optional `GET /api/memory/should-retrieve` | No Chroma until final |
| On final, if prefetch in flight, await with remaining budget (300ms semantic cap) | orchestrator unchanged | Degrade to [] on timeout |

**Exit criteria**

- [ ] Semantic retrieve p95 ≤ 300ms or skip (existing metric)
- [ ] Interim prefetch never blocks mic / STT
- [ ] False-positive rate acceptable on greetings (“hi”, “thanks”) — no retrieve

---

# Phase MF — Memory Facts / Profile (Mem0-style, async)

**Goal:** Cross-session “remember me” without Mem0 on the hot path.

### MF0 — Profile store schema

| Task | File(s) | Notes |
|------|---------|-------|
| SQLite table `user_facts` or JSON file `~/jarvis/profile/facts.json` | `runtime/db/schema.sql` + migration | Prefer SQLite alongside `memory.db` |
| Fields: `id`, `key`, `value`, `confidence`, `source_turn_id`, `created_at`, `updated_at`, `superseded_by` | models | Version facts, don’t overwrite silently |
| API: `GET /api/memory/profile`, `POST /api/memory/profile/extract` (internal) | `runtime/main.py` | Extract endpoint admin/idle only |

**Exit criteria**

- [ ] Profile survives browser refresh and new sessions
- [ ] Facts listed in Memory Settings → Debug (read-only)

### MF1 — Post-turn extraction (warm path)

| Task | File(s) | Notes |
|------|---------|-------|
| After `storeTurn`, enqueue extraction job (idle worker or asyncio task) | `runtime/memory/profile.py` | Never await in voice hook |
| Extraction: **rules first** (preferences, name, stack choices via regex); optional **small LLM** on idle only | profile extractor | Match MEMORY_DECISION “LLM only when required” |
| Dedupe: same key → supersede old row if confidence higher | profile store | |

**Example triggers (deterministic)**

```text
"I prefer …" / "call me …" / "my name is …"
"always use Ollama" / "don't use Anthropic"
"remember that I …"
```

**Exit criteria**

- [ ] Say “call me Creator” → next **new session** JARVIS uses name without semantic search
- [ ] Extraction runs only when `memoryEnabled && !incognito`
- [ ] Zero added ms on Think/Speak metrics (extract not on hot path)

### MF2 — Cached profile injection (hot path, cheap)

| Task | File(s) | Notes |
|------|---------|-------|
| `GET /api/memory/profile` returns ≤ N facts, ≤ T tokens (e.g. 10 facts / 400 tokens) | context builder | No vector search |
| Frontend or runtime appends `## User profile` block after persona, before vitals | `jarvis-prompt.ts` or retrieve `contextBlock` | Cache in session; refresh every 5 min or on store |
| Memory Settings: `profileMemoryEnabled`, `profileMaxFacts` | `memory-settings-store.ts`, sheet | Default **on** |

**Exit criteria**

- [ ] Profile block injected in < 20ms (local cache or single SQLite query)
- [ ] Turning off `profileMemoryEnabled` removes block immediately
- [ ] Incognito disables profile read and write

### MF3 — Optional Obsidian mirror (cold path)

| Task | File(s) | Notes |
|------|---------|-------|
| Idle job writes `learnings/profile/user-facts.md` from SQLite facts | `runtime/memory/profile_sync.py` | Human-readable; user editable |
| Vault edit → optional reconcile back to SQLite (manual v1) | defer | Avoid bidirectional sync complexity in v1 |

**Exit criteria**

- [ ] User opens Obsidian and sees profile facts note
- [ ] Chroma embed of profile note optional (semantic can find “what do you know about me?”)

---

# Phase ME — Memory Emotion / Persona (VoiceMem right-brain)

**Goal:** Continuity of tone and relationship without emotion vector search.

### ME0 — Persona continuity block

| Task | File(s) | Notes |
|------|---------|-------|
| Extend `buildSystemPrompt` with `## Session persona` from JARVIS settings + session flags | `jarvis-prompt.ts` | personality, formality, shortAnswers |
| Track `sessionTone`: `neutral | supportive | focused | playful` in working memory (React ref + optional SQLite session row) | `useRealtimeConversation.ts` | Default neutral |
| Instruction: maintain tone across turns; don’t re-greet every message | system prompt | Fixes double “Good afternoon” |

**Exit criteria**

- [ ] Second turn does not re-greet unless user says hello
- [ ] Changing personality in JARVIS Settings affects next turn

### ME1 — Lightweight affect signals (deterministic)

| Task | File(s) | Notes |
|------|---------|-------|
| Regex/keyword affect hints: frustration, urgency, celebration → adjust `sessionTone` | `runtime/memory/affect.py` or frontend | No ML v1 |
| Map affect → prompt modifier (1 sentence max) | persona block | e.g. “User seems frustrated — be direct and reassuring.” |
| Never store raw emotion as long-term fact without MF gate | MEMORY_DECISION | Ephemeral session scope |

**Exit criteria**

- [ ] “This isn’t working” shifts tone to supportive for rest of session
- [ ] Affect state resets on NEW SESSION

### ME2 — Relationship memory (optional, later)

| Task | Notes |
|------|-------|
| Persist `relationshipSummary` (1–2 sentences) updated idle-only | MF-style warm/cold path |
| Inject only when user references JARVIS relationship (“you know me”) | Gated like semantic |

**Defer until MF1+ME0 stable.**

---

# Cross-track integration with MEMORY_DECISION

Extend classification (MEMORY_DECISION Stage 4+) with:

| Event type | Decision | Storage |
|------------|----------|---------|
| Session turn | Always store if conversation enabled | SQLite `turns` |
| Profile fact candidate | Extract if MF enabled + pattern match | `user_facts` |
| Emotional signal | Session-only unless promoted | `sessions.tone` |
| Semantic-worthy query | Retrieve if gated | Chroma (existing) |
| Research exchange | Episodic write (M3) | Obsidian |

**Never block conversation** — all MF extraction and ME relationship updates are warm/cold.

---

# Settings additions (Memory Settings sheet)

| Setting | Track | Default |
|---------|-------|---------|
| `prefetchEnabled` | MP1 | true |
| `interimPrefetchEnabled` | MP2 | false |
| `profileMemoryEnabled` | MF2 | true |
| `profileMaxFacts` | MF2 | 10 |
| `personaContinuityEnabled` | ME0 | true |
| `affectAwarenessEnabled` | ME1 | true |

Existing: `conversationMemoryEnabled`, `semanticMemoryEnabled`, `fastMode`, Memory Budget caps.

---

# Implementation order (recommended)

```text
MP0  (bugfix)     ← ship first; fixes “don’t remember greeting”
MP1  (parallel)   ← biggest perceived voice win
ME0  (persona)    ← cheap; fixes re-greeting behavior
MF0 + MF1         ← profile store + async extract
MF2               ← inject cached profile
ME1               ← affect keywords
MP2               ← optional interim prefetch
MF3               ← Obsidian mirror
ME2               ← defer
```

**Parallel workstreams:** MP and ME touch frontend + prompt; MF touches runtime + idle worker. Keep separate PRs.

---

# Success metrics

| Metric | Target | Track |
|--------|--------|-------|
| Voice round-trip (no semantic) | No regression | MP |
| Retrieve p95 (semantic) | ≤ 300ms or skip | MP |
| Think phase ms (memory-heavy turn) | −20% vs baseline after MP1 | MP |
| “Remember me” across sessions | Name/preference recalled | MF |
| Re-greet rate on turn 2+ | ~0% | ME |
| Profile inject latency | < 20ms | MF2 |
| Token budget per turn (memory blocks) | ≤ `sessionContextTokens` | all |

---

# `/goal` playbook stub

```text
/goal Build Phase MP0 per docs/plans/MEMORY_EVOLUTION_PLAN.md — fix conversation context (greeting in history, conversationMemoryEnabled gate, retrieve without semantic-only gate, system prompt). Verify: greeting recall + one Q&A recall with semantic off. One phase only.
```

Repeat with `MP1`, `MF0`, `ME0`, etc.

---

# Related documents

| Document | Relevance |
|----------|-----------|
| [`../specs/memory.md`](../specs/memory.md) | Five-layer model, orchestrator, settings |
| [`../specs/MEMORY_DECISION.md`](../specs/MEMORY_DECISION.md) | Classification, idle evolution |
| [`fix.md`](fix.md) | Voice latency root causes |
| [`../reference/mem0.md`](../reference/mem0.md) | claude-mem (Cursor) — **not** mem0ai |
| [`../../goal.md`](../../goal.md) | Phase MV, M0–M4, F |

---

# Open decisions

1. **MF storage:** SQLite `user_facts` vs file JSON — **recommend SQLite** (same backup story as turns).
2. **MF extraction LLM:** Ollama small model on idle vs rules-only v1 — **recommend rules-only MF0–MF1**, LLM in MF1.5 if recall quality insufficient.
3. **Mem0 library:** embed `mem0ai` package vs custom profile table — **recommend custom** until MF2 proves need; avoids second vector graph on hot path.
4. **Profile → Obsidian:** one-way mirror (MF3) vs bidirectional — **one-way v1**.
