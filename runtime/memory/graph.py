"""Vault graph builder for the Memory Galaxy view (Phase MV).

Walks the same watched dirs as memory/sync.py (agents/learnings/projects/wiki),
parses `[[wikilinks]]` and frontmatter `sources:` lists into edges, and reads
recency from sync_files (falls back to file mtime for anything not yet
embedded). On-demand only — never called from the voice/conversation path.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiosqlite

from memory.sync import VAULT_PATH, WATCHED_DIRS, vault_ready

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)")
SOURCES_RE = re.compile(r"^sources:\s*\[(.*?)\]\s*$", re.MULTILINE)
TITLE_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)

DEFAULT_MAX_NODES = 500
DEFAULT_MAX_LINKS = 2000

_EMPTY: dict[str, Any] = {
    "stats": {"nodes": 0, "links": 0, "notes": 0, "chunks": 0},
    "truncated": False,
    "nodes": [],
    "links": [],
}


def _iter_markdown() -> list[Path]:
    files: list[Path] = []
    for d in WATCHED_DIRS:
        base = VAULT_PATH / d
        if base.is_dir():
            files.extend(base.rglob("*.md"))
    return files


def _title(rel: str, body: str) -> str:
    m = TITLE_RE.search(body)
    if m:
        return m.group(1).strip()
    return Path(rel).stem.replace("-", " ").replace("_", " ").title()


def _strip_frontmatter(text: str) -> tuple[str, str]:
    """Returns (frontmatter_block, body) — frontmatter_block is '' if absent."""
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            return text[:end], text[end + 4 :]
    return "", text


async def build_graph(
    conn: aiosqlite.Connection | None,
    granularity: str = "note",
    max_nodes: int = DEFAULT_MAX_NODES,
    max_links: int = DEFAULT_MAX_LINKS,
) -> dict[str, Any]:
    """Never raises — an unreadable vault or DB error just yields empty arrays."""
    if not vault_ready():
        return dict(_EMPTY)

    try:
        return await _build(conn, granularity, max_nodes, max_links)
    except Exception:
        return dict(_EMPTY)


async def _build(
    conn: aiosqlite.Connection | None,
    granularity: str,
    max_nodes: int,
    max_links: int,
) -> dict[str, Any]:
    sync_meta: dict[str, dict] = {}
    if conn is not None:
        cur = await conn.execute(
            "SELECT path, embedded_at, chunk_count FROM sync_files WHERE deleted = 0"
        )
        rows = await cur.fetchall()
        sync_meta = {
            r["path"]: {"embeddedAt": r["embedded_at"], "chunkCount": r["chunk_count"]}
            for r in rows
        }

    parsed: list[dict] = []
    known_paths: set[str] = set()
    by_key: dict[str, str] = {}  # stem/title (lowercased) -> rel path

    for path in _iter_markdown():
        rel = str(path.relative_to(VAULT_PATH))
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        frontmatter, body = _strip_frontmatter(text)
        stat = path.stat()
        mtime_iso = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        meta = sync_meta.get(rel)
        touched_at = (meta or {}).get("embeddedAt") or mtime_iso
        chunk_count = (meta or {}).get("chunkCount") or 0
        title = _title(rel, body)
        parent = str(Path(rel).parent)
        folder = "" if parent == "." else parent

        parsed.append(
            {
                "rel": rel,
                "title": title,
                "folder": folder,
                "body": body,
                "frontmatter": frontmatter,
                "touchedAt": touched_at,
                "chunkCount": chunk_count,
            }
        )
        known_paths.add(rel)
        by_key[Path(rel).stem.lower()] = rel
        by_key[title.lower()] = rel

    notes_count = len(parsed)
    total_chunks = sum(p["chunkCount"] for p in parsed)

    degree: dict[str, int] = {}
    edges_seen: set[tuple[str, str]] = set()
    links: list[dict[str, str]] = []

    def add_link(src: str, dst: str, kind: str) -> None:
        if src == dst:
            return
        key = (src, dst) if src < dst else (dst, src)
        if key in edges_seen:
            return
        edges_seen.add(key)
        links.append({"source": src, "target": dst, "kind": kind})
        degree[src] = degree.get(src, 0) + 1
        degree[dst] = degree.get(dst, 0) + 1

    for p in parsed:
        for m in WIKILINK_RE.finditer(p["body"]):
            target = by_key.get(m.group(1).strip().split("/")[-1].lower())
            if target and target != p["rel"]:
                add_link(p["rel"], target, "wikilink")

        src_match = SOURCES_RE.search(p["frontmatter"])
        if src_match:
            for raw in src_match.group(1).split(","):
                candidate = raw.strip().strip('"').strip("'")
                if candidate in known_paths:
                    add_link(p["rel"], candidate, "wikilink")

    nodes: list[dict[str, Any]] = []
    if granularity == "chunk":
        for p in parsed:
            count = max(p["chunkCount"], 1)
            for i in range(count):
                label = f"{p['title']} #{i + 1}" if count > 1 else p["title"]
                nodes.append(
                    {
                        "id": f"{p['rel']}#{i}",
                        "label": label,
                        "path": p["rel"],
                        "kind": "chunk",
                        "folder": p["folder"],
                        "chunkIndex": i,
                        "touchedAt": p["touchedAt"],
                        "linkDegree": degree.get(p["rel"], 0),
                    }
                )
        # Collapse note-level edges onto each note's first chunk — keeps the
        # graph meaningfully connected without per-chunk link inference.
        links = [
            {"source": f"{link['source']}#0", "target": f"{link['target']}#0", "kind": link["kind"]}
            for link in links
        ]
    else:
        for p in parsed:
            nodes.append(
                {
                    "id": p["rel"],
                    "label": p["title"],
                    "path": p["rel"],
                    "kind": "note",
                    "folder": p["folder"],
                    "chunkIndex": None,
                    "touchedAt": p["touchedAt"],
                    "linkDegree": degree.get(p["rel"], 0),
                }
            )

    truncated = False
    if len(nodes) > max_nodes:
        nodes.sort(key=lambda n: n["linkDegree"], reverse=True)
        nodes = nodes[:max_nodes]
        truncated = True

    kept_ids = {n["id"] for n in nodes}
    links = [l for l in links if l["source"] in kept_ids and l["target"] in kept_ids]
    if len(links) > max_links:
        links = links[:max_links]
        truncated = True

    return {
        "stats": {
            "nodes": len(nodes),
            "links": len(links),
            "notes": notes_count,
            "chunks": total_chunks,
        },
        "truncated": truncated,
        "nodes": nodes,
        "links": links,
    }
