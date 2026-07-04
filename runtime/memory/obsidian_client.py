"""Obsidian Local REST API — health check only (see obsidian_config.py docstring).

The plugin uses a self-signed cert on 127.0.0.1, so TLS verification is
intentionally off for this local-only loopback call. Never raises; a closed
Obsidian app or a missing/expired key just means "not connected".
"""

from __future__ import annotations

import httpx

from memory import obsidian_config

_TIMEOUT_S = 3.0


async def check_health() -> bool | None:
    """True if the Obsidian Local REST API answers with this key.

    Returns None (not False) when no key is configured yet, so the UI can
    distinguish "not set up" from "set up but unreachable".
    """
    cfg = obsidian_config.load()
    if not cfg["apiKey"]:
        return None
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S, verify=False) as client:
            res = await client.get(
                cfg["baseUrl"],
                headers={"Authorization": f"Bearer {cfg['apiKey']}"},
            )
            return res.status_code < 500
    except Exception:
        return False
