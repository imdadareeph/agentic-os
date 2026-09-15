"""Vault note reader — hermetic (temp vault, temp DB) (Phase MV.2)."""

from __future__ import annotations

import pytest

from memory import conversation, graph, sync, vault_read


@pytest.fixture
async def db(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_DB_PATH", str(tmp_path / "memory.db"))
    conn = await conversation.connect()
    await sync.ensure_migrations(conn)
    yield conn
    await conn.close()


@pytest.fixture
def vault(tmp_path, monkeypatch):
    root = tmp_path / "vault"
    (root / "learnings").mkdir(parents=True)
    (root / "agents" / "jarvis").mkdir(parents=True)
    monkeypatch.setattr(sync, "VAULT_PATH", root)
    monkeypatch.setattr(graph, "VAULT_PATH", root)
    monkeypatch.setattr(vault_read, "sync", sync)
    return root


async def test_read_valid_note(db, vault):
    (vault / "learnings" / "docker.md").write_text(
        "---\ntags: [jarvis, infra]\n---\n# Docker\n\nContainer notes.\n"
    )
    result = await vault_read.read_note(db, "learnings/docker.md")
    assert result is not None
    assert result["title"] == "Docker"
    assert "Container notes" in result["body"]
    assert result["frontmatter"].get("tags") == ["jarvis", "infra"]
    assert result["path"] == "learnings/docker.md"


async def test_read_resolves_wikilink(db, vault):
    (vault / "learnings" / "docker.md").write_text("# Docker\nSee [[Agents Overview]] for context.\n")
    (vault / "agents" / "jarvis" / "overview.md").write_text("# Agents Overview\nBase note.\n")

    result = await vault_read.read_note(db, "learnings/docker.md")
    assert result is not None
    assert len(result["outboundLinks"]) == 1
    link = result["outboundLinks"][0]
    assert link["label"] == "Agents Overview"
    assert link["resolved"] is True
    assert link["path"] == "agents/jarvis/overview.md"


async def test_unresolved_wikilink(db, vault):
    (vault / "learnings" / "orphan.md").write_text("# Orphan\nLinks to [[Missing Note]].\n")

    result = await vault_read.read_note(db, "learnings/orphan.md")
    assert result is not None
    assert len(result["outboundLinks"]) == 1
    assert result["outboundLinks"][0]["resolved"] is False
    assert result["outboundLinks"][0]["path"] is None


async def test_path_traversal_rejected(db, vault):
    assert await vault_read.read_note(db, "../../../etc/passwd") is None
    assert await vault_read.read_note(db, "agents/../../outside.md") is None


async def test_non_watched_dir_rejected(db, vault):
    (vault / ".obsidian").mkdir()
    (vault / ".obsidian" / "foo.md").write_text("# Hidden\n")
    assert await vault_read.read_note(db, ".obsidian/foo.md") is None


async def test_missing_file(db, vault):
    assert await vault_read.read_note(db, "learnings/nope.md") is None


async def test_large_body_truncated(db, vault):
    huge = "x" * (vault_read.MAX_BODY_BYTES + 1000)
    (vault / "learnings" / "big.md").write_text(f"# Big\n\n{huge}\n")
    result = await vault_read.read_note(db, "learnings/big.md")
    assert result is not None
    assert result["truncated"] is True
    assert len(result["body"].encode("utf-8")) <= vault_read.MAX_BODY_BYTES + 64


def test_resolve_vault_path_rejects_absolute(vault, monkeypatch):
    monkeypatch.setattr(sync, "VAULT_PATH", vault)
    assert vault_read.resolve_vault_path("/etc/passwd") is None
