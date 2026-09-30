import type { ConversationTurn } from '@/hooks/useRealtimeConversation'
import type { MemoryTurn } from '@/services/memory'

/** Map backend turns into LLM history shape (user/assistant only). */
export function memoryTurnsToConversationHistory(
  turns: MemoryTurn[]
): ConversationTurn[] {
  return turns
    .filter(t => t.role === 'user' || t.role === 'assistant')
    .map(t => ({
      id: t.id,
      role: t.role as 'user' | 'assistant',
      text: t.content,
      timestamp: t.createdAt ? Date.parse(t.createdAt) : Date.now(),
      refined: t.refined,
    }))
}

/**
 * Prefer in-memory turns; fall back to backend conversation when local state is
 * empty (MP0 — e.g. turnsRef lag before effect, or partial UI state).
 */
export function resolveConversationHistory(
  localTurns: ConversationTurn[],
  backendTurns: MemoryTurn[],
  maxTurnPairs: number
): ConversationTurn[] {
  if (maxTurnPairs <= 0) return []

  const cap = maxTurnPairs * 2
  const localSlice = localTurns.slice(-cap)
  if (localSlice.length > 0) return localSlice

  return memoryTurnsToConversationHistory(backendTurns).slice(-cap)
}
