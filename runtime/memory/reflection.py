"""Deterministic turn reflection — MEMORY_DECISION.md Stages 5-8.

Plugs into the idle worker's dirty-turn pass (memory/jobs.py). Classifies a
turn, scores its importance (0-10), and maps that to a memory decision, then
records the result in `memory_reflections`. High-importance turns are promoted
to episodic vault notes.

No LLM here: the job runs under a strict daily time budget (jobs.Budget), so
classification/scoring stay rule-based. LLM-backed extraction agents
(MEMORY_DECISION.md Stage 8) can layer on later without changing this contract.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone

import aiosqlite

from memory import episodic

# --- Stage 5: Classification -------------------------------------------------

_GREETING = re.compile(r"^\s*(hi|hey|hello|yo|thanks|thank you|ok|okay|bye|good (morning|night))\b", re.I)
_TEMPORARY = re.compile(r"\b(weather|what time|today'?s date|how are you)\b", re.I)
_DECISION = re.compile(
    r"\b(use|switch|migrate|move to|go with|choose|choos|decide|decided|instead of|rather than|let'?s use)\b",
    re.I,
)
_ARCHITECTURE = re.compile(
    r"\b(architecture|backend|database|framework|rust|python|schema|infra|stack|microservice|api design)\b",
    re.I,
)
_TASK = re.compile(
    r"\b(create|build|implement|add|fix|set ?up|make|write|refactor|deploy|generate|configure|install)\b",
    re.I,
)
_QUESTION = re.compile(r"\?|\b(how|what|why|where|when|which|who|can you|does|is it|should)\b", re.I)
_PREFERENCE = re.compile(r"\b(i prefer|i like|i want|i'?d rather|always|never|please always)\b", re.I)


def classify(content: str) -> list[str]:
    text = (content or "").strip()
    if not text:
        return ["temporary"]
    if _GREETING.match(text) or _TEMPORARY.search(text):
        return ["greeting"]
    out: list[str] = []
    if _DECISION.search(text):
        out.append("decision")
        if _ARCHITECTURE.search(text):
            out.append("architecture")
    if _TASK.search(text):
        out.append("task")
    if _PREFERENCE.search(text):
        out.append("preference")
    if _QUESTION.search(text):
        out.append("question")
    if not out:
        out.append("fact")
    return out


# --- Stage 6: Importance (0-10) ---------------------------------------------

def importance(content: str, classifications: list[str]) -> int:
    c = set(classifications)
    if "greeting" in c:
        return 1
    score = 0
    if "decision" in c:
        score = max(score, 9)
        if "architecture" in c:
            score = 10
    if "preference" in c:
        score = max(score, 7)
    if "task" in c:
        score = max(score, 6)
    if "fact" in c:
        score = max(score, 4)
    if "question" in c:
        score = max(score, 3)
    # Length/uniqueness nudge for substantive statements.
    if len((content or "")) > 200 and score < 10:
        score += 1
    return max(0, min(10, score))


# --- Stage 7: Memory Decision (Importance Levels table) ---------------------

def decide(score: int) -> str:
    if score <= 0:
        return "ignore"
    if score <= 2:
        return "session"
    if score <= 4:
        return "short_term"
    if score <= 6:
        return "episode"
    if score <= 8:
        return "long_term"
    return "permanent"


# --- persistence + promotion ------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_PROMOTE = {"long_term", "permanent"}


async def reflect_on_turn(conn: aiosqlite.Connection, turn: dict) -> dict:
    """Classify + score + decide a single turn; record it; promote if important.

    `turn` is a row from conversation.dirty_turns: {id, session_id, role, content}.
    Returns the reflection summary dict. Never raises (idle worker swallows anyway).
    """
    content = turn.get("content", "")
    classes = classify(content)
    score = importance(content, classes)
    decision = decide(score)

    await conn.execute(
        """INSERT OR REPLACE INTO memory_reflections
             (id, turn_id, session_id, role, classifications, importance, decision, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            str(uuid.uuid4()),
            turn.get("id"),
            turn.get("session_id"),
            turn.get("role"),
            json.dumps(classes),
            score,
            decision,
            _now(),
        ),
    )
    await conn.commit()

    if decision in _PROMOTE:
        title = " ".join(content.split()[:8]) or "reflection"
        body = f"## Reflection\n{content}\n\n- classifications: {', '.join(classes)}\n- importance: {score}\n- decision: {decision}"
        try:
            await episodic.write_note(
                title,
                body,
                agent_id="jarvis",
                session_id=turn.get("session_id", "") or "",
                tags=["reflection", *classes],
            )
        except Exception:
            pass  # note is best-effort; the reflection row is the source of truth

    return {"turn_id": turn.get("id"), "classifications": classes, "importance": score, "decision": decision}
