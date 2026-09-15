"""Ollama tool-calling path — hermetic (mocked provider calls, temp DB).

Covers the gap fixed alongside this test: `run_loop` was Anthropic-only, so on
the project's default provider (Ollama) `thinkWithTools` always silently
degraded to plain chat — tools were never actually invoked, and the LLM would
hallucinate having done something it never did.
"""

from __future__ import annotations

import pytest

from memory import conversation, sync
from tools import registry, router
from tools.loop import run_loop
from tools.schemas import ToolContext


@pytest.fixture
async def db(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_DB_PATH", str(tmp_path / "memory.db"))
    conn = await conversation.connect()
    await sync.ensure_migrations(conn)
    yield conn
    await conn.close()


async def test_loop_degrades_for_unknown_provider(db):
    ctx = ToolContext(db=db, session_id=None, agent_id="jarvis")
    result = await run_loop(
        ctx=ctx, user_message="hi", history=[], tool_names=[], system_prompt="",
        api_key=None, model="llama3.1", provider="gemini",
    )
    assert result["degraded"] is True
    assert "gemini" in result["reason"]


async def test_loop_degrades_without_model(db):
    ctx = ToolContext(db=db, session_id=None, agent_id="jarvis")
    result = await run_loop(
        ctx=ctx, user_message="hi", history=[], tool_names=[], system_prompt="",
        api_key=None, model=None, provider="ollama",
    )
    assert result["degraded"] is True


async def test_loop_ollama_does_not_require_api_key(db, monkeypatch):
    """Unlike Anthropic, Ollama has no API key — the loop must not gate on it."""

    async def fake_ollama_call(**kwargs):
        return {"message": {"role": "assistant", "content": "all set", "tool_calls": []}}

    import tools.loop as loop_module

    monkeypatch.setattr(loop_module, "_call_ollama", fake_ollama_call)

    ctx = ToolContext(db=db, session_id=None, agent_id="jarvis")
    result = await run_loop(
        ctx=ctx, user_message="what time is it", history=[], tool_names=["time.now"],
        system_prompt="", api_key=None, model="llama3.1", provider="ollama",
    )
    assert result.get("degraded") is not True
    assert result["reply"] == "all set"


async def test_loop_ollama_executes_tool_call(db, monkeypatch):
    call_count = 0

    async def fake_ollama_call(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return {
                "message": {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [{"function": {"name": "time.now", "arguments": {}}}],
                }
            }
        return {"message": {"role": "assistant", "content": "It's now.", "tool_calls": []}}

    import tools.loop as loop_module

    monkeypatch.setattr(loop_module, "_call_ollama", fake_ollama_call)

    ctx = ToolContext(db=db, session_id=None, agent_id="jarvis")
    result = await run_loop(
        ctx=ctx, user_message="what time is it", history=[], tool_names=["time.now"],
        system_prompt="", api_key=None, model="llama3.1", provider="ollama",
    )
    assert call_count == 2
    assert result["reply"] == "It's now."
    assert result["toolRuns"] == [{"tool": "time.now", "success": True, "error": None}]


def test_router_matches_terminal_intent():
    result = router.plan("open the terminal and run a command", registry.get_catalog())
    assert result["useTools"] is True
    assert "terminal.run" in result["candidates"]
