"""Supervised tool loop (TOOLS.md §6.2, §14) — LLM proposes, runtime executes.

Two provider backends: Anthropic native `tools` param (best schema adherence)
and Ollama's OpenAI-style `tools` param (local, no API key). Providers without
tool support degrade to text-only by returning `degraded=True`; the caller
(jarvis.ts `thinkWithTools`) falls back to the plain `think()` path.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

from tools import executor, registry
from tools.schemas import ToolContext

ANTHROPIC_VERSION = "2023-06-01"
ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com"
# Same env var + default as memory/embedder.py — the runtime always talks to
# Ollama directly, never through the browser's `/ollama` Vite proxy.
OLLAMA_DEFAULT_BASE_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
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


def _parse_anthropic(response: dict[str, Any]) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    """Returns (text, tool_calls, raw_content) — raw_content re-sent verbatim as the assistant turn."""
    content = response.get("content", [])
    tool_use_blocks = [b for b in content if b.get("type") == "tool_use"]
    text = "".join(b.get("text", "") for b in content if b.get("type") == "text").strip()
    tool_calls = [
        {"id": b.get("id"), "name": b.get("name", ""), "args": b.get("input", {}) or {}}
        for b in tool_use_blocks
    ]
    return text, tool_calls, content


async def _call_ollama(
    *,
    model: str,
    base_url: str,
    system: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    temperature: float | None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model,
        "stream": False,
        "messages": ([{"role": "system", "content": system}] if system else []) + messages,
        # Same fix as memory/embedder.py's KEEP_ALIVE — Ollama's default 5-minute
        # keep_alive evicts multi-GB chat models between conversation turns,
        # forcing a slow cold reload on the next request.
        "keep_alive": "30m",
    }
    if tools:
        body["tools"] = tools
    if temperature is not None:
        body["options"] = {"temperature": temperature}

    async with httpx.AsyncClient(timeout=TURN_TIMEOUT_S) as client:
        res = await client.post(f"{base_url}/api/chat", json=body)
        if res.status_code == 400 and tools:
            # Typically "model does not support tools" — degrade to text-only
            # per TOOLS.md §16 (provider without tools → graceful fallback).
            body.pop("tools", None)
            res = await client.post(f"{base_url}/api/chat", json=body)
        if res.is_error:
            detail = ""
            try:
                detail = res.json().get("error", "")
            except ValueError:
                detail = res.text[:200]
            raise RuntimeError(f"Ollama {res.status_code}: {detail or 'request failed'}")
        return res.json()


def _parse_ollama(response: dict[str, Any]) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    message = response.get("message", {}) or {}
    text = (message.get("content") or "").strip()
    raw_calls = message.get("tool_calls") or []
    tool_calls: list[dict[str, Any]] = []
    for call in raw_calls:
        fn = call.get("function", {}) or {}
        args = fn.get("arguments", {})
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except (TypeError, ValueError):
                args = {}
        tool_calls.append({"id": None, "name": fn.get("name", ""), "args": args or {}})
    return text, tool_calls, message


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
    posture: str = "balanced",
    provider: str = "anthropic",
    procedural_enabled: bool = True,
) -> dict[str, Any]:
    """Runs the multi-turn tool loop. Never raises — degrades on any failure."""
    if provider not in ("anthropic", "ollama"):
        return {
            "reply": None, "toolRuns": [], "turns": 0,
            "degraded": True, "reason": f"tool loop unsupported for provider {provider!r}",
        }
    if provider == "anthropic" and not api_key:
        return {
            "reply": None, "toolRuns": [], "turns": 0,
            "degraded": True, "reason": "no tool-capable provider configured",
        }
    if not model:
        return {
            "reply": None, "toolRuns": [], "turns": 0,
            "degraded": True, "reason": "no model resolved for tool loop",
        }

    tools_defs = [registry.get_tool(n) for n in tool_names]
    tools_defs = [t for t in tools_defs if t is not None]
    tool_schemas = (
        [t.to_anthropic_schema() for t in tools_defs]
        if provider == "anthropic"
        else [t.to_openai_schema() for t in tools_defs]
    )

    messages: list[dict[str, Any]] = list(history) + [
        {"role": "user", "content": user_message}
    ]
    tool_runs: list[dict[str, Any]] = []
    resolved_base_url = base_url or (
        ANTHROPIC_DEFAULT_BASE_URL if provider == "anthropic" else OLLAMA_DEFAULT_BASE_URL
    )

    for turn in range(1, max_turns + 1):
        try:
            if provider == "anthropic":
                response = await _call_anthropic(
                    api_key=api_key or "",
                    model=model,
                    base_url=resolved_base_url,
                    system=system_prompt,
                    messages=messages,
                    tools=tool_schemas,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                text, calls, raw_assistant = _parse_anthropic(response)
            else:
                response = await _call_ollama(
                    model=model,
                    base_url=resolved_base_url,
                    system=system_prompt,
                    messages=messages,
                    tools=tool_schemas,
                    temperature=temperature,
                )
                text, calls, raw_assistant = _parse_ollama(response)
        except Exception as err:
            return {
                "reply": None,
                "toolRuns": tool_runs,
                "turns": turn,
                "degraded": True,
                "reason": f"provider call failed — {err}",
            }

        if not calls:
            return {"reply": text, "toolRuns": tool_runs, "turns": turn}

        if provider == "anthropic":
            # raw_assistant is the content-block list.
            messages.append({"role": "assistant", "content": raw_assistant})
        else:
            # raw_assistant is the full Ollama message ({role, content, tool_calls});
            # nesting it under "content" makes Ollama reject the request with a 400.
            messages.append(raw_assistant)
        tool_results: list[dict[str, Any]] = []
        approvals_needed: list[dict[str, Any]] = []
        for call in calls:
            name = call["name"]
            args = call["args"]
            result = await executor.execute(
                name, args, ctx, posture=posture, procedural_enabled=procedural_enabled
            )
            if result.needs_approval:
                approvals_needed.append(
                    {
                        "approvalId": result.approval_id,
                        "toolName": name,
                        "args": args,
                        "preview": result.preview,
                    }
                )
                continue
            tool_runs.append({"tool": name, "success": result.ok, "error": result.error})
            payload = json.dumps(result.data if result.ok else {"error": result.error})
            if provider == "anthropic":
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": call["id"],
                        "content": payload,
                        "is_error": not result.ok,
                    }
                )
            else:
                tool_results.append({"role": "tool", "content": payload})

        # Any tool needing approval pauses the loop — the frontend collects the
        # decision and re-drives via /api/tools/approve. Voice speaks the ack.
        if approvals_needed:
            return {
                "reply": "That needs your approval — check the dialog.",
                "toolRuns": tool_runs,
                "turns": turn,
                "approvalRequired": approvals_needed,
            }

        if provider == "anthropic":
            messages.append({"role": "user", "content": tool_results})
        else:
            messages.extend(tool_results)

    return {
        "reply": "I ran out of tool-use turns before finishing — please rephrase.",
        "toolRuns": tool_runs,
        "turns": max_turns,
    }
