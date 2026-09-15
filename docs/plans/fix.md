# JARVIS slow-response fix plan

> Voice latency is sacred. This doc maps observed slowness to root causes in the codebase, notes what is already fixed, and orders the remaining work by impact vs diff size.

**Last validated:** 2026-07-05 against `app/` + `runtime/` on branch working tree.

---

## Symptom summary

Users perceive lag in three places:

| Phase | Feels like | Typical user report |
|-------|------------|---------------------|
| **End of utterance → thinking starts** | "Slow to listen" | Pause after speaking before JARVIS reacts |
| **Thinking → first speech** | "Long thinking" | Spinner / silence 5–20s |
| **JARVIS finishes → mic live again** | "Deaf gap" | Can't interrupt; missed words right after reply |

Use the **Live Activity** feed (Left panel) during a session. It already logs per-turn timings:

- `Retrieve memory` — `memory.ts` (ms + hit counts)
- `Think` — `useRealtimeConversation.ts` (ms, LLM + tool loop)
- `Speak` — TTS playback ms

**Measure first.** Run 5–10 turns (plain chat, memory-heavy, tool-ish) and note which label dominates before changing defaults.

---

## Root causes (code-validated)

### 1. Idle worker steals Ollama mid-conversation

**Mechanism**

- `runtime/memory/idle.py`: `IDLE_AFTER_S = 20.0` — background jobs run after 20s without activity.
- `runtime/memory/jobs.py`: idle loop embeds dirty vault files and reflects dirty turns via Ollama (`nomic-embed-text`).
- Activity clock is warmed by `idle.touch()` on retrieve, store, heartbeat, and tool plan/loop.

**Gap**

- `useRealtimeConversation.ts` fires `sendHeartbeat()` **once per processed turn** (lines 368–376), not on a timer while the session is open.
- User pauses >20s mid-conversation (reading, thinking, away from mic) → idle worker starts → embed model loads → **evicts or contends with chat model** on Ollama.
- Cold chat model reload on next turn ≈ **10–20s** extra "Think" time.

**Evidence**

```22:22:runtime/memory/idle.py
IDLE_AFTER_S = 20.0
```

```368:376:app/src/hooks/useRealtimeConversation.ts
      void sendHeartbeat({
        maxParallelMemoryJobs: mem.maxParallelMemoryJobs,
        ...
      }).catch(() => {})
```

Embed model already requests `keep_alive` (`runtime/memory/embedder.py`), but a single Ollama instance with default `OLLAMA_MAX_LOADED_MODELS=1` still unloads chat when embed runs.

---

### 2. Blocking fetches with no client timeout

**Mechanism**

- `retrieveMemory()` is **awaited before LLM** in `processTurn` (`useRealtimeConversation.ts:384`).
- `memory.ts` and `tools.ts` `post()` helpers use **raw `fetch`** — no timeout, no abort.

**Gap**

- Runtime guards **only the Chroma semantic query** at 300ms (`runtime/memory/orchestrator.py:_TIMEOUT_S = 0.3`).
- The full `/api/memory/retrieve` handler also loads recent turns, procedural hits, and builds context blocks — **no end-to-end deadline**.
- Hung or slow runtime → turn stalls **indefinitely** on the voice path.
- `fetchWithTimeout` exists in `app/src/lib/fetch.ts` and is used by LLM/voicebox/whisper clients — **not** by memory/tools.

```68:77:app/src/services/memory.ts
async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(`${RUNTIME_BASE}${path}`, {
```

```43:43:runtime/memory/orchestrator.py
_TIMEOUT_S = 0.3
```

---

### 3. Tool router — extra RTT and false-positive loops

**Partially fixed**

| Item | Status | Location |
|------|--------|----------|
| Local skip/execute gate (zero RTT for plain chat) | **Done** | `app/src/lib/tool-plan.ts`, `jarvis.ts:103–105` |
| Require keyword score > 0 (no full-catalog fallback) | **Done** | `runtime/tools/router.py:67–75` |

**Still open**

- Messages matching `_EXECUTE_WORDS` (e.g. "show me", "plan", "status") still call `POST /api/tools/plan` even when **no tool keyword would score** — one RTT (~50–200ms+) on every such utterance.
- Full candidate ranking lives only server-side; frontend gate is coarser than router.
- When tool loop **does** enter and Ollama struggles, `thinkWithTools` still falls back to a **second full `think()`** on any `degraded` flag — even cases where turn-1 text was usable.

```101:110:app/src/services/jarvis.ts
  if (!mightNeedTools(userMessage)) {
    return think(...)
  }
  const plan = await planTools(userMessage, categories, sessionId)
```

```171:174:app/src/services/jarvis.ts
  if (!result || result.degraded || !result.reply) {
    return think(userMessage, history, vitals, signal, memoryContext)
  }
```

Note: text-only loop exit (`loop.py:207–208`) returns `reply` **without** `degraded` — that path is correct. The double-LLM hit is specifically **`degraded: true`** (provider failure, unsupported config) and silent to the user today.

---

### 4. Slow to listen (turn-end + mic gaps)

**Turn-end delay (by design)**

- Default `turnSilenceMs = 1200` (`app/src/config/voice.ts`, exposed in Voice Settings).
- After a **final** STT chunk, `scheduleTurnEnd(350)` adds another 350ms (`useRealtimeConversation.ts:277`).
- Effective minimum: **~1550ms** silence after last audible word before `processTurn` runs.

**Recognition stopped during think/speak**

- `processTurn` sets `processingRef.current = true`, calls `stopRecognition()` (line 309), phase → `thinking` / `speaking`.
- `onInterim` / `onFinal` early-return while `processingRef.current` (lines 262, 271).
- **No barge-in**: user speech during JARVIS reply is ignored until `resumeListening()`.

**Mic restart gap**

- `resumeListening` → `beginRecognition` → `stopRecognition()` then new `SpeechRecognition` instance.
- Chrome Web Speech startup gap ≈ **300–800ms** after each reply.
- `speech-recognition.ts` auto-restarts on `onend` when `active`, but conversation hook passes empty `onEnd` and explicitly stops during turns — restart only happens on next `beginRecognition`.

---

## Fix plan (ordered, small diffs)

Recommended implementation order: **measure → router/timeouts → heartbeat → listen tuning → Ollama ops**.

### Step 0 — Measure (no code change)

1. Start conversation with memory + tools enabled (typical user config).
2. Watch Live Activity for 5–10 turns:
   - Plain greeting ("hey JARVIS")
   - Memory question ("what did we decide about X")
   - Tool-ish phrase ("check docker status")
   - Pause 25s mid-session, then speak again (idle-worker stress test)
3. Record Retrieve / Think / Speak ms. Whichever dominates drives priority.

---

### Step 1 — Port full router to frontend (kill plan RTT)

**Goal:** Never call `/api/tools/plan` for deterministic outcomes the client can compute.

**Changes**

1. Move `_TOOL_KEYWORDS` + `_score` + candidate ranking from `runtime/tools/router.py` into shared TS (`app/src/lib/tool-plan.ts`), mirroring Python exactly.
2. `thinkWithTools`:
   - If local plan → `{ useTools: false }` → `think()` (already mostly true).
   - If local plan → `{ useTools: true, candidates }` → skip `planTools()`, go straight to `runToolLoop()`.
   - Optional: keep `planTools()` as dev-only fallback behind a flag; production path zero RTT.
3. Add a small parity test (Python router vs TS planner on a fixture list of utterances).

**Files:** `app/src/lib/tool-plan.ts`, `app/src/services/jarvis.ts`, optionally `runtime/tests/test_tools_router_parity.py`.

**Status:** Partial — coarse `mightNeedTools()` exists; full ranking not ported.

---

### Step 2 — Tighten router (server stays source of truth for loop)

**Goal:** Fewer false-positive tool loops on Ollama.

**Changes**

- ✅ **Done:** keyword score > 0 required; full-catalog fallback removed (`router.py:67–75`).
- **Optional:** require both execute-word match **and** score > 0 on frontend before `runToolLoop` (redundant once Step 1 ports ranking).
- **Optional:** gate "ambiguous execute words" (`plan`, `status`, `check`) behind explicit phrasing ("use a tool", "run a command") if false positives persist after Step 1.

**Status:** Server side done; client parity pending Step 1.

---

### Step 3 — Kill silent double-LLM fallback

**Goal:** When tool loop returns a usable reply, never pay for a second `think()`.

**Changes**

1. `jarvis.ts` — change fallback condition:

   ```ts
   // Before: degraded always re-thinks
   if (!result || result.degraded || !result.reply)

   // After: re-think only when there is no reply
   if (!result?.reply) {
     if (result?.degraded) {
       logActivity('llm', 'Tool loop degraded', 'error', result.reason ?? '')
       // optional: toast via existing error/setError path
     }
     return think(...)
   }
   return result.reply
   ```

2. If `degraded && reply` ever occurs from runtime, treat reply as authoritative (today loop sets `reply: null` on degraded — keep that invariant).

**Files:** `app/src/services/jarvis.ts`, `app/src/services/activity-log.ts` (new label).

**Status:** Open — current code always re-thinks on `degraded`.

---

### Step 4 — Client fetch timeouts (memory + tools)

**Goal:** Bounded wait on voice hot path; degrade to empty, never hang.

**Changes**

1. Replace `post()` in `memory.ts` and `tools.ts` with `fetchWithTimeout` from `app/src/lib/fetch.ts`.
2. Suggested budgets (tune after Step 0 measurements):

   | Call | Timeout | On timeout |
   |------|---------|------------|
   | `retrieveMemory` | 1500ms | `EMPTY_RETRIEVE` + activity log `error` |
   | `planTools` | 800ms | `NO_TOOLS` (until Step 1 removes call) |
   | `runToolLoop` | 30s+ (existing server `TURN_TIMEOUT_S`) | existing null/degraded handling |
   | `sendHeartbeat` | 500ms | swallow (already fire-and-forget) |

3. Pass turn `AbortSignal` into retrieve when wiring allows cancel on interrupt.

**Files:** `app/src/services/memory.ts`, `app/src/services/tools.ts`.

**Status:** Open — raw fetch today.

---

### Step 5 — Keep idle worker down during active session

**Goal:** No background embed during pauses < session length.

**Option A — Periodic heartbeat (preferred)**

- While `conversationActive`, `setInterval` every **10s** → `sendHeartbeat(budget)`.
- Clear interval on `stopConversation` / pause.
- Keeps `idle.touch()` fresh without waiting for next spoken turn.

**Option B — Raise idle threshold**

- `IDLE_AFTER_S = 60` or `120` in `idle.py` (quick knob, less precise).

**Option C — Session flag**

- Frontend sends `{ conversationActive: true }` on heartbeat; runtime refuses idle work while flag set (requires API + worker change).

**Files:** `app/src/hooks/useRealtimeConversation.ts`, optionally `runtime/memory/idle.py`, `runtime/models/memory.py`.

**Status:** Open — per-turn heartbeat only.

---

### Step 6 — Ollama tuning (ops, not app diff)

**Goal:** Chat model stays loaded; embed doesn't evict chat mid-session.

**Verify**

```bash
ollama ps   # mid-conversation: chat + embed both resident?
```

**Tune** (launchd / shell env for Ollama service)

```bash
OLLAMA_NUM_PARALLEL=2
OLLAMA_MAX_LOADED_MODELS=2
```

- Chat model: set `keep_alive` on generate calls (check `runtime/tools/loop.py` `_call_ollama` and `app/src/services/llm/ollama.ts`).
- Embed: already uses `JARVIS_EMBED_KEEP_ALIVE=30m` in `embedder.py`.

**Status:** Operational — verify before code changes.

---

### Step 7 — Listening feel (after latency path is bounded)

**Goal:** Snappier turn-end; document barge-in as follow-up.

**Quick wins**

1. Lower default `turnSilenceMs` **1200 → 800** in `voice.ts` (user-adjustable in Voice Settings already).
2. Reduce post-final delay **350 → 200** in `scheduleTurnEnd(350)` if double-triggering isn't observed.
3. Log turn-end wait in Live Activity (`voice`, `Turn silence`, ms) for tuning.

**Larger (separate slice — VOICE_INTERRUPT.md)**

- Barge-in: keep recognition running (or parallel VAD) during `speaking`, wire `interruptActiveWork()` on user speech.
- Reuse single `SpeechRecognition` instance across turns instead of destroy/recreate in `beginRecognition`.
- Consider push-to-talk mode for noisy environments.

**Files:** `app/src/config/voice.ts`, `app/src/hooks/useRealtimeConversation.ts`, future `VOICE_INTERRUPT` work.

**Status:** Defaults unchanged; barge-in not implemented.

---

## Implementation checklist

| # | Task | Impact | Effort | Status |
|---|------|--------|--------|--------|
| 0 | Live Activity baseline session | — | 5 min | **Do first** |
| 1 | Full tool router in TS; skip `/plan` | High (RTT) | Medium | Partial |
| 2 | Router keyword score gate | High (false loops) | Low | **Done** (server) |
| 3 | Fix degraded double-LLM + visible log | High (2× Think) | Low | Open |
| 4 | `fetchWithTimeout` on memory/tools | High (hangs) | Low | Open |
| 5 | Periodic heartbeat while conversing | High (cold model) | Low | Open |
| 6 | Ollama parallel / keep_alive verify | High (cold model) | Ops | Open |
| 7 | `turnSilenceMs` + listen gaps | Medium (feel) | Low–Large | Open |

---

## Suggested PR slices

1. **PR-A (latency hot path):** Step 4 timeouts + Step 3 fallback fix + Step 1 router port.
2. **PR-B (session idle):** Step 5 periodic heartbeat + Step 6 Ollama env docs in `run.sh` / README.
3. **PR-C (listen UX):** Step 7 silence defaults + activity logging; barge-in deferred to VOICE_INTERRUPT phase.

Each PR should include before/after Live Activity screenshots or logged ms for at least three turn types.

---

## References

| Doc / file | Relevance |
|------------|-----------|
| `TOOLS.md` §6.1 | Tool router spec |
| `memory.md` §4.2.1 | Dirty-idle / heartbeat |
| `VOICE_INTERRUPT.md` | Barge-in, deferred memory |
| `app/src/services/activity-log.ts` | Live Activity feed |
| `app/src/lib/tool-plan.ts` | Client router gate (partial) |
| `runtime/tools/router.py` | Server router (keyword score gate done) |
| `runtime/memory/jobs.py` | Idle embed worker |
| `CLAUDE.md` | Voice latency sacred; fire-and-forget memory |

---

## Open questions (resolve in Step 0)

1. With **Fast mode** on (skips retrieve + heartbeat), is Think still slow? → points to LLM/tools/idle, not memory retrieve.
2. After **25s pause**, does Think spike? → idle worker / model eviction (Steps 5–6).
3. Do **tool-ish words without tools** ("let me plan dinner") still enter loop? → Step 1 parity + keyword hints.
