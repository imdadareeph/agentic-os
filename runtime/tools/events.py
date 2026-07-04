"""In-process tool-execution event bus (T3 §4, CONVERSATION_AGENTS.md Notification
Agent). The executor publishes TOOL_STARTED / TOOL_EXECUTED / TOOL_FAILED events
here; the SSE endpoint (main.py `/api/tools/events`) fans them out to the frontend.

Fan-out is an asyncio.Queue-per-subscriber list: publish() puts onto every active
queue, subscribe() yields from its own queue until cancelled. Queues are bounded
and drop-oldest-on-full, so a slow or dead consumer can never block a publisher or
leak memory. publish() itself NEVER raises — tool execution must not depend on the
notification path succeeding.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, AsyncIterator

# Per-subscriber bounded queue. Small: consumers only render transient UI state,
# so an overwhelmed consumer losing the oldest event is acceptable.
_QUEUE_MAXSIZE = 50

_subscribers: list[asyncio.Queue[dict[str, Any]]] = []


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_event(
    event_type: str,
    tool: str,
    session_id: str | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    """Build the canonical event shape shared with the frontend `ToolEvent` type."""
    return {
        "type": event_type,
        "tool": tool,
        "sessionId": session_id,
        "timestamp": _now_iso(),
        "error": error,
    }


def publish(event: dict[str, Any]) -> None:
    """Fan `event` out to every active subscriber. Never raises, never blocks.

    On a full queue we evict the oldest event and enqueue the new one, so live
    state (e.g. the latest TOOL_FAILED) always wins over stale backlog.
    """
    for queue in list(_subscribers):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            try:
                queue.get_nowait()  # drop oldest
            except Exception:
                pass
            try:
                queue.put_nowait(event)
            except Exception:
                pass
        except Exception:
            pass


async def subscribe() -> AsyncIterator[dict[str, Any]]:
    """Yield events until the consumer is cancelled (client disconnect)."""
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    _subscribers.append(queue)
    try:
        while True:
            yield await queue.get()
    finally:
        try:
            _subscribers.remove(queue)
        except ValueError:
            pass


def subscriber_count() -> int:
    return len(_subscribers)
