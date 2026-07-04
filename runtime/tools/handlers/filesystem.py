"""Read-only filesystem tools (Phase T1, TOOLS.md §8) — allowlisted, no traversal escape."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from tools.schemas import ToolContext

# Default allowlist when the caller doesn't supply one: repo root + the JARVIS home.
_DEFAULT_ALLOWED = [
    Path.cwd(),
    Path(os.environ.get("JARVIS_HOME", str(Path.home() / "jarvis"))).expanduser(),
]
_MAX_READ_BYTES = 100_000


def _allowed_roots(ctx: ToolContext) -> list[Path]:
    roots = getattr(ctx, "allowed_paths", None)
    if roots:
        return [Path(r).expanduser().resolve() for r in roots]
    return [p.resolve() for p in _DEFAULT_ALLOWED]


def _resolve_within(path_str: str, ctx: ToolContext) -> Path:
    """Resolve `path_str` and confirm it sits under an allowed root. Raises ValueError otherwise."""
    target = Path(path_str).expanduser().resolve()
    for root in _allowed_roots(ctx):
        try:
            target.relative_to(root)
            return target
        except ValueError:
            continue
    raise ValueError(f"Path '{path_str}' is outside the allowed roots")


async def read(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    path = args.get("path", "")
    target = _resolve_within(path, ctx)
    if not target.is_file():
        return {"ok": False, "error": f"Not a file: {path}"}
    data = target.read_bytes()[:_MAX_READ_BYTES]
    truncated = target.stat().st_size > _MAX_READ_BYTES
    return {
        "ok": True,
        "path": str(target),
        "truncated": truncated,
        "content": data.decode("utf-8", errors="replace"),
    }


async def list_dir(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    path = args.get("path", ".")
    target = _resolve_within(path, ctx)
    if not target.is_dir():
        return {"ok": False, "error": f"Not a directory: {path}"}
    entries = []
    for child in sorted(target.iterdir()):
        entries.append({"name": child.name, "type": "dir" if child.is_dir() else "file"})
    return {"ok": True, "path": str(target), "entries": entries[:500]}
