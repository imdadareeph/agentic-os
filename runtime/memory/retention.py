"""Retention / archive job (Phase M4).

Runs as an asyncio background task (not cron — uvicorn is already long-running).
Turns older than `conversation_days` are summarized into `turns_archive` and
their raw rows deleted; tool_runs older than `procedural_days` are pruned.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import aiosqlite

from memory import llm


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cutoff(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


async def run_retention(
    conn: aiosqlite.Connection,
    conversation_days: int = 30,
    procedural_days: int = 90,
) -> dict:
    """Archive old turns and prune old tool_runs. Returns a summary dict."""
    conv_cutoff = _cutoff(conversation_days)

    # Group old turns by session so each archived summary is per-session.
    cur = await conn.execute(
        "SELECT DISTINCT session_id FROM turns WHERE created_at < ?", (conv_cutoff,)
    )
    sessions = [r["session_id"] for r in await cur.fetchall()]

    archived_sessions = 0
    archived_turns = 0
    for sid in sessions:
        cur = await conn.execute(
            """SELECT role, content, created_at FROM turns
               WHERE session_id = ? AND created_at < ?
               ORDER BY created_at ASC""",
            (sid, conv_cutoff),
        )
        rows = await cur.fetchall()
        if not rows:
            continue
        transcript = "\n".join(f"{r['role']}: {r['content']}" for r in rows)
        summary = await llm.summarize(transcript)
        await conn.execute(
            """INSERT INTO turns_archive
               (id, session_id, summary, turn_count, period_start, period_end, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                str(uuid.uuid4()),
                sid,
                summary,
                len(rows),
                rows[0]["created_at"],
                rows[-1]["created_at"],
                _now(),
            ),
        )
        await conn.execute(
            "DELETE FROM turns WHERE session_id = ? AND created_at < ?",
            (sid, conv_cutoff),
        )
        archived_sessions += 1
        archived_turns += len(rows)

    # Prune old tool_runs (straight delete, no summary).
    proc_cutoff = _cutoff(procedural_days)
    cur = await conn.execute(
        "DELETE FROM tool_runs WHERE created_at < ?", (proc_cutoff,)
    )
    pruned_tool_runs = cur.rowcount
    await conn.commit()

    return {
        "archived_sessions": archived_sessions,
        "archived_turns": archived_turns,
        "pruned_tool_runs": pruned_tool_runs,
    }
