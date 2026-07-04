"""Obsidian Local REST API health-check integration — hermetic."""

import pytest

from memory import obsidian_client, obsidian_config


@pytest.fixture
def cfg_path(tmp_path, monkeypatch):
    path = tmp_path / "obsidian.json"
    monkeypatch.setenv("JARVIS_OBSIDIAN_CONFIG", str(path))
    return path


def test_load_missing_file_returns_defaults(cfg_path):
    cfg = obsidian_config.load()
    assert cfg["baseUrl"] == "https://127.0.0.1:27124"
    assert cfg["apiKey"] == ""
    assert obsidian_config.is_configured() is False


def test_save_then_load_roundtrips(cfg_path):
    obsidian_config.save("https://127.0.0.1:27124", "secret-token")
    cfg = obsidian_config.load()
    assert cfg["apiKey"] == "secret-token"
    assert obsidian_config.is_configured() is True


def test_load_malformed_json_degrades_to_defaults(cfg_path):
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    cfg_path.write_text("{not json")
    cfg = obsidian_config.load()
    assert cfg["apiKey"] == ""


async def test_health_check_none_when_not_configured(cfg_path):
    assert await obsidian_client.check_health() is None


async def test_health_check_false_when_unreachable(cfg_path, monkeypatch):
    obsidian_config.save("https://127.0.0.1:1", "some-key")  # nothing listens on :1
    result = await obsidian_client.check_health()
    assert result is False


async def test_health_check_true_on_2xx(cfg_path, monkeypatch):
    obsidian_config.save("https://127.0.0.1:27124", "some-key")

    class _FakeResponse:
        status_code = 200

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers=None):
            assert headers["Authorization"] == "Bearer some-key"
            return _FakeResponse()

    monkeypatch.setattr(obsidian_client.httpx, "AsyncClient", lambda **kw: _FakeClient())
    assert await obsidian_client.check_health() is True


async def test_health_check_never_raises_on_exception(cfg_path, monkeypatch):
    obsidian_config.save("https://127.0.0.1:27124", "some-key")

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, *a, **kw):
            raise RuntimeError("boom")

    monkeypatch.setattr(obsidian_client.httpx, "AsyncClient", lambda **kw: _FakeClient())
    assert await obsidian_client.check_health() is False
