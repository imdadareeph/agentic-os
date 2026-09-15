"""agent.research.run — composite multi-step research flow (Phase T4).

Search the web, then persist a durable vault note under agents/research/ —
one approval covers the whole flow. Internal steps call handlers directly
rather than going back through executor.execute, so the user isn't asked to
approve the search AND the write AND the composite tool separately for what
is, from their perspective, one action ("research X for me").
"""

from __future__ import annotations

from typing import Any

from memory import episodic
from tools.handlers import browser
from tools.schemas import ToolContext


async def run(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    query = str(args.get("query", "")).strip()
    if not query:
        return {"ok": False, "error": "query is required"}

    search_result = await browser.search({"query": query, "top_k": 5}, ctx)
    if not search_result.get("ok"):
        return {"ok": False, "error": search_result.get("error", "search failed")}

    results = search_result.get("results", [])
    body_lines = [f"## Research: {query}", ""]
    for r in results:
        body_lines.append(f"- [{r['title']}]({r['url']}) — {r['snippet']}")
    body = "\n".join(body_lines) if results else "No results found."

    note = await episodic.write_note(
        title=f"Research: {query}",
        body=body,
        agent_id="research",
        session_id=ctx.session_id or "",
        tags=["research"],
        sources=[r["url"] for r in results],
    )

    return {
        "ok": True,
        "query": query,
        "resultCount": len(results),
        "notePath": note.get("path"),
        "written": note.get("written", False),
    }
