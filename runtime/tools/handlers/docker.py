"""Read-only docker tools (Phase T1, TOOLS.md §8) — graceful when Docker is down."""

from __future__ import annotations

import asyncio
from typing import Any

from tools.schemas import ToolContext

_TIMEOUT_S = 5.0


async def ps(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "ps", "--format", "{{.Names}}\t{{.Image}}\t{{.Status}}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await asyncio.wait_for(proc.communicate(), timeout=_TIMEOUT_S)
    except FileNotFoundError:
        return {"ok": False, "error": "Docker CLI not installed"}
    except asyncio.TimeoutError:
        return {"ok": False, "error": "docker ps timed out"}
    if (proc.returncode or 0) != 0:
        return {"ok": False, "error": (err.decode(errors="replace").strip() or "Docker not running")}
    rows = []
    for line in out.decode(errors="replace").strip().splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            rows.append({"name": parts[0], "image": parts[1], "status": parts[2]})
    return {"ok": True, "containers": rows}
