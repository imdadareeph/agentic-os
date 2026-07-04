"""browser.fetch / browser.search (Phase T3, TOOLS.md) — approval-gated web access.

Both handlers NEVER raise: every failure mode (bad scheme, internal host, timeout,
DNS failure, non-2xx, malformed HTML) returns {"ok": False, "error": str}.

SSRF guard: fetch() rejects non-http(s) schemes and internal/loopback/link-local/
private hosts unless JARVIS_BROWSER_ALLOW_INTERNAL=1 is set. This is a hard
requirement — do not remove it.
"""

from __future__ import annotations

import ipaddress
import os
from typing import Any
from urllib.parse import urlparse, parse_qs, unquote

import httpx
from bs4 import BeautifulSoup

from tools.schemas import ToolContext

_TIMEOUT_S = 15.0
_MAX_BYTES = 2_000_000  # 2 MB
_MAX_TEXT_CHARS = 8000
_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)

# Hostnames that always map to the local machine / cloud metadata endpoints.
_BLOCKED_HOSTNAMES = {
    "localhost",
    "0.0.0.0",
    "127.0.0.1",
    "169.254.169.254",  # AWS/GCP/Azure metadata
    "metadata.google.internal",
}


def _allow_internal() -> bool:
    return os.environ.get("JARVIS_BROWSER_ALLOW_INTERNAL", "") == "1"


def _is_internal_host(host: str | None) -> bool:
    """True if `host` looks internal (loopback, private, link-local, or a known name)."""
    if not host:
        return True
    host = host.strip().lower().rstrip(".")
    # Strip an IPv6 bracket wrapper: [::1] -> ::1
    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1]
    if host in _BLOCKED_HOSTNAMES:
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False  # a normal domain name — allowed
    return (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_unspecified
    )


def _guard_url(url: str) -> str | None:
    """Return an error string if `url` is unsafe, else None."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return "malformed URL"
    if parsed.scheme not in ("http", "https"):
        return f"unsupported URL scheme: {parsed.scheme or '(none)'} (only http/https allowed)"
    if not parsed.hostname:
        return "URL has no host"
    if not _allow_internal() and _is_internal_host(parsed.hostname):
        return f"internal/loopback host blocked: {parsed.hostname}"
    return None


def _html_to_text(html: str) -> tuple[str | None, str]:
    """Extract (title, readable text) from HTML, stripping scripts/styles/nav chrome."""
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(strip=True) if soup.title else None
    for tag in soup(["script", "style", "noscript", "template", "svg"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines = [line.strip() for line in text.splitlines()]
    cleaned = "\n".join(line for line in lines if line)
    return title, cleaned


async def fetch(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    url = str(args.get("url", "")).strip()
    if not url:
        return {"ok": False, "error": "empty url"}
    guard_err = _guard_url(url)
    if guard_err:
        return {"ok": False, "error": guard_err}
    try:
        async with httpx.AsyncClient(
            timeout=_TIMEOUT_S,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT},
        ) as client:
            resp = await client.get(url)
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"fetch failed: {exc}"}
    except Exception as exc:  # never raise out of a handler
        return {"ok": False, "error": f"fetch failed: {exc}"}

    if resp.status_code >= 400:
        return {"ok": False, "error": f"HTTP {resp.status_code} for {url}"}

    raw = resp.content[:_MAX_BYTES]
    body_truncated = len(resp.content) > _MAX_BYTES
    try:
        html = raw.decode(resp.encoding or "utf-8", errors="replace")
    except (LookupError, TypeError):
        html = raw.decode("utf-8", errors="replace")

    try:
        title, text = _html_to_text(html)
    except Exception:
        title, text = None, html

    text_truncated = len(text) > _MAX_TEXT_CHARS
    text = text[:_MAX_TEXT_CHARS]
    return {
        "ok": True,
        "url": str(resp.url),
        "title": title,
        "text": text,
        "truncated": body_truncated or text_truncated,
    }


def _extract_ddg_href(href: str) -> str:
    """DuckDuckGo wraps result links as /l/?uddg=<encoded>. Unwrap when present."""
    if not href:
        return href
    if href.startswith("//"):
        href = "https:" + href
    parsed = urlparse(href)
    if "duckduckgo.com" in (parsed.hostname or "") and parsed.path.startswith("/l/"):
        target = parse_qs(parsed.query).get("uddg")
        if target:
            return unquote(target[0])
    return href


def _parse_ddg_results(html: str, top_k: int) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    results: list[dict[str, str]] = []
    for node in soup.select("div.result, div.web-result"):
        link = node.select_one("a.result__a")
        if link is None:
            continue
        href = _extract_ddg_href(link.get("href", ""))
        title = link.get_text(strip=True)
        snippet_el = node.select_one(".result__snippet")
        snippet = snippet_el.get_text(strip=True) if snippet_el else ""
        if not href or not title:
            continue
        results.append({"title": title, "url": href, "snippet": snippet})
        if len(results) >= top_k:
            break
    return results


async def search(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    query = str(args.get("query", "")).strip()
    if not query:
        return {"ok": False, "error": "empty query"}
    try:
        top_k = int(args.get("top_k", 5))
    except (TypeError, ValueError):
        top_k = 5
    top_k = max(1, min(top_k, 10))

    try:
        async with httpx.AsyncClient(
            timeout=_TIMEOUT_S,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT},
        ) as client:
            resp = await client.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query},
            )
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"search failed: {exc}"}
    except Exception as exc:
        return {"ok": False, "error": f"search failed: {exc}"}

    if resp.status_code >= 400:
        return {"ok": False, "error": f"search HTTP {resp.status_code}"}

    try:
        results = _parse_ddg_results(resp.text, top_k)
    except Exception as exc:
        return {"ok": False, "error": f"failed to parse search results: {exc}"}

    return {"ok": True, "query": query, "results": results}
