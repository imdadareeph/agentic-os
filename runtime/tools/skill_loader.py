"""Skill manifest loader (Phase T4, TOOLS.md §10).

Reads YAML/JSON manifests from ~/jarvis/skills/ (falling back to the repo's
.cursor/skills/ for local dev) and turns each into a `skill.{id}` tool.
Malformed manifests are skipped, never raised — same graceful-degradation
contract as memory/obsidian_config.py and tools/mcp_config.py.

Invoking a manifest-driven skill tool does NOT call an LLM itself (a handler
has no API credentials) — it hands back `{instructions, allowedTools}` as a
tool_result, so the *same* outer tool loop (which already has credentials)
reads the skill's prompt and continues calling the listed tools in its
remaining turns. This is why skill.* tools are latency_class=fast: the
handler itself does no work, it just expands into instructions.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import yaml

from tools.schemas import ToolContext, ToolDefinition

SKILLS_DIR = Path(
    os.environ.get("JARVIS_SKILLS_DIR", str(Path.home() / "jarvis" / "skills"))
).expanduser()
# Repo-relative fallback for local dev when ~/jarvis/skills doesn't exist yet.
_REPO_FALLBACK = Path(__file__).resolve().parent.parent.parent / ".cursor" / "skills"

REQUIRED_FIELDS = ("id", "title", "tools", "prompt")


def _skills_dir() -> Path:
    if SKILLS_DIR.is_dir():
        return SKILLS_DIR
    return _REPO_FALLBACK


def _parse_manifest(path: Path) -> dict[str, Any] | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    try:
        data = yaml.safe_load(text) if path.suffix in (".yaml", ".yml") else json.loads(text)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    if not all(k in data for k in REQUIRED_FIELDS):
        return None
    if not isinstance(data.get("tools"), list):
        return None
    return data


def load_manifests() -> list[dict[str, Any]]:
    """Return every valid skill manifest found on disk. Never raises."""
    base = _skills_dir()
    if not base.is_dir():
        return []
    manifests: list[dict[str, Any]] = []
    for pattern in ("*.yaml", "*.yml", "*.json"):
        for path in sorted(base.glob(pattern)):
            manifest = _parse_manifest(path)
            if manifest:
                manifests.append(manifest)
    return manifests


def build_tool_definition(manifest: dict[str, Any], source: str = "skill-file") -> ToolDefinition:
    """Build a ToolDefinition from a validated manifest dict. Raises on missing fields —
    callers (registration endpoints) are expected to catch and report the error."""
    skill_id = str(manifest["id"])
    prompt = str(manifest["prompt"])
    allowed_tools = [str(t) for t in manifest.get("tools", [])]
    title = str(manifest.get("title", skill_id))
    description = str(manifest.get("description") or prompt[:200])

    async def _handler(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        return {"skillId": skill_id, "instructions": prompt, "allowedTools": allowed_tools}

    return ToolDefinition(
        name=f"skill.{skill_id}",
        title=title,
        description=description,
        category="skill",
        parameters={"type": "object", "properties": {}},
        permission="allow",
        latency_class="fast",
        handler=_handler,
        source=source,
    )
