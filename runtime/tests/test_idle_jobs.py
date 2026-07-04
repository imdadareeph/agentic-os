"""Idle worker + dirty-flag deferred processing — hermetic (temp DB/vault, embed stubbed)."""

import importlib

import pytest

from memory import conversation, idle


@pytest.fixture
async def db(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_DB_PATH", str(tmp_path / "memory.db"))
    conn = await conversation.connect()
    from memory import sync

    await sync.ensure_migrations(conn)
    yield conn
    await conn.close()


# --- idle tracking -----------------------------------------------------------

def test_idle_before_any_activity(monkeypatch):
    monkeypatch.setattr(idle, "_last_activity", 0.0)
    assert idle.is_idle() is True


def test_touch_marks_active(monkeypatch):
    idle.touch()
    # Just touched -> not idle under the normal window.
    assert idle.is_idle(idle_after_s=10.0) is False
    # But idle if we allow zero quiet time.
    assert idle.is_idle(idle_after_s=0.0) is True


# --- budget + daily counters -------------------------------------------------

def test_set_budget_ignores_none():
    from memory import jobs

    jobs.set_budget(max_parallel_jobs=5, embedding_budget_per_day=None)
    assert jobs.get_budget().max_parallel_jobs == 5
    # None left the existing value untouched.
    assert jobs.get_budget().embedding_budget_per_day == jobs.Budget().embedding_budget_per_day


def test_throttle_sleep_scales_with_cpu_cap():
    from memory import jobs

    jobs.set_budget(max_background_cpu_percent=100)
    assert jobs._throttle_sleep_s() == 0.0
    jobs.set_budget(max_background_cpu_percent=20)
    assert jobs._throttle_sleep_s() > 0.0


# --- store_turn marks dirty --------------------------------------------------

async def test_store_turn_marks_dirty(db):
    await conversation.create_session(db, "s1", True, False, "jarvis")
    await conversation.store_turn(db, "s1", "t1", "user", "hi", False, "jarvis")
    dirty = await conversation.dirty_turns(db, 10)
    assert [t["id"] for t in dirty] == ["t1"]


# --- process_dirty_turns clears the flag under an idle window ----------------

async def test_process_dirty_turns_clears(db, monkeypatch):
    from memory import jobs

    monkeypatch.setattr(idle, "_last_activity", 0.0)  # force idle
    jobs.set_budget(daily_reflection_minutes=15, max_background_cpu_percent=100)
    jobs._reflection_seconds_today = 0.0

    await conversation.create_session(db, "s1", True, False, "jarvis")
    await conversation.store_turn(db, "s1", "t1", "user", "hi", False, "jarvis")
    await conversation.store_turn(db, "s1", "t2", "assistant", "hello", False, "jarvis")

    processed = await jobs.process_dirty_turns(db)
    assert processed == 2
    assert await conversation.dirty_turns(db, 10) == []


# --- watcher marks files dirty; idle worker embeds them ----------------------

async def test_process_dirty_files_embeds(tmp_path, db, monkeypatch):
    monkeypatch.setenv("JARVIS_VAULT_PATH", str(tmp_path / "vault"))
    vault = tmp_path / "vault" / "learnings"
    vault.mkdir(parents=True)
    note = vault / "docker.md"
    note.write_text("## Docker\nsetup notes", encoding="utf-8")

    from memory import sync as sync_mod

    importlib.reload(sync_mod)
    from memory import jobs as jobs_mod

    importlib.reload(jobs_mod)

    monkeypatch.setattr(idle, "_last_activity", 0.0)  # force idle
    jobs_mod.set_budget(max_parallel_jobs=2, embedding_budget_per_day=500, max_background_cpu_percent=100)
    jobs_mod._embeds_today = 0

    embedded: list[str] = []

    async def _fake_upsert(path, text):
        embedded.append(path)
        return 1

    monkeypatch.setattr(jobs_mod.semantic, "upsert_file", _fake_upsert)
    monkeypatch.setattr(jobs_mod.semantic, "file_hash", lambda t: "sha256:x")

    await sync_mod.mark_files_dirty(db, ["learnings/docker.md"])
    assert len(await sync_mod.dirty_files(db, 10)) == 1

    processed = await jobs_mod.process_dirty_files(db)
    assert processed == 1
    assert embedded == ["learnings/docker.md"]
    # Flag cleared after a successful embed.
    assert await sync_mod.dirty_files(db, 10) == []


async def test_process_dirty_files_drops_deleted(tmp_path, db, monkeypatch):
    monkeypatch.setenv("JARVIS_VAULT_PATH", str(tmp_path / "vault"))
    (tmp_path / "vault" / "learnings").mkdir(parents=True)

    from memory import sync as sync_mod

    importlib.reload(sync_mod)
    from memory import jobs as jobs_mod

    importlib.reload(jobs_mod)

    monkeypatch.setattr(idle, "_last_activity", 0.0)
    jobs_mod.set_budget(max_background_cpu_percent=100)
    jobs_mod._embeds_today = 0

    deleted: list[str] = []
    monkeypatch.setattr(jobs_mod.semantic, "delete_file", lambda p: deleted.append(p))

    # Mark a path that does not exist on disk -> tombstoned, should drop from Chroma.
    await sync_mod.mark_files_dirty(db, ["learnings/gone.md"])
    processed = await jobs_mod.process_dirty_files(db)
    assert processed == 1
    assert deleted == ["learnings/gone.md"]
    assert await sync_mod.dirty_files(db, 10) == []
