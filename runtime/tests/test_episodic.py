"""Episodic writes — hermetic (temp vault, embed stubbed)."""

import importlib

import pytest


@pytest.fixture
def episodic(tmp_path, monkeypatch):
    """Reload sync + episodic against a temp vault, with embedding stubbed out."""
    monkeypatch.setenv("JARVIS_VAULT_PATH", str(tmp_path / "vault"))
    (tmp_path / "vault" / "agents").mkdir(parents=True)

    from memory import sync as sync_mod

    importlib.reload(sync_mod)
    from memory import episodic as ep_mod

    importlib.reload(ep_mod)

    async def _no_embed(path, text):
        return 0

    monkeypatch.setattr(ep_mod.semantic, "upsert_file", _no_embed)
    return ep_mod


def test_slugify():
    from memory import episodic as ep

    assert ep._slugify("Docker Setup for Agents!") == "docker-setup-for-agents"
    assert ep._slugify("") == "note"


async def test_write_note_creates_file_with_frontmatter(episodic):
    res = await episodic.write_note(
        "Docker setup", "body text", session_id="s1", tags=["research"], sources=["a.md"]
    )
    assert res["written"] is True
    assert res["path"].startswith("agents/jarvis/docker-setup-")
    assert res["jarvis_id"]

    full = episodic.VAULT_PATH / res["path"]
    content = full.read_text()
    assert 'jarvis_id:' in content
    assert "agent: jarvis" in content
    assert "session_id: \"s1\"" in content
    assert "research" in content
    assert "# Docker setup" in content


async def test_never_overwrites(episodic):
    r1 = await episodic.write_note("Same title", "one")
    r2 = await episodic.write_note("Same title", "two")
    assert r1["path"] != r2["path"]
    # Both files exist on disk.
    assert (episodic.VAULT_PATH / r1["path"]).exists()
    assert (episodic.VAULT_PATH / r2["path"]).exists()


async def test_write_note_no_vault(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_VAULT_PATH", str(tmp_path / "missing"))
    import importlib
    from memory import sync as sync_mod

    importlib.reload(sync_mod)
    from memory import episodic as ep_mod

    importlib.reload(ep_mod)
    res = await ep_mod.write_note("x", "y")
    assert res["written"] is False
