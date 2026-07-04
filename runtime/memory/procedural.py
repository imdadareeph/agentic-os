"""Procedural memory — tool execution log (Phase M4).

Ships with a working CRUD layer but nothing populates it until the Tool
Registry (main roadmap Phase 3) exists. No fake data generator — an empty,
correctly-shaped table is the right amount of ready.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import aiosqlite


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def record_tool_run(
    conn: aiosqlite.Connection,
    tool_name: str,
    success: bool,
    session_id: str | None = None,
    agent_id: str = "jarvis",
    input_json: str | None = None,
    output_json: str | None = None,
    duration_ms: int | None = None,
) -> str:
    run_id = str(uuid.uuid4())
    await conn.execute(
        """INSERT INTO tool_runs
           (id, session_id, agent_id, tool_name, input_json, output_json, success, duration_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (run_id, session_id, agent_id, tool_name, input_json, output_json, success, duration_ms, _now()),
    )
    await conn.commit()
    return run_id


async def recent_tool_runs(
    conn: aiosqlite.Connection, tool_name: str | None = None, limit: int = 20
) -> list[dict]:
    if tool_name:
        cur = await conn.execute(
            """SELECT id, tool_name, success, duration_ms, created_at
               FROM tool_runs WHERE tool_name = ?
               ORDER BY created_at DESC LIMIT ?""",
            (tool_name, limit),
        )
    else:
        cur = await conn.execute(
            """SELECT id, tool_name, success, duration_ms, created_at
               FROM tool_runs ORDER BY created_at DESC LIMIT ?""",
            (limit,),
        )
    rows = await cur.fetchall()
    return [
        {
            "id": r["id"],
            "tool_name": r["tool_name"],
            "success": bool(r["success"]),
            "duration_ms": r["duration_ms"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]
