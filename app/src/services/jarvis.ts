import type { ConversationTurn } from '@/hooks/useRealtimeConversation'
import {
  buildChatMessages,
  buildSystemPrompt,
  effectiveMaxTokens,
} from '@/lib/jarvis-prompt'
import { chatWithActiveProvider } from '@/services/llm/router'
import { llmGenerate } from '@/services/voicebox'
import { getJarvisSettings } from '@/stores/jarvis-settings-store'
import { getVoiceSettings } from '@/stores/voice-settings-store'
import type { VitalsResponse } from '@/types/vitals'
import { speakText } from '@/services/voice'

export async function think(
  userMessage: string,
  history: ConversationTurn[] = [],
  vitals?: VitalsResponse | null,
  signal?: AbortSignal
): Promise<string> {
  const settings = getJarvisSettings()
  const system = buildSystemPrompt(settings, vitals)
  const messages = buildChatMessages(history, userMessage, system)

  try {
    return await chatWithActiveProvider({
      messages,
      temperature: settings.temperature,
      maxTokens: effectiveMaxTokens(settings),
      think: settings.deepThinking,
      signal,
    })
  } catch (providerErr) {
    const voiceSettings = getVoiceSettings()
    if (voiceSettings.voiceboxEnabled) {
      return llmGenerate(userMessage, system)
    }
    const message =
      providerErr instanceof Error ? providerErr.message : 'LLM request failed'
    throw new Error(
      message.includes('model') || message.includes('Deep thinking') || message.includes('API key')
        ? message
        : `No LLM available — ${message}`
    )
  }
}

export async function respondWithVoice(
  userMessage: string,
  history: ConversationTurn[] = [],
  vitals?: VitalsResponse | null
): Promise<string> {
  const reply = await think(userMessage, history, vitals)
  const settings = getVoiceSettings()
  await speakText(reply, settings.voiceboxProfile)
  return reply
}
