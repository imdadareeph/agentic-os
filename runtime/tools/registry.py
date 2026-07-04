"""Tool registry — loads the T0 catalog at import time (TOOLS.md §4).

Skills/agents/MCP register dynamically in later phases; T0 is core-only.
"""

from __future__ import annotations

from tools.handlers import docker, filesystem, git, memory_tools, vitals
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


_load_core_catalog()
_load_local_catalog()


def get_catalog(enabled_only: bool = True, categories: list[str] | None = None) -> list[ToolDefinition]:
    tools = list(_REGISTRY.values())
    if enabled_only:
        tools = [t for t in tools if t.enabled]
    if categories is not None:
        allowed = set(categories)
        tools = [t for t in tools if t.category in allowed]
    return tools


def category_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    for t in _REGISTRY.values():
        counts[t.category] = counts.get(t.category, 0) + 1
    return counts


def get_tool(name: str) -> ToolDefinition | None:
    return _REGISTRY.get(name)


def tool_count() -> int:
    return len(_REGISTRY)
