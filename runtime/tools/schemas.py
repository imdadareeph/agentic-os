"""Tool registry types (Phase T0) — TOOLS.md §4.1, §7."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal

import aiosqlite

ToolCategory = Literal[
    "memory", "system", "filesystem", "git", "docker", "browser", "mcp", "skill"
]
PermissionLevel = Literal["allow", "ask", "deny"]
LatencyClass = Literal["fast", "slow"]


@dataclass
class ToolContext:
    """Per-call context handed to a handler — never the raw request."""

    db: aiosqlite.Connection
    session_id: str | None = None
    agent_id: str = "jarvis"
    # T1 filesystem allowlist; None -> handler defaults (repo root + ~/jarvis).
    allowed_paths: list[str] | None = None


ToolHandler = Callable[[dict[str, Any], ToolContext], Awaitable[dict[str, Any]]]


@dataclass
class ToolDefinition:
    """Declarative record + handler (TOOLS.md §4.1)."""

    name: str
    title: str
    description: str
    category: ToolCategory
    parameters: dict[str, Any]
    permission: PermissionLevel
    latency_class: LatencyClass
    handler: ToolHandler
    enabled: bool = True
    source: str = "core"

    def to_anthropic_schema(self) -> dict[str, Any]:
        """LLM-facing schema (TOOLS.md §7) — no secrets, no handler leakage."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters,
        }

    def to_public_dict(self) -> dict[str, Any]:
        """Catalog entry for the frontend — omits the handler callable."""
        return {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "permission": self.permission,
            "latencyClass": self.latency_class,
            "enabled": self.enabled,
            "source": self.source,
        }


@dataclass
class ToolResult:
    ok: bool
    data: Any | None = None
    error: str | None = None
    # T2: set when a mutating tool needs user approval before it will run.
    needs_approval: bool = False
    approval_id: str | None = None
    preview: str | None = None
    tool_name: str | None = None


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict[str, Any] = field(default_factory=dict)
