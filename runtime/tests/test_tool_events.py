"""Phase T3 — tool-execution event bus (events.py) + executor lifecycle emission.

Hermetic: exercises the in-process pub/sub directly and drives executor.execute()
with a fake tool, monkeypatching procedural.record_tool_run so no DB is needed.
"""

from __future__ import annotations

import asyncio

import pytest

from tools import events, executor
from tools.schemas import ToolContext, ToolDefinition


# --- pub/sub mechanics --------------------------------------------------------

@pytest.mark.asyncio
async def test_subscribe_receives_published_event():
    agen = events.subscribe()
    # Prime the subscriber so its queue is registered before we publish.
    task = asyncio.ensure_future(agen.__anext__())
    await asyncio.sleep(0)  # let subscribe() register its queue
    events.publish(events.make_event("TOOL_STARTED", "docker.ps"))
    got = await asyncio.wait_for(task, timeout=1.0)
    assert got["type"] == "TOOL_STARTED"
    assert got["tool"] == "docker.ps"
    await agen.aclose()


@pytest.mark.asyncio
async def test_fan_out_to_multiple_subscribers():
    a, b = events.subscribe(), events.subscribe()
    ta = asyncio.ensure_future(a.__anext__())
    tb = asyncio.ensure_future(b.__anext__())
    await asyncio.sleep(0)
    events.publish(events.make_event("TOOL_EXECUTED", "git.status"))
    ga = await asyncio.wait_for(ta, timeout=1.0)
    gb = await asyncio.wait_for(tb, timeout=1.0)
    assert ga["tool"] == gb["tool"] == "git.status"
    await a.aclose()
    await b.aclose()


def test_full_queue_drops_oldest_not_raises(monkeypatch):
    monkeypatch.setattr(events, "_QUEUE_MAXSIZE", 3)
    q: asyncio.Queue = asyncio.Queue(maxsize=3)
    monkeypatch.setattr(events, "_subscribers", [q])
    for i in range(5):
        events.publish(events.make_event("TOOL_STARTED", f"t{i}"))  # must not raise
    assert q.qsize() == 3
    drained = [q.get_nowait()["tool"] for _ in range(3)]
    assert drained == ["t2", "t3", "t4"]  # oldest (t0, t1) evicted


def test_publish_with_no_subscribers_is_noop():
    # No subscribers registered in a fresh call path — must not raise.
    events.publish(events.make_event("TOOL_FAILED", "x", error="boom"))


# --- executor lifecycle emission ---------------------------------------------

def _fake_tool(name, handler):
    return ToolDefinition(
        name=name,
        title=name,
        description="fake",
        category="system",
        parameters={"type": "object", "properties": {}},
        permission="allow",
        latency_class="fast",
        handler=handler,
    )


@pytest.mark.asyncio
async def test_execute_success_emits_started_then_executed(monkeypatch):
    async def ok_handler(args, ctx):
        return {"result": "fine"}

    captured: list[dict] = []
    monkeypatch.setattr(events, "publish", captured.append)
    monkeypatch.setattr(executor.registry, "get_tool", lambda n: _fake_tool(n, ok_handler))

    async def _noop(*a, **k):
        return "id"

    monkeypatch.setattr(executor.procedural, "record_tool_run", _noop)

    res = await executor.execute("fake.ok", {}, ToolContext(db=None), posture="trusted")
    assert res.ok is True
    assert [e["type"] for e in captured] == ["TOOL_STARTED", "TOOL_EXECUTED"]


@pytest.mark.asyncio
async def test_execute_handler_raises_emits_started_then_failed(monkeypatch):
    async def boom_handler(args, ctx):
        raise RuntimeError("kaboom")

    captured: list[dict] = []
    monkeypatch.setattr(events, "publish", captured.append)
    monkeypatch.setattr(executor.registry, "get_tool", lambda n: _fake_tool(n, boom_handler))

    async def _noop(*a, **k):
        return "id"

    monkeypatch.setattr(executor.procedural, "record_tool_run", _noop)

    res = await executor.execute("fake.boom", {}, ToolContext(db=None), posture="trusted")
    assert res.ok is False
    assert [e["type"] for e in captured] == ["TOOL_STARTED", "TOOL_FAILED"]
    assert captured[1]["error"] == "kaboom"


@pytest.mark.asyncio
async def test_execute_error_result_emits_started_then_failed(monkeypatch):
    async def err_handler(args, ctx):
        return {"error": "bad input"}

    captured: list[dict] = []
    monkeypatch.setattr(events, "publish", captured.append)
    monkeypatch.setattr(executor.registry, "get_tool", lambda n: _fake_tool(n, err_handler))

    async def _noop(*a, **k):
        return "id"

    monkeypatch.setattr(executor.procedural, "record_tool_run", _noop)

    res = await executor.execute("fake.err", {}, ToolContext(db=None), posture="trusted")
    assert res.ok is False
    assert [e["type"] for e in captured] == ["TOOL_STARTED", "TOOL_FAILED"]
    assert captured[1]["error"] == "bad input"
