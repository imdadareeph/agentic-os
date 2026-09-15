/**
 * Client-side quick gate for the tool router — a zero-RTT mirror of the
 * skip/execute regexes in runtime/tools/router.py. Most voice turns are plain
 * chat; paying a runtime round-trip (POST /api/tools/plan) on every one of
 * them just to hear "useTools: false" adds latency to the hot path for
 * nothing. This gate filters those turns locally; anything that passes still
 * goes through the server planner, which stays the source of truth for
 * candidate ranking.
 *
 * KEEP IN SYNC with _SKIP and _EXECUTE_WORDS in runtime/tools/router.py.
 * Divergence is safe in one direction only: a too-loose gate here just costs
 * the RTT it was meant to save; a too-tight gate silently disables tools.
 */

const SKIP =
  /^\s*(hi|hey|hello|stop|pause|resume|thanks|thank you|ok|okay|yes|no|bye|goodbye)\b/i

const EXECUTE_WORDS =
  /\b(run|execute|pull|fetch|check|metrics|status|search|look ?up|read|list|show|open|files?|folder|directory|git|docker|commits?|containers?|plan|research|report|briefing|save|write|remember|delete|commit|start|stop|launch)\b/i

/** True when the message could plausibly need a tool — worth the server plan RTT. */
export function mightNeedTools(userMessage: string): boolean {
  const msg = userMessage.trim()
  if (!msg || SKIP.test(msg)) return false
  return EXECUTE_WORDS.test(msg)
}
