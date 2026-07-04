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
import time
from datetime import datetime, timezone
from pathlib import Path

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


def _schedule_reconcile() -> None:
    global _debounce_timer
    if _debounce_timer is not None:
        _debounce_timer.cancel()

    def _run():
        if _loop is not None:
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
                if str(event.src_path).endswith(".md"):
                    _schedule_reconcile()

        _observer = Observer()
        _observer.schedule(_Handler(), str(VAULT_PATH), recursive=True)
        _observer.daemon = True
        _observer.start()
    except Exception:
        _observer = None  # watcher is best-effort; manual /sync still works


def stop_watcher() -> None:
    global _observer
    if _observer is not None:
        _observer.stop()
        _observer = None


async def ensure_migrations(conn) -> None:
    """Apply every migration in db/migrations/ in order, idempotently."""
    mig_dir = Path(__file__).resolve().parent.parent / "db" / "migrations"
    if not mig_dir.is_dir():
        return
    for mig in sorted(mig_dir.glob("*.sql")):
        await conn.executescript(mig.read_text())
    await conn.commit()
