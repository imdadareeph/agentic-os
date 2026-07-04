"""Phase T1 — read-only local tools + catalog filtering."""

import pytest

from tools import registry, router
from tools.handlers import docker, filesystem, git
from tools.schemas import ToolContext


def _ctx(tmp_path=None):
    # db is unused by these handlers; None is fine.
    allowed = [str(tmp_path)] if tmp_path else None
    return ToolContext(db=None, allowed_paths=allowed)


# --- registry + catalog ------------------------------------------------------

def test_t1_tools_registered():
    names = {t.name for t in registry.get_catalog()}
    assert {"filesystem.read", "filesystem.list", "git.status", "git.log", "docker.ps"} <= names


def test_catalog_category_filter():
    fs = registry.get_catalog(categories=["filesystem"])
    assert fs and all(t.category == "filesystem" for t in fs)
    # T1 read tools are present (T2 adds write/delete on top).
    assert {"filesystem.read", "filesystem.list"} <= {t.name for t in fs}


def test_category_counts():
    counts = registry.category_counts()
    assert counts.get("filesystem", 0) >= 2
    assert counts.get("git", 0) >= 2
    assert counts.get("docker", 0) >= 1


# --- filesystem allowlist ----------------------------------------------------

async def test_filesystem_list_within_allowlist(tmp_path):
    (tmp_path / "a.txt").write_text("hi")
    (tmp_path / "sub").mkdir()
    res = await filesystem.list_dir({"path": str(tmp_path)}, _ctx(tmp_path))
    assert res["ok"] is True
    names = {e["name"] for e in res["entries"]}
    assert names == {"a.txt", "sub"}


async def test_filesystem_read_within_allowlist(tmp_path):
    f = tmp_path / "note.md"
    f.write_text("secret 9000")
    res = await filesystem.read({"path": str(f)}, _ctx(tmp_path))
    assert res["ok"] is True
    assert "secret 9000" in res["content"]


async def test_filesystem_denies_traversal(tmp_path):
    # Escape attempt outside the allowed root must raise, not read.
    with pytest.raises(ValueError):
        await filesystem.read({"path": str(tmp_path / ".." / "etc" / "hosts")}, _ctx(tmp_path))


# --- git (real repo: runtime/ is inside the agentic-os git repo) -------------

async def test_git_status_ok():
    res = await git.status({}, _ctx())
    # Either a clean/short status string or a structured failure — never a crash.
    assert "ok" in res


# --- docker graceful ---------------------------------------------------------

async def test_docker_ps_graceful():
    res = await docker.ps({}, _ctx())
    # Docker may or may not be running; the handler must return a dict either way.
    assert "ok" in res
    if not res["ok"]:
        assert res.get("error")


# --- router maps T1 intents --------------------------------------------------

def test_router_maps_local_intents():
    p = router.plan("git status please", registry.get_catalog())
    assert p["useTools"] is True
    assert "git.status" in p["candidates"]

    p2 = router.plan("list the files in the runtime folder", registry.get_catalog())
    assert p2["useTools"] is True
    assert "filesystem.list" in p2["candidates"]


def test_router_skips_greeting():
    assert router.plan("hey there", registry.get_catalog())["useTools"] is False
