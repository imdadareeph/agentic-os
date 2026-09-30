"""MF0 — user_facts schema, profile API, idle-gated extract."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from memory import conversation, idle, profile, sync
from main import app


@pytest.fixture
async def db(tmp_path, monkeypatch):
    db_file = tmp_path / "memory.db"
    monkeypatch.setenv("JARVIS_DB_PATH", str(db_file))
    conn = await conversation.connect()
    await sync.ensure_migrations(conn)
    app.state.db = conn
    yield conn
    await conn.close()


@pytest.fixture
async def client(db):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_upsert_supersedes_on_higher_confidence(db):
    first = await profile.upsert_fact(db, "identity/name", "Alex", 0.8)
    assert first

    second = await profile.upsert_fact(db, "identity/name", "Creator", 0.95)
    assert second

    lower = await profile.upsert_fact(db, "identity/name", "Bob", 0.5)
    assert lower is None

    facts = await profile.list_active_facts(db)
    assert len(facts) == 1
    assert facts[0]["key"] == "identity/name"
    assert facts[0]["value"] == "Creator"


@pytest.mark.asyncio
async def test_extract_rules(db):
    count = await profile.extract_from_text(
        db, "Call me Creator and I prefer concise answers", "turn-1"
    )
    assert count >= 2
    facts = {f["key"]: f["value"] for f in await profile.list_active_facts(db)}
    assert facts.get("identity/name") == "Creator"
    assert "concise" in facts.get("preferences/general", "")


@pytest.mark.asyncio
async def test_get_profile_api(client, db):
    await profile.upsert_fact(db, "identity/name", "Alex", 0.9)
    res = await client.get("/api/memory/profile")
    assert res.status_code == 200
    data = res.json()
    assert len(data["facts"]) == 1
    assert data["facts"][0]["key"] == "identity/name"
    assert data["facts"][0]["value"] == "Alex"


@pytest.mark.asyncio
async def test_extract_rejects_while_active(client, monkeypatch):
    monkeypatch.setattr(idle, "is_idle", lambda idle_after_s=20.0: False)
    res = await client.post(
        "/api/memory/profile/extract",
        json={"text": "call me Creator"},
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_extract_when_idle(client, monkeypatch):
    monkeypatch.setattr(idle, "is_idle", lambda idle_after_s=20.0: True)
    res = await client.post(
        "/api/memory/profile/extract",
        json={"text": "My name is Alex"},
    )
    assert res.status_code == 200
    assert res.json()["extracted"] == 1

    profile_res = await client.get("/api/memory/profile")
    assert profile_res.json()["facts"][0]["value"] == "Alex"
