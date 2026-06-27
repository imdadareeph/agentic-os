import { JARVIS_SYSTEM_PROMPT } from '@/config/services'
import { getVoiceSettings } from '@/stores/voice-settings-store'
import { chatWithOllama } from '@/services/ollama'
import { speakText } from '@/services/voice'
import { llmGenerate } from '@/services/voicebox'

export async function think(userMessage: string): Promise<string> {
  try {
    return await chatWithOllama(userMessage, JARVIS_SYSTEM_PROMPT)
  } catch (ollamaErr) {
    const settings = getVoiceSettings()
    if (settings.voiceboxEnabled) {
      return llmGenerate(userMessage, JARVIS_SYSTEM_PROMPT)
    }
    const message =
      ollamaErr instanceof Error ? ollamaErr.message : 'Ollama request failed'
    throw new Error(
      message.includes('Ollama') || message.includes('model')
        ? message
        : `No LLM available — ${message}`
    )
  }
}

export async function respondWithVoice(userMessage: string): Promise<string> {
  const reply = await think(userMessage)
  const settings = getVoiceSettings()
  await speakText(reply, settings.voiceboxProfile)
  return reply
}
