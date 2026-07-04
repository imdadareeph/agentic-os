"""Phase T3 — browser.fetch / browser.search. Hermetic: httpx is mocked, no network."""

import httpx
import pytest

from tools import registry
from tools.handlers import browser
from tools.schemas import ToolContext

_CTX = ToolContext(db=None)


def _mock_client(monkeypatch, *, response=None, exc=None, capture=None):
    """Patch httpx.AsyncClient so no real request is made."""

    class _Client:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, *a, **kw):
            if capture is not None:
                capture["url"] = url
            if exc is not None:
                raise exc
            return response

        async def post(self, url, *a, **kw):
            if capture is not None:
                capture["url"] = url
                capture["data"] = kw.get("data")
            if exc is not None:
                raise exc
            return response

    monkeypatch.setattr(browser.httpx, "AsyncClient", _Client)


def _resp(text="", *, status=200, content=None, url="https://example.com/"):
    return httpx.Response(
        status_code=status,
        content=content if content is not None else text.encode("utf-8"),
        request=httpx.Request("GET", url),
    )


# --- fetch: SSRF guard -------------------------------------------------------

@pytest.mark.parametrize("url", [
    "file:///etc/passwd",
    "ftp://example.com/x",
    "gopher://example.com",
])
async def test_fetch_rejects_non_http_schemes(url):
    res = await browser.fetch({"url": url}, _CTX)
    assert res["ok"] is False
    assert "scheme" in res["error"].lower()


@pytest.mark.parametrize("url", [
    "http://localhost/admin",
    "http://127.0.0.1:8080/",
    "http://0.0.0.0/",
    "http://169.254.169.254/latest/meta-data/",
    "http://192.168.1.10/",
    "http://10.0.0.5/",
    "http://[::1]/",
    "http://metadata.google.internal/",
])
async def test_fetch_blocks_internal_hosts(url):
    res = await browser.fetch({"url": url}, _CTX)
    assert res["ok"] is False
    assert "block" in res["error"].lower() or "internal" in res["error"].lower()


async def test_fetch_allows_internal_with_env_flag(monkeypatch):
    monkeypatch.setenv("JARVIS_BROWSER_ALLOW_INTERNAL", "1")
    _mock_client(monkeypatch, response=_resp("<title>Local</title><p>hi</p>",
                                             url="http://localhost/"))
    res = await browser.fetch({"url": "http://localhost/"}, _CTX)
    assert res["ok"] is True


# --- fetch: happy path + truncation -----------------------------------------

async def test_fetch_returns_text_and_title(monkeypatch):
    html = "<html><head><title>Hello</title></head><body><p>World body text</p>" \
           "<script>ignore()</script></body></html>"
    _mock_client(monkeypatch, response=_resp(html))
    res = await browser.fetch({"url": "https://example.com/"}, _CTX)
    assert res["ok"] is True
    assert res["title"] == "Hello"
    assert "World body text" in res["text"]
    assert "ignore" not in res["text"]  # script stripped
    assert res["truncated"] is False


async def test_fetch_truncates_at_text_cap(monkeypatch):
    body = "x " * 20_000  # far past the 8000-char text cap
    html = f"<html><body>{body}</body></html>"
    _mock_client(monkeypatch, response=_resp(html))
    res = await browser.fetch({"url": "https://example.com/"}, _CTX)
    assert res["ok"] is True
    assert len(res["text"]) <= browser._MAX_TEXT_CHARS
    assert res["truncated"] is True


async def test_fetch_truncates_at_byte_cap(monkeypatch):
    big = b"<html><body>" + b"a" * (browser._MAX_BYTES + 5000) + b"</body></html>"
    _mock_client(monkeypatch, response=_resp(content=big))
    res = await browser.fetch({"url": "https://example.com/"}, _CTX)
    assert res["ok"] is True
    assert res["truncated"] is True


# --- fetch: failure modes never raise ---------------------------------------

async def test_fetch_timeout_returns_error(monkeypatch):
    _mock_client(monkeypatch, exc=httpx.TimeoutException("timed out"))
    res = await browser.fetch({"url": "https://example.com/"}, _CTX)
    assert res["ok"] is False
    assert res["error"]


async def test_fetch_connect_error_returns_error(monkeypatch):
    _mock_client(monkeypatch, exc=httpx.ConnectError("dns fail"))
    res = await browser.fetch({"url": "https://nope.example/"}, _CTX)
    assert res["ok"] is False
    assert res["error"]


async def test_fetch_non_2xx_returns_error(monkeypatch):
    _mock_client(monkeypatch, response=_resp("nope", status=503))
    res = await browser.fetch({"url": "https://example.com/"}, _CTX)
    assert res["ok"] is False
    assert "503" in res["error"]


async def test_fetch_empty_url():
    res = await browser.fetch({"url": ""}, _CTX)
    assert res["ok"] is False


# --- search ------------------------------------------------------------------

_DDG_HTML = """
<div class="result results_links web-result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fa.com%2Fpage">Result A</a>
  <a class="result__snippet">Snippet A text</a>
</div>
<div class="result web-result">
  <a class="result__a" href="https://b.com/">Result B</a>
  <a class="result__snippet">Snippet B text</a>
</div>
<div class="result web-result">
  <a class="result__a" href="https://c.com/">Result C</a>
  <a class="result__snippet">Snippet C</a>
</div>
"""


async def test_search_parses_and_caps(monkeypatch):
    _mock_client(monkeypatch, response=_resp(_DDG_HTML))
    res = await browser.search({"query": "test", "top_k": 2}, _CTX)
    assert res["ok"] is True
    assert res["query"] == "test"
    assert len(res["results"]) == 2
    first = res["results"][0]
    assert first["title"] == "Result A"
    assert first["url"] == "https://a.com/page"  # uddg unwrapped
    assert "Snippet A" in first["snippet"]


async def test_search_top_k_clamped(monkeypatch):
    _mock_client(monkeypatch, response=_resp(_DDG_HTML))
    res = await browser.search({"query": "test", "top_k": 999}, _CTX)
    assert res["ok"] is True
    assert len(res["results"]) <= 10


async def test_search_network_failure_returns_error(monkeypatch):
    _mock_client(monkeypatch, exc=httpx.ConnectError("down"))
    res = await browser.search({"query": "test"}, _CTX)
    assert res["ok"] is False
    assert res["error"]


async def test_search_empty_query():
    res = await browser.search({"query": ""}, _CTX)
    assert res["ok"] is False


# --- registry ----------------------------------------------------------------

def test_browser_tools_registered():
    for name in ("browser.search", "browser.fetch"):
        tool = registry.get_tool(name)
        assert tool is not None, f"{name} not registered"
        assert tool.category == "browser"
        assert tool.permission == "ask"
        assert tool.latency_class == "slow"
