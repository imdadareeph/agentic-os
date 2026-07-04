"""Format retrieved memory for the LLM system prompt (Phase M2, memory.md §8)."""

from __future__ import annotations


def build_context_block(semantic_hits: list[dict]) -> str:
    if not semantic_hits:
        return ""
    lines = ["## Retrieved Memory",
             "Use the following only if relevant. Do not mention retrieval unless asked.",
             ""]
    for hit in semantic_hits:
        path = hit.get("path", "note")
        score = hit.get("score", 0.0)
        text = (hit.get("text") or "").strip()
        lines.append(f"**{path}** (score {score})")
        lines.append(f"> {text}")
        lines.append("")
    return "\n".join(lines).strip()
