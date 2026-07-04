"""Permission Agent — stub for T0 (TOOLS.md §8). All T0 tools are allow.

Full allow/ask/deny + approval flow ships in T2.
"""

from __future__ import annotations

from tools.schemas import PermissionLevel, ToolDefinition


def check(tool: ToolDefinition, args: dict) -> PermissionLevel:
    return tool.permission
