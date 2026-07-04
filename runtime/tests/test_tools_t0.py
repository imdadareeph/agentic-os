"""Tool loop skeleton — hermetic (temp DB, no network) (Phase T0)."""

from __future__ import annotations

import pytest

from memory import conversation, sync
from tools import executor, registry, router
from tools.loop import run_loop
from tools.schemas import ToolContext


@pytest.fixture
async def db(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_DB_PATH", str(tmp_path / "memory.db"))
    conn = await conversation.connect()
    await sync.ensure_migrations(conn)
    yield conn
    await conn.close()


def test_registry_loads_t0_catalog():
    catalog = registry.get_catalog()
    names = {t.name for t in catalog}
    # T0 core tools are always present (T1+ adds more on top).
    assert {
        "vitals.fetch",
        "memory.search",
        "memory.retrieve",
        "system.status",
        "time.now",
    } <= names
    assert registry.tool_count() >= 5
    # T0 core tools specifically are allow + fast (later phases add ask/slow tools).
    t0 = {"vitals.fetch", "memory.search", "memory.retrieve", "system.status", "time.now"}
    core = [t for t in catalog if t.name in t0]
    assert all(t.permission == "allow" and t.latency_class == "fast" for t in core)


def test_router_skips_greeting():
    result = router.plan("hello", registry.get_catalog())
    assert result == {"useTools": False, "candidates": [], "intent": "chat"}


def test_router_skips_plain_chat():
    result = router.plan("what a nice day today", registry.get_catalog())
    assert result["useTools"] is False


def test_router_matches_vitals_intent():
    result = router.plan("pull my YouTube metrics", registry.get_catalog())
    assert result["useTools"] is True
    assert "vitals.fetch" in result["candidates"]


async def test_vitals_handler_mock(db, monkeypatch):
    async def fake_fetch(args, ctx):
        return {"updatedAt": "now", "vitals": [], "liveCount": 0}

    tool = registry.get_tool("vitals.fetch")
    monkeypatch.setattr(tool, "handler", fake_fetch)

    ctx = ToolContext(db=db, session_id=None, agent_id="jarvis")
    result = await executor.execute("vitals.fetch", {}, ctx)
    assert result.ok is True
    assert result.data["liveCount"] == 0

    from memory import procedural

    runs = await procedural.recent_tool_runs(db, tool_name="vitals.fetch")
    assert len(runs) == 1
    assert runs[0]["success"] is True


async def test_time_now_handler(db):
    ctx = ToolContext(db=db, session_id=None, agent_id="jarvis")
    result = await executor.execute("time.now", {}, ctx)
    assert result.ok is True
    assert "iso" in result.data


async def test_executor_unknown_tool(db):
    ctx = ToolContext(db=db, session_id=None, agent_id="jarvis")
    result = await executor.execute("nope.tool", {}, ctx)
    assert result.ok is False
    assert "Unknown tool" in result.error


async def test_loop_degrades_without_api_key(db):
    ctx = ToolContext(db=db, session_id=None, agent_id="jarvis")
    result = await run_loop(
        ctx=ctx,
        user_message="pull my metrics",
        history=[],
        tool_names=["vitals.fetch"],
        system_prompt="",
        api_key=None,
        model=None,
    )
    assert result["degraded"] is True
    assert result["toolRuns"] == []


async def test_loop_respects_max_turns_cap(db, monkeypatch):
    """A model that always calls a tool must stop at max_turns, never loop forever."""

    async def fake_fetch(args, ctx):
        return {"ok": True}

    tool = registry.get_tool("vitals.fetch")
    monkeypatch.setattr(tool, "handler", fake_fetch)

    call_count = 0

    async def fake_anthropic_call(**kwargs):
        nonlocal call_count
        call_count += 1
        return {
            "content": [
                {"type": "tool_use", "id": f"call_{call_count}", "name": "vitals.fetch", "input": {}}
            ]
        }

    import tools.loop as loop_module

    monkeypatch.setattr(loop_module, "_call_anthropic", fake_anthropic_call)

    ctx = ToolContext(db=db, session_id=None, agent_id="jarvis")
    result = await run_loop(
        ctx=ctx,
        user_message="pull my metrics",
        history=[],
        tool_names=["vitals.fetch"],
        system_prompt="",
        api_key="fake-key",
        model="claude-sonnet-4-20250514",
        max_turns=3,
    )
    assert call_count == 3
    assert result["turns"] == 3
    assert len(result["toolRuns"]) == 3
