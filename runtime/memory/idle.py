"""User-activity tracking + idle detection for deferred background memory work.

The dirty/idle pattern (MEMORY_DECISION.md "Background Memory Jobs",
VOICE_INTERRUPT.md FR-10):

    modified -> dirty=true -> user active -> system idle -> workers process -> dirty=false

Voice latency is sacred. While the user is active — a recent turn store, a
retrieve, or a heartbeat from the frontend — background jobs stand down.
``is_idle()`` only returns True after ``IDLE_AFTER_S`` seconds of quiet, so the
idle worker never competes with a live conversation for CPU/GPU.

Every touch point on the API hot path calls ``touch()``; nothing here ever
blocks a request.
"""

from __future__ import annotations

import time

# Seconds of no activity before the idle worker is allowed to run.
IDLE_AFTER_S = 20.0

_last_activity: float = 0.0


def touch() -> None:
    """Record activity (called from retrieve/store/heartbeat). Cheap + non-blocking."""
    global _last_activity
    _last_activity = time.monotonic()


def seconds_since_activity() -> float:
    if _last_activity == 0.0:
        return float("inf")  # nothing has happened yet — treat as idle
    return time.monotonic() - _last_activity


def is_idle(idle_after_s: float = IDLE_AFTER_S) -> bool:
    return seconds_since_activity() >= idle_after_s
