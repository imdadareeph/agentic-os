"""Composite skill handlers (Phase T4, TOOLS.md §10).

Each composes primitive tool handlers directly — NOT through executor.execute
— so running the skill as one unit doesn't re-trigger a nested permission
prompt or double procedural-log entry per inner step. The skill itself is
the thing that gets permission-checked and logged; its internals are plain
function calls.
"""

from __future__ import annotations

from typing import Any

from tools.handlers import memory_tools, vitals
from tools.schemas import ToolContext


async def plan_today(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    status = await memory_tools.system_status({}, ctx)
    recent = await memory_tools.search({"query": "today", "top_k": 3}, ctx)
    hits = recent.get("hits") or []

    lines = ["Plan for today:"]
    if not status.get("sqlite"):
        lines.append("- Memory runtime degraded — treat context below as partial.")
    if hits:
        lines.append("Recent relevant notes:")
        for hit in hits[:3]:
            lines.append(f"- {hit.get('path') or 'note'}")
    else:
        lines.append("- No standout recent notes carried over.")

    return {"summary": "\n".join(lines), "status": status, "notes": hits}


async def am_report(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    v = await vitals.fetch({}, ctx)
    status = await memory_tools.system_status({}, ctx)

    if v.get("error"):
        vitals_line = f"Vitals unavailable — {v['error']}"
    else:
        parts = [f"{item['label']}: {item['value']}" for item in v.get("vitals", [])]
        vitals_line = "; ".join(parts) if parts else "no live vitals"

    lines = [
        "Morning report:",
        vitals_line,
        f"Runtime: sqlite={status.get('sqlite')} chroma={status.get('chroma')} vault={status.get('vault')}",
    ]
    return {"summary": "\n".join(lines), "vitals": v, "status": status}
