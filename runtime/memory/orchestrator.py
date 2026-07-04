"""Memory orchestrator — decides when to hit semantic memory (Phase M2).

Keyword/intent gate first, not an LLM call (MEMORY_IMPLEMENTATION_PLAN §3.4):
a second model round-trip before the real one would add latency for no gain.
A hard 300ms timeout guards the Chroma query so voice never blocks.
"""

from __future__ import annotations

import asyncio
import re

import aiosqlite

from memory import procedural, semantic

# Triggers that warrant a semantic lookup (memory.md §3.1).
_QUESTION_WORDS = re.compile(
    r"\b(how|what|why|where|which|explain|show|remind|recall)\b", re.IGNORECASE
)
_PAST_REFERENCE = re.compile(
    r"\b(last time|earlier|before|previously|that note|we set up|we did|remember)\b",
    re.IGNORECASE,
)
_INTENT_WORDS = re.compile(
    r"\b(setup|set up|configure|install|research|decide|decision|document)\b",
    re.IGNORECASE,
)
# Never retrieve for these.
_SKIP = re.compile(
    r"^\s*(hi|hey|hello|stop|pause|resume|thanks|thank you|ok|okay|yes|no)\b",
    re.IGNORECASE,
)

# Retry/debug phrasing that should surface the recent tool-run log (T2, TOOLS.md §9.2):
# "how did we start Docker last time?" → recall prior tool usage, not a note.
_PROCEDURAL_INTENT = re.compile(
    r"\b(how did we|last time|that command|previously ran|did we run|"
    r"what tools|how do we usually)\b",
    re.IGNORECASE,
)

_TIMEOUT_S = 0.3


def should_retrieve(user_message: str) -> bool:
    msg = user_message.strip()
    if not msg or _SKIP.match(msg):
        return False
    return bool(
        _QUESTION_WORDS.search(msg)
        or _PAST_REFERENCE.search(msg)
        or _INTENT_WORDS.search(msg)
    )


async def semantic_hits(user_message: str, top_k: int, min_score: float) -> list[dict]:
    """Gated + timeout-guarded semantic query. Returns [] on skip/timeout/error."""
    if not should_retrieve(user_message):
        return []
    try:
        return await asyncio.wait_for(
            semantic.query(user_message, top_k, min_score), timeout=_TIMEOUT_S
        )
    except (asyncio.TimeoutError, Exception):
        return []


def is_procedural_intent(user_message: str) -> bool:
    """True when the user is asking how something was done before (retry/debug)."""
    msg = user_message.strip()
    if not msg or _SKIP.match(msg):
        return False
    return bool(_PROCEDURAL_INTENT.search(msg))


async def procedural_hits(
    conn: aiosqlite.Connection, user_message: str, limit: int = 5
) -> list[dict]:
    """Recent tool runs, but only on retry/debug intent. Returns [] otherwise.

    Deterministic (no LLM): the intent gate decides, the tool log answers.
    """
    if not is_procedural_intent(user_message):
        return []
    runs = await procedural.recent_tool_runs(conn, limit=limit)
    return [
        {"tool": r["tool_name"], "success": r["success"], "when": r["created_at"]}
        for r in runs
    ]
