"""Deterministic reflection (Stages 5-8) — hermetic (temp DB, episodic stubbed)."""

import json

import pytest

from memory import conversation, reflection


# --- Stage 5: classify -------------------------------------------------------

def test_classify_decision_and_architecture():
    c = reflection.classify("Let's use Rust instead of Spring Boot for the backend")
    assert "decision" in c
    assert "architecture" in c


def test_classify_greeting():
    assert reflection.classify("hey there") == ["greeting"]
    assert reflection.classify("thanks!") == ["greeting"]


def test_classify_question_and_task():
    assert "question" in reflection.classify("how do I set up docker?")
    assert "task" in reflection.classify("build the memory engine")


def test_classify_empty_is_temporary():
    assert reflection.classify("") == ["temporary"]


# --- Stage 6: importance -----------------------------------------------------

def test_importance_greeting_low():
    assert reflection.importance("hi", ["greeting"]) <= 2


def test_importance_architecture_decision_max():
    assert reflection.importance("switch backend to rust", ["decision", "architecture"]) == 10


def test_importance_question_modest():
    assert 1 <= reflection.importance("what is x?", ["question"]) <= 4


# --- Stage 7: decide ---------------------------------------------------------

def test_decide_boundaries():
    assert reflection.decide(0) == "ignore"
    assert reflection.decide(2) == "session"
    assert reflection.decide(4) == "short_term"
    assert reflection.decide(6) == "episode"
    assert reflection.decide(8) == "long_term"
    assert reflection.decide(10) == "permanent"


# --- reflect_on_turn + integration ------------------------------------------

@pytest.fixture
async def db(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_DB_PATH", str(tmp_path / "memory.db"))
    conn = await conversation.connect()
    from memory import sync

    await sync.ensure_migrations(conn)
    yield conn
    await conn.close()


async def test_reflect_on_turn_records_row(db, monkeypatch):
    # Stub episodic promotion so no vault/embedding is needed.
    async def _no_note(*a, **k):
        return {"written": False}

    monkeypatch.setattr(reflection.episodic, "write_note", _no_note)

    res = await reflection.reflect_on_turn(
        db, {"id": "t1", "session_id": "s1", "role": "user", "content": "switch backend to rust"}
    )
    assert res["decision"] == "permanent"
    cur = await db.execute("SELECT classifications, importance, decision FROM memory_reflections WHERE turn_id='t1'")
    row = await cur.fetchone()
    assert row is not None
    assert "decision" in json.loads(row["classifications"])
    assert row["importance"] == 10
    assert row["decision"] == "permanent"


async def test_dirty_turns_drain_and_reflect(db, monkeypatch):
    async def _no_note(*a, **k):
        return {"written": False}

    monkeypatch.setattr(reflection.episodic, "write_note", _no_note)

    await conversation.create_session(db, "s1", True, False, "jarvis")
    await conversation.store_turn(db, "s1", "u1", "user", "let's migrate to rust", False, "jarvis")
    await conversation.store_turn(db, "s1", "u2", "user", "hello", False, "jarvis")

    turns = await conversation.dirty_turns(db, 50)
    assert len(turns) == 2  # both stored dirty
    for t in turns:
        await reflection.reflect_on_turn(db, t)
    await conversation.clear_turn_dirty(db, [t["id"] for t in turns])

    # Dirty flags cleared.
    assert await conversation.dirty_turns(db, 50) == []
    # Two reflection rows, with the decision turn ranked above the greeting.
    cur = await db.execute("SELECT turn_id, importance FROM memory_reflections ORDER BY importance DESC")
    rows = await cur.fetchall()
    assert [r["turn_id"] for r in rows][0] == "u1"
    assert rows[-1]["importance"] <= 2  # the greeting
