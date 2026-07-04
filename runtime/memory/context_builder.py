"""Format retrieved memory for the LLM system prompt (Phase M2, memory.md §8).

Budget-aware (Memory Budget settings):
- ``max_memories``  caps how many hits are injected (highest score first).
- ``max_tokens``    caps the total injected size; lowest-score chunks are dropped
  first until the block fits (~4 chars/token approximation, no tokenizer dep).
"""

from __future__ import annotations

# Rough chars-per-token used to keep the block inside sessionContextTokens without
# pulling in a tokenizer. Deliberately conservative.
_CHARS_PER_TOKEN = 4


def build_context_block(
    semantic_hits: list[dict],
    max_memories: int | None = None,
    max_tokens: int | None = None,
) -> str:
    if not semantic_hits:
        return ""

    # Highest score first, then apply the count cap (primary retrieve cap).
    hits = sorted(semantic_hits, key=lambda h: h.get("score", 0.0), reverse=True)
    if max_memories is not None and max_memories >= 0:
        hits = hits[:max_memories]

    header = [
        "## Retrieved Memory",
        "Use the following only if relevant. Do not mention retrieval unless asked.",
        "",
    ]
    char_budget = max_tokens * _CHARS_PER_TOKEN if max_tokens else None
    used = len("\n".join(header))

    lines = list(header)
    for hit in hits:
        path = hit.get("path", "note")
        score = hit.get("score", 0.0)
        text = (hit.get("text") or "").strip()
        entry = f"**{path}** (score {score})\n> {text}\n"
        # Drop lowest-score chunks (we're already iterating high->low) once full.
        if char_budget is not None and used + len(entry) > char_budget and len(lines) > len(header):
            break
        lines.append(entry)
        used += len(entry)

    block = "\n".join(lines).strip()
    # Nothing but the header survived the token budget — inject nothing.
    return "" if block == "\n".join(header).strip() else block
