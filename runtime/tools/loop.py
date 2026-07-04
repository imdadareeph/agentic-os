"""Supervised tool loop (TOOLS.md §6.2, §14) — LLM proposes, runtime executes.

Anthropic native `tools` param first (best schema adherence). Providers
without tool support degrade to text-only by returning `degraded=True`; the
caller (jarvis.ts `thinkWithTools`) falls back to the plain `think()` path.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from tools import executor, registry
from tools.schemas import ToolContext

ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_BASE_URL = "https://api.anthropic.com"
MAX_TURNS = 5
TURN_TIMEOUT_S = 30.0


async def _call_anthropic(
    *,
    api_key: str,
    model: str,
    base_url: str,
    system: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    max_tokens: int,
    temperature: float | None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if system:
        body["system"] = system
    if tools:
        body["tools"] = tools
    if temperature is not None:
        body["temperature"] = temperature

    async with httpx.AsyncClient(timeout=TURN_TIMEOUT_S) as client:
        res = await client.post(
            f"{base_url}/v1/messages",
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": ANTHROPIC_VERSION,
            },
            json=body,
        )
        res.raise_for_status()
        return res.json()


async def run_loop(
    *,
    ctx: ToolContext,
    user_message: str,
    history: list[dict[str, str]],
    tool_names: list[str],
    system_prompt: str,
    api_key: str | None,
    model: str | None,
    base_url: str | None = None,
    max_tokens: int = 1024,
    temperature: float | None = None,
    max_turns: int = MAX_TURNS,
) -> dict[str, Any]:
    """Runs the multi-turn tool loop. Never raises — degrades on any failure."""
    if not api_key or not model:
        return {
            "reply": None,
            "toolRuns": [],
            "turns": 0,
            "degraded": True,
            "reason": "no tool-capable provider configured",
        }

    tools_defs = [registry.get_tool(n) for n in tool_names]
    tool_schemas = [t.to_anthropic_schema() for t in tools_defs if t is not None]

    messages: list[dict[str, Any]] = list(history) + [
        {"role": "user", "content": user_message}
    ]
    tool_runs: list[dict[str, Any]] = []
    resolved_base_url = base_url or DEFAULT_BASE_URL

    for turn in range(1, max_turns + 1):
        try:
            response = await _call_anthropic(
                api_key=api_key,
                model=model,
                base_url=resolved_base_url,
                system=system_prompt,
                messages=messages,
                tools=tool_schemas,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        except Exception as err:
            return {
                "reply": None,
                "toolRuns": tool_runs,
                "turns": turn,
                "degraded": True,
                "reason": f"provider call failed — {err}",
            }

        content = response.get("content", [])
        tool_use_blocks = [b for b in content if b.get("type") == "tool_use"]

        if not tool_use_blocks:
            text = "".join(b.get("text", "") for b in content if b.get("type") == "text").strip()
            return {"reply": text, "toolRuns": tool_runs, "turns": turn}

        messages.append({"role": "assistant", "content": content})
        tool_results: list[dict[str, Any]] = []
        for block in tool_use_blocks:
            name = block.get("name", "")
            args = block.get("input", {}) or {}
            result = await executor.execute(name, args, ctx)
            tool_runs.append(
                {"tool": name, "success": result.ok, "error": result.error}
            )
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.get("id"),
                    "content": json.dumps(result.data if result.ok else {"error": result.error}),
                    "is_error": not result.ok,
                }
            )
        messages.append({"role": "user", "content": tool_results})

    return {
        "reply": "I ran out of tool-use turns before finishing — please rephrase.",
        "toolRuns": tool_runs,
        "turns": max_turns,
    }
