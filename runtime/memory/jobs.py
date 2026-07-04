"""Idle background memory processing — dirty-flag deferred work (Phase M2.5).

Runs as an asyncio loop under uvicorn. When the user goes idle (``idle.is_idle()``),
a bounded worker pass processes only rows flagged dirty, then clears the flag:

    - dirty ``sync_files`` -> re-embed changed vault files, drop deleted ones
    - dirty ``turns``      -> reflection hook (fact/decision extraction lands here
                              with the agent layer; for now it clears the flag)

Everything is governed by the Memory Budget (see the frontend
``memory-settings-store`` / ``MemorySettingsSheet`` "Memory Budget" section),
mirrored into the runtime via ``/api/memory/heartbeat``:

    - max_parallel_jobs        : concurrent embed tasks (Semaphore width)
    - embedding_budget_per_day : hard cap on embeds/day (protects CPU/battery)
    - daily_reflection_minutes : max wall-clock spent reflecting per day
    - max_background_cpu/gpu %  : advisory throttle -> inter-job sleep

Nothing here runs while the user is active, nothing here blocks an API/voice
response, and every exception is swallowed so the loop never dies.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from datetime import date

import aiosqlite

from memory import conversation, idle, reflection, semantic, sync

# How often the loop wakes to check for idle + dirty work.
POLL_INTERVAL_S = 5.0
# Max dirty turns reflected on per pass (keeps each pass short).
_TURN_BATCH = 20


@dataclass
class Budget:
    max_parallel_jobs: int = 3
    embedding_budget_per_day: int = 500
    daily_reflection_minutes: int = 15
    max_background_cpu_percent: int = 20
    max_background_gpu_percent: int = 30


_budget = Budget()


def set_budget(**kwargs) -> None:
    """Update the runtime budget from a frontend heartbeat. Unknown/None keys ignored."""
    for key, value in kwargs.items():
        if value is not None and hasattr(_budget, key):
            setattr(_budget, key, value)


def get_budget() -> Budget:
    return _budget


# --- daily counters (roll over at local midnight) ------------------------

_day = date.today()
_embeds_today = 0
_reflection_seconds_today = 0.0


def _rollover() -> None:
    global _day, _embeds_today, _reflection_seconds_today
    today = date.today()
    if today != _day:
        _day = today
        _embeds_today = 0
        _reflection_seconds_today = 0.0


def embeds_remaining_today() -> int:
    _rollover()
    return max(0, _budget.embedding_budget_per_day - _embeds_today)


def reflection_seconds_remaining_today() -> float:
    _rollover()
    return max(0.0, _budget.daily_reflection_minutes * 60 - _reflection_seconds_today)


def _throttle_sleep_s() -> float:
    """Advisory pause between jobs derived from the background CPU cap.

    At 100% we don't pause; at 20% we pause ~4x the nominal slice so the worker
    yields the machine back to the (idle-but-may-return) user.
    """
    pct = max(1, min(100, _budget.max_background_cpu_percent))
    return round((100.0 / pct - 1.0) * 0.25, 3)


# --- dirty vault files: deferred embedding -------------------------------

async def process_dirty_files(conn: aiosqlite.Connection) -> int:
    """Embed (or drop) dirty vault files, bounded by parallelism + daily budget.

    Returns the number of files processed this pass.
    """
    global _embeds_today
    budget_left = embeds_remaining_today()
    if budget_left <= 0:
        return 0

    batch = min(budget_left, max(1, _budget.max_parallel_jobs))
    files = await sync.dirty_files(conn, batch)
    if not files:
        return 0

    sem = asyncio.Semaphore(max(1, _budget.max_parallel_jobs))
    processed = 0

    async def _one(entry: dict) -> None:
        nonlocal processed
        global _embeds_today
        rel = entry["path"]
        async with sem:
            if not idle.is_idle():
                return  # user came back mid-pass — stand down immediately
            try:
                full = sync.VAULT_PATH / rel
                if entry["deleted"] or not full.exists():
                    semantic.delete_file(rel)
                    await sync.drop_file(conn, rel)
                else:
                    text = full.read_text(encoding="utf-8")
                    chunks = await semantic.upsert_file(rel, text)
                    await sync.clear_file_dirty(conn, rel, semantic.file_hash(text), chunks)
                    _embeds_today += 1
                processed += 1
            except Exception:
                pass  # leave dirty; next idle pass retries
            await asyncio.sleep(_throttle_sleep_s())

    await asyncio.gather(*(_one(f) for f in files))
    return processed


# --- dirty turns: reflection hook ----------------------------------------

async def _reflect_on_turn(conn: aiosqlite.Connection, turn: dict) -> None:
    """Deterministic reflection (MEMORY_DECISION.md Stages 5-8).

    Classifies the turn, scores importance, records a memory decision, and
    promotes high-importance turns to episodic notes. Cheap + rule-based so it
    respects the daily reflection time budget; LLM extraction agents can layer
    on later without changing this call site.
    """
    await reflection.reflect_on_turn(conn, turn)


async def process_dirty_turns(conn: aiosqlite.Connection) -> int:
    """Reflect on dirty turns until the daily time budget is spent. Returns count."""
    global _reflection_seconds_today
    if reflection_seconds_remaining_today() <= 0:
        return 0

    turns = await conversation.dirty_turns(conn, _TURN_BATCH)
    if not turns:
        return 0

    done: list[str] = []
    for turn in turns:
        if not idle.is_idle() or reflection_seconds_remaining_today() <= 0:
            break
        start = time.monotonic()
        try:
            await _reflect_on_turn(conn, turn)
        except Exception:
            pass
        _reflection_seconds_today += time.monotonic() - start
        done.append(turn["id"])
        await asyncio.sleep(_throttle_sleep_s())

    await conversation.clear_turn_dirty(conn, done)
    return len(done)


# --- loop ----------------------------------------------------------------

async def run_loop(conn: aiosqlite.Connection) -> None:
    """Idle worker loop. Never dies; only works while the user is idle."""
    while True:
        await asyncio.sleep(POLL_INTERVAL_S)
        try:
            if not idle.is_idle():
                continue
            await process_dirty_files(conn)
            await process_dirty_turns(conn)
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
