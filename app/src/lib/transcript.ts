import type { ConversationTurn } from '@/hooks/useRealtimeConversation'

export interface ConversationWindow {
  startedAt: number // ms epoch, turns[0].timestamp
  endedAt: number // ms epoch, turns.at(-1).timestamp
}

/** null iff turns is empty — the single source of truth for "no transcript, no banner." */
export function getConversationWindow(turns: ConversationTurn[]): ConversationWindow | null {
  if (turns.length === 0) return null
  return { startedAt: turns[0].timestamp, endedAt: turns[turns.length - 1].timestamp }
}

export function formatConversationTranscript(
  turns: ConversationTurn[],
  window: ConversationWindow
): string {
  const fmt = (ms: number) => new Date(ms).toLocaleString()
  const header = `**Start:** ${fmt(window.startedAt)}\n**End:** ${fmt(window.endedAt)}\n`
  const body = turns
    .map(t => {
      const hhmmss = new Date(t.timestamp).toLocaleTimeString([], { hour12: false })
      const speaker = t.role === 'user' ? '**You**' : '**JARVIS**'
      return `${speaker} (${hhmmss}): ${t.text}`
    })
    .join('\n\n')
  return `${header}\n---\n\n${body}`
}

/** Mirrors the existing title-derivation pattern in useRealtimeConversation.ts. */
export function deriveConversationTitle(turns: ConversationTurn[]): string {
  const firstUser = turns.find(t => t.role === 'user')?.text ?? turns[0]?.text ?? 'Conversation'
  return firstUser.split(/\s+/).slice(0, 8).join(' ')
}
