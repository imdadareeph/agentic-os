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


async def _docker(*cmd: str) -> dict[str, Any]:
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", *cmd,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        out, err = await asyncio.wait_for(proc.communicate(), timeout=60.0)
    except FileNotFoundError:
        return {"ok": False, "error": "Docker CLI not installed"}
    except asyncio.TimeoutError:
        return {"ok": False, "error": "docker command timed out"}
    if (proc.returncode or 0) != 0:
        return {"ok": False, "error": err.decode(errors="replace").strip() or "docker command failed"}
    return {"ok": True, "output": out.decode(errors="replace").strip()}


async def run(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    """docker run (Phase T2, approval-gated, slow). image required."""
    image = str(args.get("image", "")).strip()
    if not image:
        return {"ok": False, "error": "image required"}
    extra = args.get("args", [])
    cmd = ["run", "-d", image, *([str(a) for a in extra] if isinstance(extra, list) else [])]
    return await _docker(*cmd)


async def stop(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    """docker stop (Phase T2, approval-gated)."""
    name = str(args.get("name", "")).strip()
    if not name:
        return {"ok": False, "error": "container name required"}
    return await _docker("stop", name)
