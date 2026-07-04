"""memory.search, memory.retrieve, system.status, time.now (TOOLS.md §11)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from memory import conversation, semantic, sync
from memory.context_builder import build_context_block
from tools.schemas import ToolContext


async def search(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    query = (args.get("query") or "").strip()
    if not query:
        return {"error": "query is required"}
    top_k = int(args.get("top_k", 3))
    try:
        hits = await semantic.query(query, top_k, 0.65)
    except Exception:
        hits = []
    return {"hits": hits}


async def retrieve(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    if not ctx.session_id:
        return {"error": "no active session"}
    limit = int(args.get("limit", 20))
    turns = await conversation.recent_turns(ctx.db, ctx.session_id, limit)
    return {"turns": turns, "contextBlock": build_context_block([])}


async def system_status(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    try:
        await ctx.db.execute("SELECT 1")
        sqlite_ok = True
    except Exception:
        sqlite_ok = False
    return {
        "sqlite": sqlite_ok,
        "chroma": semantic.available(),
        "vault": sync.vault_ready(),
        "sync": sync.sync_healthy(),
    }


async def time_now(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {"iso": now.isoformat(), "timezone": "UTC"}
