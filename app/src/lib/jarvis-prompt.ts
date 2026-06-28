import type { ConversationTurn } from '@/hooks/useRealtimeConversation'
import type { JarvisSettings } from '@/stores/jarvis-settings-store'
import type { VitalsResponse } from '@/types/vitals'

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const PERSONALITY_MODIFIERS: Record<JarvisSettings['personality'], string> = {
  default: '',
  technical:
    'Use precise, technical language. Prefer accurate terminology for code, AI, and systems.',
  casual: 'Keep a relaxed, friendly tone while staying helpful.',
  executive:
    'Respond like an executive briefing: lead with the key point, then supporting detail.',
}

const FORMALITY_MODIFIERS: Record<JarvisSettings['formality'], string> = {
  neutral: '',
  formal: 'Address the user formally and professionally.',
  first_name: 'Use a warm, approachable tone as if speaking to a trusted colleague.',
}

function formatVitalsBlock(vitals: VitalsResponse): string {
  const parts = vitals.vitals.map(v => `${v.label}: ${v.value}${v.live ? '' : ' (offline)'}`)
  return `Live mission control vitals: ${parts.join(' | ')}`
}

export function effectiveMaxTokens(settings: JarvisSettings): number {
  if (settings.shortAnswers) {
    return Math.min(settings.maxTokens, 150)
  }
  return settings.maxTokens
}

export function buildSystemPrompt(
  settings: JarvisSettings,
  vitals?: VitalsResponse | null
): string {
  const blocks: string[] = [settings.systemInstructions.trim()]

  if (settings.shortAnswers) {
    blocks.push(
      'Respond in at most 1–2 short sentences suitable for speech. No markdown or bullet lists unless asked.'
    )
  } else {
    blocks.push('Answer thoroughly when the question warrants detail.')
  }

  const personality = PERSONALITY_MODIFIERS[settings.personality]
  if (personality) blocks.push(personality)

  const formality = FORMALITY_MODIFIERS[settings.formality]
  if (formality) blocks.push(formality)

  if (settings.deepThinking) {
    blocks.push(
      'Reason carefully before answering. Speak only the final answer — never read chain-of-thought aloud.'
    )
  }

  if (settings.injectVitalsContext && vitals && vitals.vitals.length > 0) {
    blocks.push(formatVitalsBlock(vitals))
  }

  return blocks.filter(Boolean).join('\n\n')
}

export function buildChatMessages(
  history: ConversationTurn[],
  userMessage: string,
  system: string
): OllamaChatMessage[] {
  const messages: OllamaChatMessage[] = [{ role: 'system', content: system }]

  for (const turn of history) {
    messages.push({
      role: turn.role === 'user' ? 'user' : 'assistant',
      content: turn.text,
    })
  }

  messages.push({ role: 'user', content: userMessage })
  return messages
}

export function isReasoningModelName(model: string): boolean {
  return /deepseek-r1|qwen3|qwq|reason|think/i.test(model)
}
