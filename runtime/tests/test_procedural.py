"""Procedural memory + retention — hermetic (temp DB, summarizer stubbed)."""

from datetime import datetime, timedelta, timezone

import pytest

from memory import conversation, orchestrator, procedural, retention
from memory.context_builder import build_procedural_block


@pytest.fixture
async def db(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_DB_PATH", str(tmp_path / "memory.db"))
    conn = await conversation.connect()
    # M0 connect() applies schema.sql; apply migrations for tool_runs/turns_archive.
    from memory import sync

    await sync.ensure_migrations(conn)
    yield conn
    await conn.close()


async def test_record_and_recent_tool_runs(db):
    await procedural.record_tool_run(db, "docker.run", True, duration_ms=120)
    await procedural.record_tool_run(db, "fs.read", False)
    runs = await procedural.recent_tool_runs(db)
    assert len(runs) == 2
    names = {r["tool_name"] for r in runs}
    assert names == {"docker.run", "fs.read"}


async def test_recent_tool_runs_filter_by_name(db):
    await procedural.record_tool_run(db, "docker.run", True)
    await procedural.record_tool_run(db, "fs.read", True)
    runs = await procedural.recent_tool_runs(db, tool_name="docker.run")
    assert len(runs) == 1
    assert runs[0]["tool_name"] == "docker.run"


async def _backdate_turn(conn, session_id, turn_id, content, days_ago):
    ts = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    await conn.execute(
        """INSERT INTO turns (id, session_id, role, content, created_at)
           VALUES (?, ?, 'user', ?, ?)""",
        (turn_id, session_id, content, ts),
    )
    await conn.commit()


async def test_retention_archives_old_turns(db, monkeypatch):
    # Stub summarization so no Ollama is needed.
    async def _fake_summary(text, timeout=30.0):
        return "SUMMARY"

    monkeypatch.setattr(retention.llm, "summarize", _fake_summary)

    await conversation.create_session(db, "old", True, False, "jarvis")
    await _backdate_turn(db, "old", "t1", "ancient one", 40)
    await _backdate_turn(db, "old", "t2", "ancient two", 40)
    # A fresh turn that must survive.
    await conversation.store_turn(db, "old", "t3", "user", "recent", False, "jarvis")

    result = await retention.run_retention(db, conversation_days=30, procedural_days=90)
    assert result["archived_sessions"] == 1
    assert result["archived_turns"] == 2

    # Raw old turns gone, recent kept.
    remaining = await conversation.recent_turns(db, "old", 10)
    assert [t["content"] for t in remaining] == ["recent"]

    # Archive row written.
    cur = await db.execute("SELECT summary, turn_count FROM turns_archive")
    row = await cur.fetchone()
    assert row["summary"] == "SUMMARY"
    assert row["turn_count"] == 2


async def test_retention_prunes_old_tool_runs(db):
    old_ts = (datetime.now(timezone.utc) - timedelta(days=100)).isoformat()
    await db.execute(
        """INSERT INTO tool_runs (id, tool_name, success, created_at)
           VALUES ('r1', 'x', 1, ?)""",
        (old_ts,),
    )
    await procedural.record_tool_run(db, "fresh", True)  # now
    result = await retention.run_retention(db, procedural_days=90)
    assert result["pruned_tool_runs"] == 1
    runs = await procedural.recent_tool_runs(db)
    assert [r["tool_name"] for r in runs] == ["fresh"]


# --- T2: procedural retrieval (orchestrator + context_builder) ---


@pytest.mark.parametrize(
    "msg",
    [
        "how did we start Docker last time?",
        "what was that command we ran",
        "did we run the migration already",
        "what tools do we have for this",
        "how do we usually deploy",
        "we previously ran the seed script",
    ],
)
def test_is_procedural_intent_true(msg):
    assert orchestrator.is_procedural_intent(msg) is True


@pytest.mark.parametrize(
    "msg",
    ["", "hi", "hello there", "thanks", "download this video", "make it dark"],
)
def test_is_procedural_intent_false(msg):
    assert orchestrator.is_procedural_intent(msg) is False


async def test_procedural_hits_on_debug_intent(db):
    await procedural.record_tool_run(db, "docker.run", True, duration_ms=120)
    await procedural.record_tool_run(db, "fs.read", False)
    hits = await orchestrator.procedural_hits(db, "how did we start Docker last time?")
    assert len(hits) == 2
    assert set(hits[0].keys()) == {"tool", "success", "when"}
    assert {h["tool"] for h in hits} == {"docker.run", "fs.read"}


async def test_procedural_hits_empty_on_greeting(db):
    await procedural.record_tool_run(db, "docker.run", True)
    assert await orchestrator.procedural_hits(db, "hi there") == []


def test_build_procedural_block_formatting():
    runs = [
        {"tool": "docker.run", "success": True, "when": "2026-07-04T10:00:00+00:00"},
        {"tool": "fs.read", "success": False, "when": "2026-07-04T09:00:00+00:00"},
    ]
    block = build_procedural_block(runs)
    assert block.startswith("## Prior tool usage")
    assert "- docker.run (2026-07-04T10:00:00+00:00): success" in block
    assert "- fs.read (2026-07-04T09:00:00+00:00): failure" in block


def test_build_procedural_block_empty():
    assert build_procedural_block([]) == ""
