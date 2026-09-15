"""Tool Router — keyword/regex intent gating (TOOLS.md §6.1). Not an LLM call."""

from __future__ import annotations

import re

from tools.schemas import ToolDefinition

# execute_tool triggers — TOOLS.md §11 scope note.
_EXECUTE_WORDS = re.compile(
    r"\b(run|execute|pull|fetch|check|metrics|status|search|look ?up|read|list|show|open|files?|folder|directory|git|docker|commits?|containers?"
    r"|plan|research|report|briefing|save|write|remember|delete|commit|start|stop|launch)\b",
    re.IGNORECASE,
)
# Never enter the tool loop for these.
_SKIP = re.compile(
    r"^\s*(hi|hey|hello|stop|pause|resume|thanks|thank you|ok|okay|yes|no|bye|goodbye)\b",
    re.IGNORECASE,
)

_MAX_CANDIDATES = 8

# Keyword hints per tool — cheap ranking without an LLM round-trip.
_TOOL_KEYWORDS: dict[str, list[str]] = {
    "vitals.fetch": ["vitals", "metrics", "youtube", "instagram", "subscribers", "views", "ollama status"],
    "memory.search": ["search", "find", "look up", "recall", "remember", "notes"],
    "memory.retrieve": ["retrieve", "conversation history", "earlier", "context"],
    "system.status": ["system status", "runtime status", "health", "is everything running"],
    "time.now": ["time", "what time", "date", "timezone"],
    "filesystem.read": ["read file", "open file", "show me the file", "contents of", "cat "],
    "filesystem.list": ["list", "what's in", "whats in", "folder", "directory", "files in"],
    "git.status": ["git status", "working tree", "uncommitted", "what changed"],
    "git.log": ["git log", "recent commits", "commit history", "last commits"],
    "docker.ps": ["docker", "containers", "running containers", "docker ps"],
    "terminal.run": ["terminal", "shell", "run command", "run a command", "execute command", "run script"],
    "git.commit": ["commit", "git commit", "save changes to git"],
    "docker.run": ["start container", "docker run", "launch container"],
    "docker.stop": ["stop container", "docker stop", "kill container"],
    "filesystem.write": ["write file", "save file", "create file", "write to file"],
    "filesystem.delete": ["delete file", "remove file"],
    "memory.episodic.write": ["save note", "write note", "remember this", "save to vault"],
    "skill.plan_today": ["plan today", "plan for today", "today's plan", "what's on today"],
    "skill.am_report": ["morning report", "am report", "morning briefing"],
    "agent.research.run": ["research", "look into", "find out about", "dig into"],
}


def _score(tool_name: str, message: str) -> int:
    msg = message.lower()
    return sum(1 for kw in _TOOL_KEYWORDS.get(tool_name, []) if kw in msg)


def plan(user_message: str, catalog: list[ToolDefinition]) -> dict:
    """Returns { useTools, candidates, intent } — deterministic, zero extra LLM call."""
    msg = user_message.strip()
    if not msg or _SKIP.match(msg):
        return {"useTools": False, "candidates": [], "intent": "chat"}

    if not _EXECUTE_WORDS.search(msg):
        return {"useTools": False, "candidates": [], "intent": "chat"}

    ranked = sorted(
        (t.name for t in catalog if t.enabled),
        key=lambda name: _score(name, msg),
        reverse=True,
    )
    candidates = [name for name in ranked if _score(name, msg) > 0][:_MAX_CANDIDATES]
    if not candidates:
        # Execute-intent word matched but no tool keyword scored. Offering the
        # full fast catalog here (old behavior) made near-every chat message a
        # tool-loop turn on Ollama — multi-turn tool calls on small local models
        # cost seconds, then often degraded to a SECOND full LLM call. A missed
        # tool costs a keyword hint in _TOOL_KEYWORDS; a false positive costs
        # every user seconds of voice latency. Skip.
        return {"useTools": False, "candidates": [], "intent": "chat"}

    return {"useTools": True, "candidates": candidates, "intent": "execute_tool"}
