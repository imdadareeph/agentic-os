"""Profile facts store — MF0 schema + read path; MF1 adds warm-path extraction."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

import aiosqlite

# Deterministic extract patterns (MF1 expands; MF0 seeds the store for tests/debug).
_EXTRACT_RULES: list[tuple[re.Pattern[str], str, float]] = [
    (re.compile(r"\bmy name is ([^,.]+?)(?:\s+and\b|$)", re.IGNORECASE), "identity/name", 0.9),
    (
        re.compile(r"\bcall me ([^,.]+?)(?:\s+and\b|\s+I prefer\b|$)", re.IGNORECASE),
        "identity/name",
        0.95,
    ),
    (re.compile(r"\bI prefer (.+)", re.IGNORECASE), "preferences/general", 0.85),
    (
        re.compile(r"\bremember that I (.+)", re.IGNORECASE),
        "preferences/general",
        0.8,
    ),
    (
        re.compile(r"\balways use (.+)", re.IGNORECASE),
        "preferences/stack",
        0.85,
    ),
    (
        re.compile(r"\bdon't use (.+)", re.IGNORECASE),
        "preferences/stack",
        0.85,
    ),
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_value(raw: str) -> str:
    value = raw.strip().strip('"\'.,!?')
    return value[:500]


async def list_active_facts(
    conn: aiosqlite.Connection, limit: int = 100
) -> list[dict]:
    """Active facts only (superseded_by IS NULL), newest first."""
    cur = await conn.execute(
        """SELECT id, fact_key, value, confidence, source_turn_id, created_at, updated_at
           FROM user_facts
           WHERE superseded_by IS NULL
           ORDER BY updated_at DESC
           LIMIT ?""",
        (max(1, limit),),
    )
    rows = await cur.fetchall()
    return [
        {
            "id": r["id"],
            "key": r["fact_key"],
            "value": r["value"],
            "confidence": float(r["confidence"]),
            "sourceTurnId": r["source_turn_id"],
            "createdAt": r["created_at"],
            "updatedAt": r["updated_at"],
        }
        for r in rows
    ]


async def upsert_fact(
    conn: aiosqlite.Connection,
    key: str,
    value: str,
    confidence: float = 0.8,
    source_turn_id: str | None = None,
) -> str | None:
    """Insert a new fact row; supersede prior active row when confidence >= prior."""
    key = key.strip()
    value = _clean_value(value)
    if not key or not value:
        return None

    fact_id = str(uuid.uuid4())
    now = _now()

    cur = await conn.execute(
        """SELECT id, confidence FROM user_facts
           WHERE fact_key = ? AND superseded_by IS NULL""",
        (key,),
    )
    row = await cur.fetchone()
    if row and confidence < float(row["confidence"]):
        return None

    await conn.execute(
        """INSERT INTO user_facts
             (id, fact_key, value, confidence, source_turn_id, created_at, updated_at, superseded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL)""",
        (fact_id, key, value, confidence, source_turn_id, now, now),
    )

    if row:
        await conn.execute(
            """UPDATE user_facts SET superseded_by = ?, updated_at = ?
               WHERE id = ?""",
            (fact_id, now, row["id"]),
        )

    await conn.commit()
    return fact_id


async def extract_from_text(
    conn: aiosqlite.Connection,
    text: str,
    source_turn_id: str | None = None,
) -> int:
    """Rules-first extraction (MF0 debug/MF1 warm path). Returns facts written."""
    msg = text.strip()
    if not msg:
        return 0

    written = 0
    for pattern, key, confidence in _EXTRACT_RULES:
        match = pattern.search(msg)
        if not match:
            continue
        value = _clean_value(match.group(1))
        if not value:
            continue
        if await upsert_fact(conn, key, value, confidence, source_turn_id):
            written += 1
    return written
