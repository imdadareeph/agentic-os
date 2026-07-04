"""Read-only git tools (Phase T1, TOOLS.md §8) — subprocess in the repo dir."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

from tools.schemas import ToolContext

_REPO = Path(os.environ.get("JARVIS_REPO_DIR", str(Path.cwd()))).expanduser()
_TIMEOUT_S = 5.0


async def _git(*args: str) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        "git", "-C", str(_REPO), *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=_TIMEOUT_S)
    except asyncio.TimeoutError:
        proc.kill()
        return 124, "", "git timed out"
    return proc.returncode or 0, out.decode(errors="replace"), err.decode(errors="replace")


async def status(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    code, out, err = await _git("status", "--short", "--branch")
    if code != 0:
        return {"ok": False, "error": err.strip() or "git status failed"}
    return {"ok": True, "status": out.strip()}


async def log(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    n = int(args.get("limit", 10))
    n = max(1, min(50, n))
    code, out, err = await _git("log", f"-n{n}", "--oneline")
    if code != 0:
        return {"ok": False, "error": err.strip() or "git log failed"}
    return {"ok": True, "commits": out.strip().splitlines()}


async def commit(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    """Stage all changes and commit (Phase T2, approval-gated)."""
    message = str(args.get("message", "")).strip()
    if not message:
        return {"ok": False, "error": "commit message required"}
    add_code, _, add_err = await _git("add", "-A")
    if add_code != 0:
        return {"ok": False, "error": add_err.strip() or "git add failed"}
    code, out, err = await _git("commit", "-m", message)
    if code != 0:
        return {"ok": False, "error": err.strip() or out.strip() or "git commit failed"}
    return {"ok": True, "output": out.strip()}


async def staged_diff() -> str:
    """Preview for the approval dialog: what a commit would include."""
    _, out, _ = await _git("diff", "--staged", "--stat")
    if not out.strip():
        _, out, _ = await _git("diff", "--stat")  # nothing staged yet — show unstaged
    return out.strip()[:2000] or "(no changes detected)"
