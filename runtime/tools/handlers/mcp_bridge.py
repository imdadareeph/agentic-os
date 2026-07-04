"""MCP client bridge (TOOLS.md §13.3, CONVERSATION_AGENTS.md MCP Agent).

Normalizes tools exposed by external MCP servers into the JARVIS tool registry.
Every MCP tool is registered as ``mcp.{server}.{tool}`` with ``permission="ask"``
(external/untrusted — no exceptions) and ``category="mcp"``.

Transport: a minimal hand-rolled JSON-RPC 2.0 over stdio client (MCP stdio
transport = newline-delimited JSON: ``initialize`` -> ``tools/list`` ->
``tools/call``). We hand-roll rather than depend on the ``mcp`` SDK so this layer
is unit-testable against a fake client with zero real subprocesses, and so a
missing SDK never breaks the runtime.

Connection lifetime: one live subprocess/session per HEALTHY server is kept for
the process lifetime (established during discovery, reused by every tool call).
Tradeoff vs. reconnect-per-call: a persistent session avoids paying spawn +
``initialize`` latency on every call (MCP servers are slow to boot), at the cost
of holding a subprocess open. ``shutdown_all()`` (called from the app lifespan)
terminates them so no zombies leak. A dropped connection surfaces as a per-call
error; the next ``refresh_mcp_tools()`` re-probes and reconnects.

Failure policy: NEVER raise out of discovery/registration. An unreachable or
crashing server simply reports ``healthy=False`` with no tools. ``env`` values
(may hold tokens) are never logged or placed in tool schemas.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Awaitable, Callable

from tools import mcp_config
from tools.schemas import ToolDefinition

_PROBE_TIMEOUT_S = 5.0
_CALL_TIMEOUT_S = 15.0
_CLOSE_TIMEOUT_S = 3.0

# Live sessions for healthy servers, keyed by server name.
_CONNECTIONS: dict[str, "StdioMCPClient"] = {}
# Health snapshot from the most recent discovery pass (server name -> healthy).
_LAST_HEALTH: dict[str, bool] = {}


class StdioMCPClient:
    """Minimal JSON-RPC 2.0 over stdio MCP client.

    stderr is discarded (may echo secrets/verbose logs). Requests are serialized
    by a lock so interleaved server notifications can't corrupt id matching.
    """

    def __init__(self, name: str, command: str, args: list[str], env: dict[str, str]):
        self._name = name
        self._command = command
        self._args = args
        self._env = env
        self._proc: asyncio.subprocess.Process | None = None
        self._id = 0
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        # Child inherits our env plus the server's env block (tokens live here).
        child_env = {**os.environ, **self._env}
        self._proc = await asyncio.create_subprocess_exec(
            self._command,
            *self._args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env=child_env,
        )
        await self._request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "jarvis", "version": "0.1.0"},
            },
        )
        await self._notify("notifications/initialized", {})

    async def list_tools(self) -> list[dict]:
        result = await self._request("tools/list", {})
        tools = result.get("tools", []) if isinstance(result, dict) else []
        normalized: list[dict] = []
        for t in tools:
            if not isinstance(t, dict) or not t.get("name"):
                continue
            normalized.append(
                {
                    "name": str(t["name"]),
                    "description": str(t.get("description", "") or ""),
                    "input_schema": t.get("inputSchema")
                    or {"type": "object", "properties": {}},
                }
            )
        return normalized

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        return await self._request(
            "tools/call", {"name": name, "arguments": arguments or {}}
        )

    async def _request(self, method: str, params: dict[str, Any]) -> Any:
        if self._proc is None or self._proc.stdin is None or self._proc.stdout is None:
            raise RuntimeError("MCP session not started")
        async with self._lock:
            self._id += 1
            rid = self._id
            await self._write({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
            while True:
                msg = await self._read()
                if msg is None:
                    raise RuntimeError("MCP connection closed")
                if msg.get("id") == rid:
                    if "error" in msg:
                        err = msg["error"]
                        detail = err.get("message") if isinstance(err, dict) else str(err)
                        raise RuntimeError(f"MCP error: {detail}")
                    return msg.get("result", {})
                # Ignore notifications / responses to other ids.

    async def _notify(self, method: str, params: dict[str, Any]) -> None:
        await self._write({"jsonrpc": "2.0", "method": method, "params": params})

    async def _write(self, msg: dict[str, Any]) -> None:
        assert self._proc is not None and self._proc.stdin is not None
        self._proc.stdin.write((json.dumps(msg) + "\n").encode())
        await self._proc.stdin.drain()

    async def _read(self) -> dict[str, Any] | None:
        assert self._proc is not None and self._proc.stdout is not None
        while True:
            line = await self._proc.stdout.readline()
            if not line:
                return None
            text = line.strip()
            if not text:
                continue
            try:
                return json.loads(text)
            except (json.JSONDecodeError, ValueError):
                continue  # Skip non-JSON banner lines some servers emit.

    async def close(self) -> None:
        proc, self._proc = self._proc, None
        if proc is None or proc.returncode is not None:
            return
        try:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=_CLOSE_TIMEOUT_S)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
        except ProcessLookupError:
            pass


async def _connect_client(server: dict) -> "StdioMCPClient":
    """Spawn + initialize a session. Seam for tests to inject a fake client."""
    client = StdioMCPClient(
        server["name"], server["command"], server.get("args", []), server.get("env", {})
    )
    await client.start()
    return client


async def discover_servers() -> list[dict]:
    """Probe every configured server; never raise.

    Returns [{name, healthy, tools: [{name, description, input_schema}]}]. Live
    sessions for healthy servers are stored in ``_CONNECTIONS`` for reuse by tool
    calls; any prior sessions are closed first so re-discovery starts clean.
    """
    await shutdown_all()
    results: list[dict] = []
    for server in mcp_config.load_servers():
        name = server["name"]
        entry: dict[str, Any] = {"name": name, "healthy": False, "tools": []}
        client: StdioMCPClient | None = None
        try:
            client = await asyncio.wait_for(_connect_client(server), timeout=_PROBE_TIMEOUT_S)
            tools = await asyncio.wait_for(client.list_tools(), timeout=_PROBE_TIMEOUT_S)
            entry["healthy"] = True
            entry["tools"] = tools
            _CONNECTIONS[name] = client
        except Exception:
            if client is not None:
                try:
                    await client.close()
                except Exception:
                    pass
        results.append(entry)

    _LAST_HEALTH.clear()
    _LAST_HEALTH.update({r["name"]: r["healthy"] for r in results})
    return results


def _make_handler(server_name: str, tool_name: str) -> Callable[..., Awaitable[dict]]:
    async def handler(args: dict[str, Any], ctx: Any) -> dict[str, Any]:
        client = _CONNECTIONS.get(server_name)
        if client is None:
            return {"ok": False, "error": f"MCP server '{server_name}' not connected"}
        try:
            result = await asyncio.wait_for(
                client.call_tool(tool_name, args), timeout=_CALL_TIMEOUT_S
            )
            return {"ok": True, "result": result}
        except asyncio.TimeoutError:
            return {"ok": False, "error": f"MCP tool '{tool_name}' timed out"}
        except Exception as err:
            return {"ok": False, "error": str(err)}

    return handler


async def register_mcp_tools(register_fn: Callable[[ToolDefinition], None]) -> int:
    """Discover servers and register each healthy server's tools. Returns count."""
    count = 0
    for server in await discover_servers():
        if not server["healthy"]:
            continue
        sname = server["name"]
        for tool in server["tools"]:
            tname = tool["name"]
            register_fn(
                ToolDefinition(
                    name=f"mcp.{sname}.{tname}",
                    title=f"{sname}: {tname}",
                    description=tool.get("description") or f"MCP tool '{tname}' from '{sname}'.",
                    category="mcp",
                    parameters=tool.get("input_schema")
                    or {"type": "object", "properties": {}},
                    permission="ask",
                    latency_class="slow",
                    handler=_make_handler(sname, tname),
                    enabled=True,
                    source=f"mcp:{sname}",
                )
            )
            count += 1
    return count


def mcp_health() -> dict[str, bool]:
    """Server -> healthy map from the last discovery pass (for /api/tools/health)."""
    return dict(_LAST_HEALTH)


async def shutdown_all() -> None:
    """Terminate all live MCP sessions. Idempotent; never raises."""
    clients = list(_CONNECTIONS.values())
    _CONNECTIONS.clear()
    for client in clients:
        try:
            await client.close()
        except Exception:
            pass
