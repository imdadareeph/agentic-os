import type { ConversationTurn } from '@/hooks/useRealtimeConversation'
import {
  buildChatMessages,
  buildSystemPrompt,
  effectiveMaxTokens,
} from '@/lib/jarvis-prompt'
import { chatWithOllama } from '@/services/ollama'
import { llmGenerate } from '@/services/voicebox'
import { getJarvisSettings } from '@/stores/jarvis-settings-store'
import { getVoiceSettings } from '@/stores/voice-settings-store'
import type { VitalsResponse } from '@/types/vitals'
import { speakText } from '@/services/voice'

export async function think(
  userMessage: string,
  history: ConversationTurn[] = [],
  vitals?: VitalsResponse | null
): Promise<string> {
  const settings = getJarvisSettings()
  const system = buildSystemPrompt(settings, vitals)
  const messages = buildChatMessages(history, userMessage, system)

  try {
    return await chatWithOllama({
      messages,
      model: settings.ollamaModel || undefined,
      temperature: settings.temperature,
      numPredict: effectiveMaxTokens(settings),
      think: settings.deepThinking,
    })
  } catch (ollamaErr) {
    const voiceSettings = getVoiceSettings()
    if (voiceSettings.voiceboxEnabled) {
      return llmGenerate(userMessage, system)
    }
    const message =
      ollamaErr instanceof Error ? ollamaErr.message : 'Ollama request failed'
    throw new Error(
      message.includes('Ollama') || message.includes('model') || message.includes('Deep thinking')
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
