"""Obsidian Local REST API config — health-check integration only.

Reads/writes ~/jarvis/obsidian.json (never repo-tracked, never logged). This
is a *health signal* for the vault-integration UI, not the write path —
episodic writes stay direct filesystem (memory/episodic.py) so they work
even when Obsidian itself isn't running. Same config-file convention as
tools/mcp_config.py.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import TypedDict

_DEFAULT_BASE_URL = "https://127.0.0.1:27124"


class ObsidianConfig(TypedDict):
    baseUrl: str
    apiKey: str


def config_path() -> Path:
    """Read the env var per call (not at import time) so tests can override it."""
    return Path(
        os.environ.get("JARVIS_OBSIDIAN_CONFIG", str(Path.home() / "jarvis" / "obsidian.json"))
    ).expanduser()


def load() -> ObsidianConfig:
    path = config_path()
    if not path.exists():
        return {"baseUrl": _DEFAULT_BASE_URL, "apiKey": ""}
    try:
        raw = json.loads(path.read_text())
    except Exception:
        return {"baseUrl": _DEFAULT_BASE_URL, "apiKey": ""}
    return {
        "baseUrl": str(raw.get("baseUrl") or _DEFAULT_BASE_URL),
        "apiKey": str(raw.get("apiKey") or ""),
    }


def save(base_url: str, api_key: str) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"baseUrl": base_url or _DEFAULT_BASE_URL, "apiKey": api_key}, indent=2)
    )
    try:
        os.chmod(path, 0o600)  # contains a bearer token — owner read/write only
    except OSError:
        pass  # best-effort; not fatal on filesystems without POSIX perms


def is_configured() -> bool:
    return bool(load()["apiKey"])
