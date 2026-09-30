/**
 * Local mirror of runtime/memory/orchestrator.py `should_retrieve` (MP2).
 * Cheap gate for interim STT — no network, no Chroma.
 */

const QUESTION_WORDS =
  /\b(how|what|why|where|which|explain|show|remind|recall)\b/i
const PAST_REFERENCE =
  /\b(last time|earlier|before|previously|that note|we set up|we did|remember)\b/i
const INTENT_WORDS =
  /\b(setup|set up|configure|install|research|decide|decision|document)\b/i
const SKIP =
  /^\s*(hi|hey|hello|stop|pause|resume|thanks|thank you|ok|okay|yes|no)\b/i

/** True when a semantic memory lookup is worth starting (matches orchestrator). */
export function shouldRetrieveMemory(userMessage: string): boolean {
  const msg = userMessage.trim()
  if (!msg || SKIP.test(msg)) return false
  return (
    QUESTION_WORDS.test(msg) ||
    PAST_REFERENCE.test(msg) ||
    INTENT_WORDS.test(msg)
  )
}
