"""Per-agent tool policy (Phase T4, TOOLS.md §10).

Scopes the catalog by agent_id so a research-session agent only sees its
allowed toolset, and the default jarvis agent keeps the full T0-T3 set.
Missing agent_id in the table means "no restriction" — new agent_ids aren't
accidentally locked out before someone defines a policy for them.
"""

from __future__ import annotations

AGENT_TOOL_POLICIES: dict[str, list[str]] = {
    "research": [
        "memory.search",
        "browser.search",
        "memory.episodic.write",
        "agent.research.run",
        "time.now",
    ],
}


def allowed_tools(agent_id: str, names: list[str]) -> list[str]:
    policy = AGENT_TOOL_POLICIES.get(agent_id)
    if policy is None:
        return names
    allowed = set(policy)
    return [n for n in names if n in allowed]
