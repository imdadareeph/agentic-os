"""Phase T4 — skills, agent tool policies, composite handlers. Hermetic."""

from __future__ import annotations

import pytest

from memory import conversation, sync
from tools import agent_policies, registry, router, skill_loader
from tools.handlers import research_agent, skills as skill_handlers
from tools.schemas import ToolContext


@pytest.fixture
async def db(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_DB_PATH", str(tmp_path / "memory.db"))
    conn = await conversation.connect()
    await sync.ensure_migrations(conn)
    yield conn
    await conn.close()


# --- built-in composite tools registered ------------------------------------

def test_builtin_skill_tools_registered():
    names = {t.name for t in registry.get_catalog()}
    assert {"skill.plan_today", "skill.am_report", "agent.research.run"} <= names


def test_agent_research_run_is_ask_and_slow():
    tool = registry.get_tool("agent.research.run")
    assert tool.permission == "ask"
    assert tool.latency_class == "slow"


def test_skill_composites_are_allow_and_fast():
    for name in ("skill.plan_today", "skill.am_report"):
        tool = registry.get_tool(name)
        assert tool.permission == "allow"
        assert tool.latency_class == "fast"


# --- composite handlers ------------------------------------------------------

async def test_plan_today_handler_returns_summary(db):
    ctx = ToolContext(db=db, session_id=None, agent_id="jarvis")
    result = await skill_handlers.plan_today({}, ctx)
    assert "summary" in result
    assert "Plan for today" in result["summary"]


async def test_am_report_handler_returns_summary(db):
    ctx = ToolContext(db=db, session_id=None, agent_id="jarvis")
    result = await skill_handlers.am_report({}, ctx)
    assert "summary" in result
    assert "Morning report" in result["summary"]


async def test_research_run_requires_query(db):
    ctx = ToolContext(db=db, session_id=None, agent_id="research")
    result = await research_agent.run({}, ctx)
    assert result["ok"] is False
    assert "query" in result["error"]


async def test_research_run_end_to_end(db, monkeypatch, tmp_path):
    vault = tmp_path / "vault"
    vault.mkdir()
    from memory import sync as sync_module, episodic as episodic_module

    monkeypatch.setattr(sync_module, "VAULT_PATH", vault)
    monkeypatch.setattr(episodic_module, "VAULT_PATH", vault)

    async def fake_search(args, ctx):
        return {
            "ok": True,
            "query": args["query"],
            "results": [{"title": "Result A", "url": "https://a.example", "snippet": "about A"}],
        }

    from tools.handlers import browser

    monkeypatch.setattr(browser, "search", fake_search)

    ctx = ToolContext(db=db, session_id="s1", agent_id="research")
    result = await research_agent.run({"query": "agentic os"}, ctx)
    assert result["ok"] is True
    assert result["resultCount"] == 1
    assert result["written"] is True
    assert (vault / result["notePath"]).exists()
    assert "agents/research" in result["notePath"]


# --- agent tool policy -------------------------------------------------------

def test_research_agent_policy_restricts_catalog():
    all_names = {t.name for t in registry.get_catalog()}
    scoped_names = {t.name for t in registry.get_catalog(agent_id="research")}
    assert scoped_names < all_names
    assert scoped_names == {
        "memory.search",
        "browser.search",
        "memory.episodic.write",
        "agent.research.run",
        "time.now",
    }


def test_unknown_agent_id_is_unrestricted():
    all_names = {t.name for t in registry.get_catalog()}
    scoped_names = {t.name for t in registry.get_catalog(agent_id="jarvis")}
    assert scoped_names == all_names


def test_allowed_tools_helper_no_policy_passthrough():
    names = ["a.b", "c.d"]
    assert agent_policies.allowed_tools("no-such-agent", names) == names


# --- skill manifest loader ----------------------------------------------------

def test_load_manifests_missing_dir_returns_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(skill_loader, "SKILLS_DIR", tmp_path / "nope")
    monkeypatch.setattr(skill_loader, "_REPO_FALLBACK", tmp_path / "also-nope")
    assert skill_loader.load_manifests() == []


def test_load_manifests_yaml_and_malformed(tmp_path, monkeypatch):
    monkeypatch.setattr(skill_loader, "SKILLS_DIR", tmp_path)
    (tmp_path / "good.yaml").write_text(
        "id: weekly-review\ntitle: Weekly Review\ntools: [memory.search]\nprompt: Summarize this week.\n"
    )
    (tmp_path / "bad.yaml").write_text("not: valid: yaml: [[[")
    (tmp_path / "incomplete.json").write_text('{"id": "x"}')  # missing required fields

    manifests = skill_loader.load_manifests()
    assert len(manifests) == 1
    assert manifests[0]["id"] == "weekly-review"


def test_build_tool_definition_handler_returns_instructions():
    manifest = {
        "id": "weekly-review",
        "title": "Weekly Review",
        "tools": ["memory.search"],
        "prompt": "Summarize this week.",
    }
    tool = skill_loader.build_tool_definition(manifest)
    assert tool.name == "skill.weekly-review"
    assert tool.category == "skill"


async def test_manifest_handler_returns_prompt_and_allowed_tools(db):
    manifest = {
        "id": "weekly-review",
        "title": "Weekly Review",
        "tools": ["memory.search"],
        "prompt": "Summarize this week.",
    }
    tool = skill_loader.build_tool_definition(manifest)
    ctx = ToolContext(db=db, session_id=None, agent_id="jarvis")
    result = await tool.handler({}, ctx)
    assert result == {
        "skillId": "weekly-review",
        "instructions": "Summarize this week.",
        "allowedTools": ["memory.search"],
    }


# --- registry register/unregister/reload -------------------------------------

def test_register_and_unregister_tool_roundtrip():
    manifest = {
        "id": "temp-skill",
        "title": "Temp",
        "tools": [],
        "prompt": "Do a temp thing.",
    }
    tool = skill_loader.build_tool_definition(manifest, source="skill:temp-skill")
    registry.register_tool(tool)
    assert registry.get_tool("skill.temp-skill") is not None

    removed = registry.unregister_tool("skill.temp-skill")
    assert removed is True
    assert registry.get_tool("skill.temp-skill") is None

    # Unregistering again is a no-op, not an error.
    assert registry.unregister_tool("skill.temp-skill") is False


def test_reload_skill_manifests_loads_and_removes(tmp_path, monkeypatch):
    monkeypatch.setattr(skill_loader, "SKILLS_DIR", tmp_path)
    (tmp_path / "one.yaml").write_text(
        "id: one\ntitle: One\ntools: []\nprompt: Do one thing.\n"
    )
    result = registry.reload_skill_manifests()
    assert result["loaded"] == 1
    assert registry.get_tool("skill.one") is not None

    (tmp_path / "one.yaml").unlink()
    result2 = registry.reload_skill_manifests()
    assert result2["loaded"] == 0
    assert result2["removed"] == 1
    assert registry.get_tool("skill.one") is None


# --- router picks up new skill keywords --------------------------------------

def test_router_matches_plan_today():
    result = router.plan("what's my plan for today", registry.get_catalog())
    assert result["useTools"] is True
    assert "skill.plan_today" in result["candidates"]


def test_router_matches_research_intent():
    result = router.plan("research agentic os frameworks for me", registry.get_catalog())
    assert result["useTools"] is True
    assert "agent.research.run" in result["candidates"]
