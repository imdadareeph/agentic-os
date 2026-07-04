"""terminal.run (Phase T2) — approval-gated shell, with a hard destructive deny.

Defense-in-depth: permissions.check() already denies destructive commands, but
this handler re-checks at execution time so nothing runs a denied command even
if the gate is bypassed.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

from tools import permissions
from tools.schemas import ToolContext

_CWD = Path(os.environ.get("JARVIS_REPO_DIR", str(Path.cwd()))).expanduser()
_TIMEOUT_S = 30.0


async def run(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    command = str(args.get("command", "")).strip()
    if not command:
        return {"ok": False, "error": "empty command"}
    # Re-enforce the deny-list at execution time.
    if permissions.is_destructive_command(command):
        return {"ok": False, "error": "command blocked by safety policy"}
    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=str(_CWD),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await asyncio.wait_for(proc.communicate(), timeout=_TIMEOUT_S)
    except asyncio.TimeoutError:
        return {"ok": False, "error": f"command timed out after {_TIMEOUT_S}s"}
    return {
        "ok": (proc.returncode or 0) == 0,
        "exit_code": proc.returncode,
        "stdout": out.decode(errors="replace")[:20_000],
        "stderr": err.decode(errors="replace")[:5_000],
    }
