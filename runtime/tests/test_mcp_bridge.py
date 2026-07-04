"""Phase T3 — MCP client bridge (hermetic; no real MCP server)."""

import json

import pytest

from tools import mcp_config, registry
from tools.handlers import mcp_bridge


class _FakeClient:
    """Stands in for StdioMCPClient — no subprocess, canned tools/list + tools/call."""

    def __init__(self, tools, call_result=None):
        self._tools = tools
        self._call_result = call_result or {"content": [{"type": "text", "text": "ok"}]}
        self.closed = False
        self.calls = []

    async def list_tools(self):
        return self._tools

    async def call_tool(self, name, arguments):
        self.calls.append((name, arguments))
        return self._call_result

    async def close(self):
        self.closed = True


@pytest.fixture(autouse=True)
async def _clean_state():
    """Reset bridge globals and drop any mcp:* registry entries around each test."""
    await mcp_bridge.shutdown_all()
    mcp_bridge._LAST_HEALTH.clear()
    _drop_mcp_from_registry()
    yield
    await mcp_bridge.shutdown_all()
    mcp_bridge._LAST_HEALTH.clear()
    _drop_mcp_from_registry()


def _drop_mcp_from_registry():
    for name in [n for n, t in registry._REGISTRY.items() if t.source.startswith("mcp:")]:
        registry._REGISTRY.pop(name, None)


def _write_config(tmp_path, servers):
    path = tmp_path / "mcp_servers.json"
    path.write_text(json.dumps({"servers": servers}), encoding="utf-8")
    return path


# --- discovery ---------------------------------------------------------------

async def test_discover_no_config_file(tmp_path, monkeypatch):
    monkeypatch.setattr(mcp_config, "_CONFIG_PATH", tmp_path / "absent.json")
    assert await mcp_bridge.discover_servers() == []


async def test_discover_unspawnable_command_is_unhealthy(tmp_path, monkeypatch):
    # A command that cannot spawn must degrade to healthy=False, never crash.
    monkeypatch.setattr(
        mcp_config,
        "_CONFIG_PATH",
        _write_config(tmp_path, [
            {"name": "broken", "command": "definitely-not-a-real-binary-xyz", "args": []}
        ]),
    )
    result = await mcp_bridge.discover_servers()
    assert result == [{"name": "broken", "healthy": False, "tools": []}]
    assert mcp_bridge.mcp_health() == {"broken": False}


async def test_discover_healthy_server(tmp_path, monkeypatch):
    monkeypatch.setattr(
        mcp_config,
        "_CONFIG_PATH",
        _write_config(tmp_path, [{"name": "fake", "command": "x", "args": []}]),
    )
    tools = [{"name": "echo", "description": "Echo", "input_schema": {"type": "object", "properties": {}}}]

    async def fake_connect(server):
        return _FakeClient(tools)

    monkeypatch.setattr(mcp_bridge, "_connect_client", fake_connect)
    result = await mcp_bridge.discover_servers()
    assert result[0]["healthy"] is True
    assert result[0]["tools"][0]["name"] == "echo"
    assert mcp_bridge.mcp_health() == {"fake": True}


# --- registration ------------------------------------------------------------

async def test_register_mcp_tools_adds_ask_mcp_tool(tmp_path, monkeypatch):
    monkeypatch.setattr(
        mcp_config,
        "_CONFIG_PATH",
        _write_config(tmp_path, [{"name": "fake", "command": "x"}]),
    )
    tools = [{"name": "echo", "description": "Echo", "input_schema": {"type": "object", "properties": {}}}]
    monkeypatch.setattr(mcp_bridge, "_connect_client", lambda s: _return(_FakeClient(tools)))

    registered: dict = {}
    count = await mcp_bridge.register_mcp_tools(lambda t: registered.__setitem__(t.name, t))
    assert count == 1
    tool = registered["mcp.fake.echo"]
    assert tool.category == "mcp"
    assert tool.permission == "ask"
    assert tool.latency_class == "slow"
    assert tool.source == "mcp:fake"


async def test_mcp_tool_handler_proxies_call(tmp_path, monkeypatch):
    monkeypatch.setattr(
        mcp_config,
        "_CONFIG_PATH",
        _write_config(tmp_path, [{"name": "fake", "command": "x"}]),
    )
    fake = _FakeClient(
        [{"name": "echo", "description": "", "input_schema": {"type": "object", "properties": {}}}],
        call_result={"content": [{"type": "text", "text": "hi"}]},
    )
    monkeypatch.setattr(mcp_bridge, "_connect_client", lambda s: _return(fake))
    await registry.refresh_mcp_tools()

    tool = registry.get_tool("mcp.fake.echo")
    out = await tool.handler({"msg": "yo"}, None)
    assert out["ok"] is True
    assert fake.calls == [("echo", {"msg": "yo"})]


# --- idempotent refresh ------------------------------------------------------

async def test_refresh_twice_no_duplicates(tmp_path, monkeypatch):
    monkeypatch.setattr(
        mcp_config,
        "_CONFIG_PATH",
        _write_config(tmp_path, [{"name": "fake", "command": "x"}]),
    )
    tools = [{"name": "echo", "description": "", "input_schema": {"type": "object", "properties": {}}}]
    monkeypatch.setattr(mcp_bridge, "_connect_client", lambda s: _return(_FakeClient(tools)))

    first = await registry.refresh_mcp_tools()
    second = await registry.refresh_mcp_tools()
    assert first == 1 and second == 1
    mcp_names = [n for n in registry._REGISTRY if n.startswith("mcp.")]
    assert mcp_names == ["mcp.fake.echo"]


async def test_shutdown_all_closes_sessions(tmp_path, monkeypatch):
    monkeypatch.setattr(
        mcp_config,
        "_CONFIG_PATH",
        _write_config(tmp_path, [{"name": "fake", "command": "x"}]),
    )
    fake = _FakeClient([{"name": "echo", "description": "", "input_schema": {}}])
    monkeypatch.setattr(mcp_bridge, "_connect_client", lambda s: _return(fake))
    await mcp_bridge.discover_servers()
    assert fake.closed is False
    await mcp_bridge.shutdown_all()
    assert fake.closed is True


# --- config loader edge cases ------------------------------------------------

def test_config_missing_file_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(mcp_config, "_CONFIG_PATH", tmp_path / "nope.json")
    assert mcp_config.load_servers() == []


def test_config_malformed_json_empty(tmp_path, monkeypatch):
    path = tmp_path / "mcp_servers.json"
    path.write_text("{ not json", encoding="utf-8")
    monkeypatch.setattr(mcp_config, "_CONFIG_PATH", path)
    assert mcp_config.load_servers() == []


def test_config_skips_entries_missing_name_or_command(tmp_path, monkeypatch):
    monkeypatch.setattr(
        mcp_config,
        "_CONFIG_PATH",
        _write_config(tmp_path, [
            {"name": "ok", "command": "npx", "args": ["-y", "srv"], "env": {"TOKEN": "secret"}},
            {"name": "no-command"},
            {"command": "no-name"},
        ]),
    )
    servers = mcp_config.load_servers()
    assert [s["name"] for s in servers] == ["ok"]
    assert servers[0]["args"] == ["-y", "srv"]


async def _return(value):
    return value
