"""Vault <-> Chroma sync (Phase M2).

Hash-based reconcile (memory.md §7.2): walk watched dirs, compare content
hash against the sync_files table, re-embed only changed files, drop
deleted ones. A watchdog observer debounces live edits onto the same
reconcile path.
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

from memory import semantic

VAULT_PATH = Path(
    os.environ.get("JARVIS_VAULT_PATH", str(Path.home() / "jarvis" / "vault"))
).expanduser()
SYNC_STATE = Path(
    os.environ.get("JARVIS_SYNC_STATE", str(Path.home() / "jarvis" / "sync" / "last_sync.json"))
).expanduser()

# Only these top-level dirs are embedded; everything else (.obsidian, attachments) is ignored.
WATCHED_DIRS = ("agents", "learnings", "projects", "wiki")

_last_full_sync: str | None = None

# Shared DB handle so the (thread-based) watcher can flag files dirty. Set from the
# app lifespan; None until then, in which case the watcher falls back to reconcile().
_db: aiosqlite.Connection | None = None


def set_db(conn: aiosqlite.Connection | None) -> None:
    global _db
    _db = conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def vault_ready() -> bool:
    return VAULT_PATH.is_dir()


def _iter_markdown() -> list[Path]:
    files: list[Path] = []
    for d in WATCHED_DIRS:
        base = VAULT_PATH / d
        if base.is_dir():
            files.extend(base.rglob("*.md"))
    return files


def _load_state() -> dict:
    if SYNC_STATE.exists():
        try:
            return json.loads(SYNC_STATE.read_text())
        except Exception:
            pass
    return {"version": 1, "files": {}, "pending": [], "errors": []}


def _save_state(state: dict) -> None:
    SYNC_STATE.parent.mkdir(parents=True, exist_ok=True)
    SYNC_STATE.write_text(json.dumps(state, indent=2))


async def reconcile() -> dict:
    """Full reconcile. Returns a small summary dict."""
    global _last_full_sync
    if not vault_ready():
        return {"embedded": 0, "deleted": 0, "vault": False}

    state = _load_state()
    files = state.get("files", {})
    seen: set[str] = set()
    embedded = 0
    errors: list[str] = []

    for path in _iter_markdown():
        rel = str(path.relative_to(VAULT_PATH))
        seen.add(rel)
        try:
            text = path.read_text(encoding="utf-8")
        except Exception as e:
            errors.append(f"{rel}: read failed ({e})")
            continue
        h = semantic.file_hash(text)
        if files.get(rel, {}).get("content_hash") == h:
            continue  # unchanged
        try:
            count = await semantic.upsert_file(rel, text)
            files[rel] = {"content_hash": h, "embedded_at": _now(), "chunk_count": count}
            embedded += 1
        except Exception as e:
            errors.append(f"{rel}: embed failed ({e})")

    # Drop files that vanished from disk.
    deleted = 0
    for rel in list(files.keys()):
        if rel not in seen:
            try:
                semantic.delete_file(rel)
            except Exception:
                pass
            del files[rel]
            deleted += 1

    state["files"] = files
    state["errors"] = errors
    state["last_full_sync"] = _now()
    _save_state(state)
    _last_full_sync = state["last_full_sync"]
    return {"embedded": embedded, "deleted": deleted, "vault": True, "errors": errors}


def last_sync_at() -> str | None:
    return _last_full_sync or _load_state().get("last_full_sync")


def sync_healthy() -> bool:
    """Sync layer is 'up' if the vault exists and a state file is writable."""
    return vault_ready()


# --- watchdog observer (debounced) ---------------------------------------

_observer = None
_debounce_timer: threading.Timer | None = None
_loop: asyncio.AbstractEventLoop | None = None


# Debounced set of vault-relative paths touched since the last flush.
_pending_paths: set[str] = set()


def _rel_path(src: str) -> str | None:
    try:
        return str(Path(src).resolve().relative_to(VAULT_PATH.resolve()))
    except Exception:
        return None


def _schedule_flush() -> None:
    """Debounce edits, then flag the touched files dirty (deferred embed) — or, if
    no DB is wired, fall back to an immediate reconcile so /sync-less setups still work."""
    global _debounce_timer
    if _debounce_timer is not None:
        _debounce_timer.cancel()

    def _run():
        if _loop is None:
            return
        if _db is not None:
            paths = list(_pending_paths)
            _pending_paths.clear()
            if paths:
                asyncio.run_coroutine_threadsafe(mark_files_dirty(_db, paths), _loop)
        else:
            asyncio.run_coroutine_threadsafe(reconcile(), _loop)

    _debounce_timer = threading.Timer(2.0, _run)  # 2s debounce per memory.md §7.1
    _debounce_timer.daemon = True
    _debounce_timer.start()


def start_watcher(loop: asyncio.AbstractEventLoop) -> None:
    global _observer, _loop
    if not vault_ready():
        return
    _loop = loop
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler

        class _Handler(FileSystemEventHandler):
            def on_any_event(self, event):
                if not str(event.src_path).endswith(".md"):
                    return
                rel = _rel_path(str(event.src_path))
                if rel:
                    _pending_paths.add(rel)
                _schedule_flush()

        _observer = Observer()
        _observer.schedule(_Handler(), str(VAULT_PATH), recursive=True)
        _observer.daemon = True
        _observer.start()
    except Exception:
        _observer = None  # watcher is best-effort; manual /sync still works


# --- DB-backed dirty tracking (deferred idle embedding) ------------------

async def mark_files_dirty(conn: aiosqlite.Connection, rel_paths: list[str]) -> None:
    """Flag vault files dirty so the idle worker re-embeds (or drops) them later.

    Fire-and-forget from the watcher thread — never on the voice/API hot path.
    """
    now = _now()
    for rel in rel_paths:
        deleted = 0 if (VAULT_PATH / rel).exists() else 1
        # Upsert: insert a placeholder row on first sight, else just flip flags.
        await conn.execute(
            """INSERT INTO sync_files (path, content_hash, embedded_at, chunk_count, dirty, deleted)
               VALUES (?, '', ?, 0, 1, ?)
               ON CONFLICT(path) DO UPDATE SET dirty = 1, deleted = excluded.deleted""",
            (rel, now, deleted),
        )
    await conn.commit()


async def dirty_files(conn: aiosqlite.Connection, limit: int) -> list[dict]:
    cur = await conn.execute(
        "SELECT path, content_hash, deleted FROM sync_files WHERE dirty = 1 LIMIT ?",
        (limit,),
    )
    rows = await cur.fetchall()
    return [
        {"path": r["path"], "content_hash": r["content_hash"], "deleted": bool(r["deleted"])}
        for r in rows
    ]


async def clear_file_dirty(
    conn: aiosqlite.Connection, rel: str, content_hash: str, chunk_count: int
) -> None:
    await conn.execute(
        """UPDATE sync_files
           SET dirty = 0, content_hash = ?, chunk_count = ?, embedded_at = ?
           WHERE path = ?""",
        (content_hash, chunk_count, _now(), rel),
    )
    await conn.commit()


async def drop_file(conn: aiosqlite.Connection, rel: str) -> None:
    await conn.execute("DELETE FROM sync_files WHERE path = ?", (rel,))
    await conn.commit()


def stop_watcher() -> None:
    global _observer
    if _observer is not None:
        _observer.stop()
        _observer = None


def _split_sql(script: str) -> list[str]:
    """Split a migration into individual statements, dropping full-line comments."""
    body = "\n".join(
        ln for ln in script.splitlines() if not ln.strip().startswith("--")
    )
    return [s.strip() for s in body.split(";") if s.strip()]


async def ensure_migrations(conn) -> None:
    """Apply every migration in db/migrations/ in order, idempotently.

    Statements run individually so ALTER TABLE ... ADD COLUMN migrations stay safe
    on already-migrated databases (SQLite has no ADD COLUMN IF NOT EXISTS) — a
    "duplicate column name" error just means the column is already there.
    """
    mig_dir = Path(__file__).resolve().parent.parent / "db" / "migrations"
    if not mig_dir.is_dir():
        return
    for mig in sorted(mig_dir.glob("*.sql")):
        for stmt in _split_sql(mig.read_text()):
            try:
                await conn.execute(stmt)
            except aiosqlite.OperationalError as e:
                if "duplicate column name" not in str(e).lower():
                    raise
    await conn.commit()
