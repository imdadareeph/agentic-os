"""Permission Agent (Phase T2, TOOLS.md §6.2/§8/§9) — allow | ask | deny.

Three inputs decide: the tool's declared permission, the user's posture
(cautious | balanced | trusted), and — for terminal.run — a hard deny-list of
destructive command patterns that NO posture can override.

Security note: the deny-list is defense-in-depth. terminal.py enforces it again
at execution time, so a bypass here still can't run a denied command.
"""

from __future__ import annotations

import re

from tools.schemas import PermissionLevel, ToolDefinition

Posture = str  # "cautious" | "balanced" | "trusted"

# Commands that are NEVER allowed, regardless of posture or approval.
_DESTRUCTIVE = [
    re.compile(r"\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b", re.I),  # rm -rf / -fr
    re.compile(r"\bmkfs\b", re.I),
    re.compile(r"\bdd\b.*\bof=", re.I),
    re.compile(r">\s*/dev/(sd|nvme|disk|hd)", re.I),
    re.compile(r"\bchmod\s+-R\s+777\b", re.I),
    re.compile(r":\(\)\s*\{.*\};\s*:", re.S),        # fork bomb
    re.compile(r"\bcurl\b[^\n|]*\|\s*(sh|bash|zsh)\b", re.I),  # curl | sh
    re.compile(r"\bwget\b[^\n|]*\|\s*(sh|bash|zsh)\b", re.I),
    re.compile(r"\bshutdown\b|\breboot\b|\bhalt\b", re.I),
    re.compile(r"\bgit\s+push\b.*(--force|-f\b)", re.I),
]

# In cautious posture only these (read-only) terminal commands are allowed.
_CAUTIOUS_ALLOWLIST = re.compile(
    r"^\s*(ls|cat|pwd|echo|git\s+status|git\s+log|git\s+diff|docker\s+ps|uname|whoami|date)\b",
    re.I,
)


def is_destructive_command(command: str) -> bool:
    return any(p.search(command or "") for p in _DESTRUCTIVE)


def check(tool: ToolDefinition, args: dict, posture: Posture = "balanced") -> PermissionLevel:
    # Declared deny wins outright.
    if tool.permission == "deny":
        return "deny"

    # terminal.run: destructive patterns are always denied; cautious restricts to
    # a read-only allowlist; otherwise it needs approval.
    if tool.name == "terminal.run":
        command = str(args.get("command", ""))
        if is_destructive_command(command):
            return "deny"
        if posture == "cautious":
            return "allow" if _CAUTIOUS_ALLOWLIST.match(command) else "deny"
        return "ask"

    if tool.permission == "allow":
        return "allow"

    # tool.permission == "ask" (mutating): trusted posture pre-approves; others ask.
    if posture == "trusted":
        return "allow"
    return "ask"
