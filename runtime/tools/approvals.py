"""Pending tool approvals (Phase T2, TOOLS.md §18).

A tool whose permission resolves to `ask` is not executed inline — a pending
approval is created and returned to the frontend, which shows a dialog and
POSTs the decision. Approvals expire after 5 minutes (then treated as denied).
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

TTL_S = 300.0  # 5-minute approval window


@dataclass
class Pending:
    approval_id: str
    tool_name: str
    args: dict[str, Any]
    session_id: str | None
    agent_id: str
    preview: str
    created_at: float
    status: str = "pending"  # pending | approved | denied | expired
    args_hash: int = field(default=0)


_pending: dict[str, Pending] = {}


def _prune() -> None:
    now = time.monotonic()
    for aid, p in list(_pending.items()):
        if p.status == "pending" and now - p.created_at > TTL_S:
            p.status = "expired"


def create(tool_name: str, args: dict, session_id: str | None, agent_id: str, preview: str) -> Pending:
    _prune()
    aid = str(uuid.uuid4())
    p = Pending(
        approval_id=aid,
        tool_name=tool_name,
        args=args,
        session_id=session_id,
        agent_id=agent_id,
        preview=preview,
        created_at=time.monotonic(),
        args_hash=hash(repr(sorted(args.items()))) if args else 0,
    )
    _pending[aid] = p
    return p


def get(approval_id: str) -> Pending | None:
    _prune()
    return _pending.get(approval_id)


def decide(approval_id: str, approved: bool) -> Pending | None:
    p = get(approval_id)
    if p is None or p.status not in ("pending",):
        return p
    p.status = "approved" if approved else "denied"
    return p


def clear(approval_id: str) -> None:
    _pending.pop(approval_id, None)
