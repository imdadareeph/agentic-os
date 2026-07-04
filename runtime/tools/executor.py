"""Tool Executor — validates args, calls the handler, logs the run (TOOLS.md §11)."""

from __future__ import annotations

import json
import time
from typing import Any

from memory import procedural
from tools import permissions, registry
from tools.schemas import ToolContext, ToolResult


async def execute(tool_name: str, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    tool = registry.get_tool(tool_name)
    if tool is None or not tool.enabled:
        return ToolResult(ok=False, error=f"Unknown tool: {tool_name}")

    level = permissions.check(tool, args)
    if level == "deny":
        return ToolResult(ok=False, error=f"{tool_name} is denied by policy")
    if level == "ask":
        # T2 wires the approval pause; T0/T1 tools never reach this branch.
        return ToolResult(ok=False, error=f"{tool_name} requires approval (not yet implemented)")

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
