"""MCP server config loader (TOOLS.md §13.3).

Reads external MCP-server definitions from ``~/jarvis/mcp_servers.json``. This
file is NEVER committed to the repo — it may hold API tokens in each server's
``env`` block. Missing/malformed file degrades to an empty list (no error).

Format::

    { "servers": [
        {"name": "github", "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-github"], "env": {}}
    ] }

``env`` values are secrets: never logged, never surfaced in tool schemas.
"""

from __future__ import annotations

import json
from pathlib import Path

# Module-level so tests can point it at a temp file via monkeypatch.
_CONFIG_PATH = Path.home() / "jarvis" / "mcp_servers.json"


def config_path() -> Path:
    return _CONFIG_PATH


def load_servers() -> list[dict]:
    """Return validated server definitions, or [] if the file is absent/invalid.

    Never raises. Each entry: {name, command, args: list[str], env: dict[str,str]}.
    """
    try:
        raw = config_path().read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return []
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return []
    if not isinstance(data, dict):
        return []
    servers = data.get("servers")
    if not isinstance(servers, list):
        return []

    result: list[dict] = []
    for entry in servers:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        command = entry.get("command")
        if not name or not command:
            continue
        raw_args = entry.get("args")
        args = [str(a) for a in raw_args] if isinstance(raw_args, list) else []
        raw_env = entry.get("env")
        env = (
            {str(k): str(v) for k, v in raw_env.items()}
            if isinstance(raw_env, dict)
            else {}
        )
        result.append(
            {"name": str(name), "command": str(command), "args": args, "env": env}
        )
    return result
