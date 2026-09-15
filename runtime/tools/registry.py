"""Tool registry — loads the T0 catalog at import time (TOOLS.md §4).

Skills/agents/MCP register dynamically in later phases; T0 is core-only.
"""

from __future__ import annotations

from tools import agent_policies, skill_loader
from tools.handlers import (
    browser,
    docker,
    filesystem,
    git,
    mcp_bridge,
    memory_tools,
    research_agent,
    skills as skill_handlers,
    terminal,
    vitals,
)
from tools.schemas import ToolDefinition

_REGISTRY: dict[str, ToolDefinition] = {}


def _register(tool: ToolDefinition) -> None:
    _REGISTRY[tool.name] = tool


def _load_core_catalog() -> None:
    """Phase T0 catalog (TOOLS.md §4.2) — all fast + allow."""
    _register(
        ToolDefinition(
            name="vitals.fetch",
            title="Fetch live vitals",
            description="Live YouTube, Instagram, and Ollama metrics from the vitals dashboard.",
            category="system",
            parameters={"type": "object", "properties": {}},
            permission="allow",
            latency_class="fast",
            handler=vitals.fetch,
        )
    )
    _register(
        ToolDefinition(
            name="memory.search",
            title="Search memory",
            description="Semantic search over the Obsidian vault and JARVIS knowledge base.",
            category="memory",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Natural language search query"},
                    "top_k": {"type": "integer", "default": 3, "minimum": 1, "maximum": 10},
                },
                "required": ["query"],
            },
            permission="allow",
            latency_class="fast",
            handler=memory_tools.search,
        )
    )
    _register(
        ToolDefinition(
            name="memory.retrieve",
            title="Retrieve session memory",
            description="Full retrieve block (recent turns + context) for the current session.",
            category="memory",
            parameters={
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "default": 20, "minimum": 1, "maximum": 100},
                },
            },
            permission="allow",
            latency_class="fast",
            handler=memory_tools.retrieve,
        )
    )
    _register(
        ToolDefinition(
            name="system.status",
            title="Runtime status",
            description="Check JARVIS runtime and service health (sqlite, chroma, vault, sync).",
            category="system",
            parameters={"type": "object", "properties": {}},
            permission="allow",
            latency_class="fast",
            handler=memory_tools.system_status,
        )
    )
    _register(
        ToolDefinition(
            name="time.now",
            title="Current time",
            description="Current UTC time and timezone.",
            category="system",
            parameters={"type": "object", "properties": {}},
            permission="allow",
            latency_class="fast",
            handler=memory_tools.time_now,
        )
    )


def _load_local_catalog() -> None:
    """Phase T1 (TOOLS.md §4.2 / §8) — read-only local inspection; fast + allow."""
    _register(ToolDefinition(
        name="filesystem.read", title="Read file",
        description="Read a text file within the allowed paths.",
        category="filesystem",
        parameters={"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
        permission="allow", latency_class="fast", handler=filesystem.read,
    ))
    _register(ToolDefinition(
        name="filesystem.list", title="List directory",
        description="List a directory's entries within the allowed paths.",
        category="filesystem",
        parameters={"type": "object", "properties": {"path": {"type": "string", "default": "."}}},
        permission="allow", latency_class="fast", handler=filesystem.list_dir,
    ))
    _register(ToolDefinition(
        name="git.status", title="Git status",
        description="Short git status of the working tree.",
        category="git",
        parameters={"type": "object", "properties": {}},
        permission="allow", latency_class="fast", handler=git.status,
    ))
    _register(ToolDefinition(
        name="git.log", title="Git log",
        description="Recent commits (oneline).",
        category="git",
        parameters={"type": "object", "properties": {"limit": {"type": "integer", "default": 10, "minimum": 1, "maximum": 50}}},
        permission="allow", latency_class="fast", handler=git.log,
    ))
    _register(ToolDefinition(
        name="docker.ps", title="Docker containers",
        description="List running Docker containers.",
        category="docker",
        parameters={"type": "object", "properties": {}},
        permission="allow", latency_class="fast", handler=docker.ps,
    ))


def _load_mutating_catalog() -> None:
    """Phase T2 (TOOLS.md §8/§9) — mutating tools; permission=ask by default."""
    _register(ToolDefinition(
        name="filesystem.write", title="Write file",
        description="Write text to a file within the allowed paths.",
        category="filesystem",
        parameters={"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]},
        permission="ask", latency_class="fast", handler=filesystem.write,
    ))
    _register(ToolDefinition(
        name="filesystem.delete", title="Delete file",
        description="Delete a single file within the allowed paths.",
        category="filesystem",
        parameters={"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
        permission="ask", latency_class="fast", handler=filesystem.delete,
    ))
    _register(ToolDefinition(
        name="terminal.run", title="Run shell command",
        description="Run a shell command in the repo directory. Destructive commands are refused.",
        category="terminal",
        parameters={"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]},
        permission="ask", latency_class="slow", handler=terminal.run,
    ))
    _register(ToolDefinition(
        name="git.commit", title="Git commit",
        description="Stage all changes and commit with a message.",
        category="git",
        parameters={"type": "object", "properties": {"message": {"type": "string"}}, "required": ["message"]},
        permission="ask", latency_class="fast", handler=git.commit,
    ))
    _register(ToolDefinition(
        name="docker.run", title="Docker run",
        description="Start a container from an image (detached).",
        category="docker",
        parameters={"type": "object", "properties": {"image": {"type": "string"}, "args": {"type": "array", "items": {"type": "string"}}}, "required": ["image"]},
        permission="ask", latency_class="slow", handler=docker.run,
    ))
    _register(ToolDefinition(
        name="docker.stop", title="Docker stop",
        description="Stop a running container by name.",
        category="docker",
        parameters={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
        permission="ask", latency_class="fast", handler=docker.stop,
    ))
    _register(ToolDefinition(
        name="memory.episodic.write", title="Save vault note",
        description="Write a durable note to the Obsidian vault under agents/.",
        category="memory",
        parameters={"type": "object", "properties": {"title": {"type": "string"}, "body": {"type": "string"}, "tags": {"type": "array", "items": {"type": "string"}}}, "required": ["title", "body"]},
        permission="ask", latency_class="fast", handler=memory_tools.episodic_write,
    ))


def _load_browser_catalog() -> None:
    """Phase T3 (TOOLS.md) — web access; permission=ask, latency slow, never raises."""
    _register(ToolDefinition(
        name="browser.search", title="Web search",
        description="Search the web (DuckDuckGo) and return titles, URLs, and snippets.",
        category="browser",
        parameters={"type": "object", "properties": {
            "query": {"type": "string"},
            "top_k": {"type": "integer", "default": 5, "minimum": 1, "maximum": 10},
        }, "required": ["query"]},
        permission="ask", latency_class="slow", handler=browser.search,
    ))
    _register(ToolDefinition(
        name="browser.fetch", title="Fetch web page",
        description="Fetch an http(s) URL and return its readable text (internal hosts blocked).",
        category="browser",
        parameters={"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]},
        permission="ask", latency_class="slow", handler=browser.fetch,
    ))


def _load_skill_catalog() -> None:
    """Phase T4 (TOOLS.md §10) — first-party composite skills + agent tools.

    Read-only composites (plan_today/am_report) are allow+fast — they only
    call other allow-listed read handlers. agent.research.run does external
    network + a vault write, so it stays ask+slow like its primitives.
    """
    _register(ToolDefinition(
        name="skill.plan_today", title="Plan today",
        description="Compose a short plan for today from system status and recent notes.",
        category="skill",
        parameters={"type": "object", "properties": {}},
        permission="allow", latency_class="fast", handler=skill_handlers.plan_today,
    ))
    _register(ToolDefinition(
        name="skill.am_report", title="Morning report",
        description="Compose a brief morning report from live vitals and runtime status.",
        category="skill",
        parameters={"type": "object", "properties": {}},
        permission="allow", latency_class="fast", handler=skill_handlers.am_report,
    ))
    _register(ToolDefinition(
        name="agent.research.run", title="Research agent",
        description="Search the web for a query and save findings as a vault note under agents/research/.",
        category="skill",
        parameters={"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
        permission="ask", latency_class="slow", handler=research_agent.run,
    ))


_load_core_catalog()
_load_local_catalog()
_load_mutating_catalog()
_load_browser_catalog()
_load_skill_catalog()


def get_catalog(
    enabled_only: bool = True,
    categories: list[str] | None = None,
    agent_id: str | None = None,
) -> list[ToolDefinition]:
    tools = list(_REGISTRY.values())
    if enabled_only:
        tools = [t for t in tools if t.enabled]
    if categories is not None:
        allowed = set(categories)
        tools = [t for t in tools if t.category in allowed]
    if agent_id is not None:
        names = set(agent_policies.allowed_tools(agent_id, [t.name for t in tools]))
        tools = [t for t in tools if t.name in names]
    return tools


def category_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    for t in _REGISTRY.values():
        counts[t.category] = counts.get(t.category, 0) + 1
    return counts


async def refresh_mcp_tools() -> int:
    """Re-discover external MCP servers and (re)register their tools (TOOLS.md §13.3).

    Async because discovery does subprocess I/O — this is NOT called at import
    time (module load stays sync/offline). Stale ``mcp:*`` entries are removed
    first so re-discovery never duplicates or leaves dead tools behind. Only
    healthy servers' tools land in the registry (discovery filters unhealthy).
    Returns the number of MCP tools now registered.
    """
    stale = [name for name, t in _REGISTRY.items() if t.source.startswith("mcp:")]
    for name in stale:
        _REGISTRY.pop(name, None)
    return await mcp_bridge.register_mcp_tools(_register)


def get_tool(name: str) -> ToolDefinition | None:
    return _REGISTRY.get(name)


def tool_count() -> int:
    return len(_REGISTRY)


def register_tool(tool: ToolDefinition) -> None:
    """Register (or replace) a tool at runtime (Phase T4 — POST /api/tools/register)."""
    _register(tool)


def unregister_tool(name: str) -> bool:
    """Remove a tool by name. Returns whether it existed."""
    return _REGISTRY.pop(name, None) is not None


def reload_skill_manifests() -> dict[str, int]:
    """Re-scan the skills directory (Phase T4 — POST /api/tools/skills/reload).

    Stale file-backed skill entries are dropped first so edits/deletes are
    reflected, not just additions — same stale-then-rediscover pattern as
    refresh_mcp_tools(). Never raises; a missing/unreadable dir just yields 0.
    """
    stale = [name for name, t in _REGISTRY.items() if t.source == "skill-file"]
    for name in stale:
        _REGISTRY.pop(name, None)
    loaded = 0
    for manifest in skill_loader.load_manifests():
        try:
            _register(skill_loader.build_tool_definition(manifest, source="skill-file"))
            loaded += 1
        except Exception:
            continue
    return {"loaded": loaded, "removed": len(stale)}
