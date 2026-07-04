"""vitals.fetch — wraps the existing app vitals endpoint (TOOLS.md §11)."""

from __future__ import annotations

import os
from typing import Any

import httpx

from tools.schemas import ToolContext

# The React dev server (Vite) owns /api/vitals via vite-vitals-plugin.ts — not
# the Python runtime. We proxy to it rather than duplicating fetch-vitals.ts.
VITALS_URL = os.environ.get("JARVIS_VITALS_URL", "http://127.0.0.1:3000/api/vitals")


async def fetch(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(VITALS_URL)
            res.raise_for_status()
            return res.json()
    except Exception as err:
        return {"error": f"vitals unavailable — {err}"}
