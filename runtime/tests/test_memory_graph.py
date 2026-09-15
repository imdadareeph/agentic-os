"""Memory Galaxy graph builder — hermetic (temp vault, temp DB) (Phase MV)."""

from __future__ import annotations

import pytest

from memory import conversation, graph, sync


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
    return root


async def test_empty_vault_returns_empty_arrays_not_error(db, tmp_path, monkeypatch):
    missing = tmp_path / "no-such-vault"
    monkeypatch.setattr(sync, "VAULT_PATH", missing)
    monkeypatch.setattr(graph, "VAULT_PATH", missing)
    result = await graph.build_graph(db)
    assert result["nodes"] == []
    assert result["links"] == []
    assert result["stats"] == {"nodes": 0, "links": 0, "notes": 0, "chunks": 0}


async def test_wikilink_between_two_notes(db, vault):
    (vault / "learnings" / "docker.md").write_text("# Docker\nSee [[Agents Overview]] for context.\n")
    (vault / "agents" / "jarvis" / "overview.md").write_text("# Agents Overview\nBase note.\n")

    result = await graph.build_graph(db)
    ids = {n["id"] for n in result["nodes"]}
    assert "learnings/docker.md" in ids
    assert "agents/jarvis/overview.md" in ids
    assert result["stats"]["notes"] == 2
    assert len(result["links"]) == 1
    link = result["links"][0]
    assert {link["source"], link["target"]} == {"learnings/docker.md", "agents/jarvis/overview.md"}
    assert link["kind"] == "wikilink"

    degrees = {n["id"]: n["linkDegree"] for n in result["nodes"]}
    assert degrees["learnings/docker.md"] == 1
    assert degrees["agents/jarvis/overview.md"] == 1


async def test_frontmatter_sources_become_links(db, vault):
    (vault / "learnings" / "containerization.md").write_text("# Containerization\nBase note.\n")
    (vault / "agents" / "jarvis" / "note.md").write_text(
        '---\nsources: ["learnings/containerization.md"]\n---\n# Note\nBody text.\n'
    )

    result = await graph.build_graph(db)
    assert len(result["links"]) == 1
    link = result["links"][0]
    assert {link["source"], link["target"]} == {
        "learnings/containerization.md",
        "agents/jarvis/note.md",
    }


async def test_unresolved_wikilink_is_dropped_not_crashed(db, vault):
    (vault / "learnings" / "solo.md").write_text("# Solo\nLinks to [[Nothing Here]].\n")
    result = await graph.build_graph(db)
    assert result["links"] == []
    assert result["stats"]["notes"] == 1


async def test_recency_prefers_sync_files_over_mtime(db, vault):
    (vault / "learnings" / "recent.md").write_text("# Recent\nBody.\n")
    await db.execute(
        "INSERT INTO sync_files (path, content_hash, embedded_at, chunk_count) VALUES (?, ?, ?, ?)",
        ("learnings/recent.md", "abc123", "2020-01-01T00:00:00+00:00", 3),
    )
    await db.commit()

    result = await graph.build_graph(db)
    node = next(n for n in result["nodes"] if n["id"] == "learnings/recent.md")
    assert node["touchedAt"] == "2020-01-01T00:00:00+00:00"
    assert result["stats"]["chunks"] == 3


async def test_max_nodes_caps_and_sets_truncated(db, vault):
    for i in range(10):
        (vault / "learnings" / f"note{i}.md").write_text(f"# Note {i}\nBody.\n")

    result = await graph.build_graph(db, max_nodes=3)
    assert len(result["nodes"]) == 3
    assert result["truncated"] is True
    assert result["stats"]["notes"] == 10  # true count preserved even though nodes capped


async def test_chunk_granularity_expands_nodes_per_chunk(db, vault):
    (vault / "learnings" / "chunked.md").write_text("# Chunked\nBody.\n")
    await db.execute(
        "INSERT INTO sync_files (path, content_hash, embedded_at, chunk_count) VALUES (?, ?, ?, ?)",
        ("learnings/chunked.md", "abc", "2026-01-01T00:00:00+00:00", 3),
    )
    await db.commit()

    result = await graph.build_graph(db, granularity="chunk")
    ids = {n["id"] for n in result["nodes"]}
    assert ids == {"learnings/chunked.md#0", "learnings/chunked.md#1", "learnings/chunked.md#2"}
    assert all(n["kind"] == "chunk" for n in result["nodes"])
