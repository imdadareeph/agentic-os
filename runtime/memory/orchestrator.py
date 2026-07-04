"""Memory orchestrator — decides when to hit semantic memory (Phase M2).

Keyword/intent gate first, not an LLM call (MEMORY_IMPLEMENTATION_PLAN §3.4):
a second model round-trip before the real one would add latency for no gain.
A hard 300ms timeout guards the Chroma query so voice never blocks.
"""

from __future__ import annotations

import asyncio
import re

from memory import semantic

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
