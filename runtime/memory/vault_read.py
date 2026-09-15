"""Single-note vault reader for Memory Galaxy preview (Phase MV.2).

Reads one markdown file from ~/jarvis/vault on demand — never called from the
voice/conversation path.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiosqlite
import yaml

from memory.graph import WIKILINK_RE, _iter_markdown, _strip_frontmatter, _title
from memory import sync
from memory.sync import WATCHED_DIRS

MAX_BODY_BYTES = 512 * 1024


def resolve_vault_path(rel: str) -> Path | None:
    """Return absolute Path if rel is a safe watched-dir .md file, else None."""
    if not rel or not sync.vault_ready():
        return None
    rel = rel.strip().replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/") or not rel.endswith(".md"):
        return None
    top = rel.split("/", 1)[0]
    if top not in WATCHED_DIRS:
        return None
    try:
        vault_root = sync.VAULT_PATH.resolve()
        resolved = (vault_root / rel).resolve()
        if not resolved.is_relative_to(vault_root):
            return None
    except (OSError, ValueError):
        return None
    if not resolved.is_file():
        return None
    return resolved


def _parse_frontmatter(block: str) -> dict[str, Any]:
    if not block:
        return {}
    text = block
    if text.startswith("---"):
        text = text[3:]
    text = text.strip()
    if not text:
        return {}
    try:
        data = yaml.safe_load(text)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _build_path_index() -> dict[str, str]:
    """stem/title (lowercased) -> vault-relative path."""
    by_key: dict[str, str] = {}
    for path in _iter_markdown():
        rel = str(path.relative_to(sync.VAULT_PATH))
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        _, body = _strip_frontmatter(text)
        title = _title(rel, body)
        by_key[Path(rel).stem.lower()] = rel
        by_key[title.lower()] = rel
    return by_key


def _resolve_wikilink(label: str, by_key: dict[str, str]) -> str | None:
    key = label.strip().split("/")[-1].lower()
    return by_key.get(key)


def _outbound_links(body: str, by_key: dict[str, str]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    links: list[dict[str, Any]] = []
    for m in WIKILINK_RE.finditer(body):
        label = m.group(1).strip()
        if label in seen:
            continue
        seen.add(label)
        target = _resolve_wikilink(label, by_key)
        links.append(
            {
                "label": label,
                "path": target,
                "resolved": target is not None,
            }
        )
    return links


async def read_note(conn: aiosqlite.Connection | None, rel: str) -> dict[str, Any] | None:
    """Never raises. None = not found / invalid path."""
    resolved = resolve_vault_path(rel)
    if resolved is None:
        return None

    vault_rel = str(resolved.relative_to(sync.VAULT_PATH.resolve()))
    try:
        raw = resolved.read_text(encoding="utf-8")
    except Exception:
        return None

    truncated = False
    if len(raw.encode("utf-8")) > MAX_BODY_BYTES:
        raw = raw.encode("utf-8")[:MAX_BODY_BYTES].decode("utf-8", errors="ignore")
        truncated = True

    fm_block, body = _strip_frontmatter(raw)
    frontmatter = _parse_frontmatter(fm_block)
    title = _title(vault_rel, body)

    stat = resolved.stat()
    mtime_iso = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
    touched_at = mtime_iso
    embedded = False
    if conn is not None:
        try:
            cur = await conn.execute(
                "SELECT embedded_at FROM sync_files WHERE path = ? AND deleted = 0",
                (vault_rel,),
            )
            row = await cur.fetchone()
            if row:
                embedded = True
                if row["embedded_at"]:
                    touched_at = row["embedded_at"]
        except Exception:
            pass

    by_key = _build_path_index()
    return {
        "path": vault_rel,
        "title": title,
        "body": body,
        "frontmatter": frontmatter,
        "outboundLinks": _outbound_links(body, by_key),
        "touchedAt": touched_at,
        "embedded": embedded,
        "truncated": truncated,
    }
