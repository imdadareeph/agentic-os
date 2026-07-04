"""Embeddings via the local Ollama instance (Phase M2).

The Python runtime talks to Ollama directly at :11434 — the `/ollama` Vite
proxy exists only for the browser (MEMORY_IMPLEMENTATION_PLAN §3.1).
"""

from __future__ import annotations

import os

import httpx

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
EMBED_MODEL = os.environ.get("JARVIS_EMBED_MODEL", "nomic-embed-text")
# Keep the embed model resident so warm calls stay ~80ms (< the 300ms retrieval
# budget). Without this Ollama unloads after ~5min idle and the next embed pays
# an ~850ms cold reload, blowing the timeout.
KEEP_ALIVE = os.environ.get("JARVIS_EMBED_KEEP_ALIVE", "30m")


async def embed(text: str, timeout: float = 10.0) -> list[float]:
    """Return an embedding vector for `text`. Raises on failure."""
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": text, "keep_alive": KEEP_ALIVE},
        )
        res.raise_for_status()
        vec = res.json().get("embedding")
        if not vec:
            raise ValueError("Ollama returned an empty embedding")
        return vec


async def warmup() -> None:
    """Load the embed model into memory on startup so first retrieval is warm."""
    try:
        await embed("warmup", timeout=30.0)
    except Exception:
        pass


async def embed_available() -> bool:
    """Cheap health probe — is Ollama reachable and the embed model usable?"""
    try:
        await embed("ping", timeout=3.0)
        return True
    except Exception:
        return False
