"""Episodic memory — JARVIS writes durable notes to the Obsidian vault (Phase M3).

Rules (memory.md §6.2):
- Write only under `agents/{agent_id}/` by default. Never touch user-authored files.
- Never overwrite; create new dated files (a `jarvis_id` in frontmatter dedups re-embeds).
- Every new note is embedded immediately so semantic search sees it within one write.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from memory import semantic
from memory.sync import VAULT_PATH


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return (s or "note")[:60]


def _unique_path(agent_id: str, slug: str) -> Path:
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    base = VAULT_PATH / "agents" / agent_id
    base.mkdir(parents=True, exist_ok=True)
    candidate = base / f"{slug}-{date}.md"
    n = 2
    # Never overwrite: if the dated file exists, suffix a counter.
    while candidate.exists():
        candidate = base / f"{slug}-{date}-{n}.md"
        n += 1
    return candidate


def _frontmatter(jarvis_id: str, agent_id: str, session_id: str, tags: list[str], sources: list[str]) -> str:
    tag_list = ", ".join(["jarvis", *tags])
    src_list = ", ".join(f'"{s}"' for s in sources)
    return (
        "---\n"
        f'jarvis_id: "{jarvis_id}"\n'
        f"agent: {agent_id}\n"
        f'session_id: "{session_id}"\n'
        f"created_at: {_now_iso()}\n"
        f"tags: [{tag_list}]\n"
        f"sources: [{src_list}]\n"
        "---\n"
    )


async def write_note(
    title: str,
    body: str,
    agent_id: str = "jarvis",
    session_id: str = "",
    tags: list[str] | None = None,
    sources: list[str] | None = None,
) -> dict:
    """Create a dated episodic note under agents/{agent_id}/ and embed it."""
    if not VAULT_PATH.is_dir():
        return {"written": False, "reason": "vault not ready"}

    jarvis_id = str(uuid.uuid4())
    slug = _slugify(title)
    path = _unique_path(agent_id, slug)
    content = (
        _frontmatter(jarvis_id, agent_id, session_id, tags or [], sources or [])
        + f"# {title}\n\n{body.strip()}\n"
    )
    path.write_text(content, encoding="utf-8")

    rel = str(path.relative_to(VAULT_PATH))
    chunks = 0
    try:
        chunks = await semantic.upsert_file(rel, content)
    except Exception:
        # Note is on disk; the watcher/next reconcile will embed it later.
        pass

    return {"written": True, "path": rel, "jarvis_id": jarvis_id, "chunks": chunks}
