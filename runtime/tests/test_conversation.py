"""SQLite conversation store — hermetic (temp DB per test)."""

import pytest

from memory import conversation


@pytest.fixture
async def db(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_DB_PATH", str(tmp_path / "memory.db"))
    conn = await conversation.connect()
    yield conn
    await conn.close()


async def test_create_and_end_session(db):
    await conversation.create_session(db, "s1", True, False, "jarvis")
    assert await conversation.end_session(db, "s1") is True
    # Ending an already-ended / unknown session returns False.
    assert await conversation.end_session(db, "nope") is False


async def test_store_and_recent_turns_chronological(db):
    await conversation.create_session(db, "s1", True, False, "jarvis")
    await conversation.store_turn(db, "s1", "t1", "user", "first", False, "jarvis")
    await conversation.store_turn(db, "s1", "t2", "assistant", "second", False, "jarvis")
    turns = await conversation.recent_turns(db, "s1", 10)
    assert [t["content"] for t in turns] == ["first", "second"]
    assert turns[0]["role"] == "user"


async def test_recent_turns_limit(db):
    await conversation.create_session(db, "s1", True, False, "jarvis")
    for i in range(5):
        await conversation.store_turn(db, "s1", f"t{i}", "user", f"m{i}", False, "jarvis")
    turns = await conversation.recent_turns(db, "s1", 2)
    # Last 2, chronological.
    assert [t["content"] for t in turns] == ["m3", "m4"]


async def test_store_turn_replace_upgrades_refined(db):
    await conversation.create_session(db, "s1", True, False, "jarvis")
    await conversation.store_turn(db, "s1", "t1", "user", "raw", False, "jarvis")
    await conversation.store_turn(db, "s1", "t1", "user", "refined text", True, "jarvis")
    turns = await conversation.recent_turns(db, "s1", 10)
    assert len(turns) == 1
    assert turns[0]["content"] == "refined text"
    assert turns[0]["refined"] is True
