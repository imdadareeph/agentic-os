"""Minimal Ollama chat helper for runtime-side summarization (Phase M4)."""

from __future__ import annotations

import os

import httpx

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
SUMMARY_MODEL = os.environ.get("JARVIS_SUMMARY_MODEL", "llama3.2:latest")


async def summarize(text: str, timeout: float = 30.0) -> str:
    """One-shot summary via Ollama. Falls back to a truncated excerpt on failure."""
    prompt = (
        "Summarize the following conversation in 2-3 sentences, preserving key "
        "facts, decisions, and named entities:\n\n" + text
    )
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={"model": SUMMARY_MODEL, "prompt": prompt, "stream": False},
            )
            res.raise_for_status()
            out = (res.json().get("response") or "").strip()
            return out or _fallback(text)
    except Exception:
        return _fallback(text)


def _fallback(text: str) -> str:
    return text[:500].strip() + ("…" if len(text) > 500 else "")
