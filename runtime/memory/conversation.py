"""Conversation memory — SQLite CRUD for sessions and turns (Phase M0)."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

# goal.md §5.4 / §11 locked decision: runtime data lives under ~/jarvis, not the repo.
DEFAULT_DB_PATH = Path.home() / "jarvis" / "db" / "memory.db"
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "db" / "schema.sql"


def db_path() -> Path:
    return Path(os.environ.get("JARVIS_DB_PATH", str(DEFAULT_DB_PATH))).expanduser()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def connect() -> aiosqlite.Connection:
    """Open the DB, creating parent dirs and applying the schema idempotently."""
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = await aiosqlite.connect(path)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA journal_mode = WAL")
    await conn.execute("PRAGMA foreign_keys = ON")
    await conn.executescript(SCHEMA_PATH.read_text())
    await conn.commit()
    return conn


async def create_session(
    conn: aiosqlite.Connection,
    session_id: str,
    session_memory_enabled: bool,
    incognito: bool,
    agent_id: str,
) -> None:
    await conn.execute(
        """INSERT INTO sessions (id, created_at, session_memory_enabled, incognito, agent_id)
           VALUES (?, ?, ?, ?, ?)""",
        (session_id, _now(), session_memory_enabled, incognito, agent_id),
    )
    await conn.commit()


async def end_session(conn: aiosqlite.Connection, session_id: str) -> bool:
    cur = await conn.execute(
        "UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
        (_now(), session_id),
    )
    await conn.commit()
    return cur.rowcount > 0


async def store_turn(
    conn: aiosqlite.Connection,
    session_id: str,
    turn_id: str,
    role: str,
    content: str,
    refined: bool,
    agent_id: str,
) -> None:
    # dirty = 1: the turn is written immediately (never blocking voice) but flagged
    # for the idle background worker to reflect on later (MEMORY_DECISION.md).
    await conn.execute(
        """INSERT OR REPLACE INTO turns
             (id, session_id, role, content, agent_id, refined, dirty, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)""",
        (turn_id, session_id, role, content, agent_id, refined, _now()),
    )
    await conn.commit()


async def recent_turns(
    conn: aiosqlite.Connection, session_id: str, limit: int
) -> list[dict]:
    cur = await conn.execute(
        """SELECT id, role, content, refined, created_at
           FROM turns WHERE session_id = ?
           ORDER BY created_at DESC LIMIT ?""",
        (session_id, limit),
    )
    rows = await cur.fetchall()
    # DESC query for the index, reversed to chronological for the caller.
    return [
        {
            "id": r["id"],
            "role": r["role"],
            "content": r["content"],
            "refined": bool(r["refined"]),
            "createdAt": r["created_at"],
        }
        for r in reversed(rows)
    ]


async def dirty_turns(conn: aiosqlite.Connection, limit: int) -> list[dict]:
    """Turns awaiting idle-time reflection (dirty = 1), oldest first."""
    cur = await conn.execute(
        """SELECT id, session_id, role, content
           FROM turns WHERE dirty = 1
           ORDER BY created_at ASC LIMIT ?""",
        (limit,),
    )
    rows = await cur.fetchall()
    return [
        {"id": r["id"], "session_id": r["session_id"], "role": r["role"], "content": r["content"]}
        for r in rows
    ]


async def clear_turn_dirty(conn: aiosqlite.Connection, turn_ids: list[str]) -> None:
    if not turn_ids:
        return
    placeholders = ",".join("?" for _ in turn_ids)
    await conn.execute(
        f"UPDATE turns SET dirty = 0 WHERE id IN ({placeholders})", turn_ids
    )
    await conn.commit()
