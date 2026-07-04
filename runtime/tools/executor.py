"""Tool Executor — validates args, gates on permission, calls the handler, logs
the run (TOOLS.md §11). T2 adds posture-aware permission + approval creation."""

from __future__ import annotations

import json
import time
from typing import Any

from memory import procedural
from tools import approvals, permissions, registry
from tools.handlers import filesystem, git
from tools.schemas import ToolContext, ToolResult


async def _preview(tool_name: str, args: dict[str, Any]) -> str:
    """Human-readable preview shown in the approval dialog."""
    if tool_name == "git.commit":
        diff = await git.staged_diff()
        return f"commit -m {args.get('message', '')!r}\n{diff}"
    if tool_name == "filesystem.write":
        return filesystem.preview_write(args)
    if tool_name == "terminal.run":
        return f"$ {args.get('command', '')}"
    if tool_name == "filesystem.delete":
        return f"delete {args.get('path', '')}"
    if tool_name == "docker.run":
        return f"docker run {args.get('image', '')}"
    if tool_name == "docker.stop":
        return f"docker stop {args.get('name', '')}"
    return json.dumps(args)[:280]


async def execute(
    tool_name: str,
    args: dict[str, Any],
    ctx: ToolContext,
    posture: str = "balanced",
    force: bool = False,
) -> ToolResult:
    tool = registry.get_tool(tool_name)
    if tool is None or not tool.enabled:
        return ToolResult(ok=False, error=f"Unknown tool: {tool_name}")

    if not force:
        level = permissions.check(tool, args, posture)
        if level == "deny":
            return ToolResult(ok=False, error=f"{tool_name} is denied by policy")
        if level == "ask":
            preview = await _preview(tool_name, args)
            p = approvals.create(tool_name, args, ctx.session_id, ctx.agent_id, preview)
            return ToolResult(
                ok=False,
                needs_approval=True,
                approval_id=p.approval_id,
                preview=preview,
                tool_name=tool_name,
            )

    start = time.monotonic()
    try:
        data = await tool.handler(args, ctx)
        duration_ms = int((time.monotonic() - start) * 1000)
        success = not (isinstance(data, dict) and data.get("error"))
        await procedural.record_tool_run(
            ctx.db,
            tool_name=tool_name,
            success=success,
            session_id=ctx.session_id,
            agent_id=ctx.agent_id,
            input_json=json.dumps(args),
            output_json=json.dumps(data),
            duration_ms=duration_ms,
        )
        if not success:
            return ToolResult(ok=False, error=str(data.get("error")), data=data)
        return ToolResult(ok=True, data=data)
    except Exception as err:
        duration_ms = int((time.monotonic() - start) * 1000)
        await procedural.record_tool_run(
            ctx.db,
            tool_name=tool_name,
            success=False,
            session_id=ctx.session_id,
            agent_id=ctx.agent_id,
            input_json=json.dumps(args),
            output_json=json.dumps({"error": str(err)}),
            duration_ms=duration_ms,
        )
        return ToolResult(ok=False, error=str(err))
