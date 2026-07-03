import { OLLAMA_BASE } from '@/config/services'
import type { OllamaChatMessage } from '@/lib/jarvis-prompt'
import {
  chatWithOllamaProvider,
  checkOllamaHealth as checkOllamaHealthAt,
  getOllamaModels as getOllamaModelsAt,
} from '@/services/llm/ollama'

export interface OllamaChatOptions {
  messages: OllamaChatMessage[]
  model?: string
  temperature?: number
  numPredict?: number
  think?: boolean
  baseUrl?: string
}

export async function checkOllamaHealth(baseUrl = OLLAMA_BASE): Promise<boolean> {
  return checkOllamaHealthAt(baseUrl)
}

export async function getOllamaModels(baseUrl = OLLAMA_BASE): Promise<string[]> {
  return getOllamaModelsAt(baseUrl)
}

export async function chatWithOllama(options: OllamaChatOptions): Promise<string> {
  return chatWithOllamaProvider({
    messages: options.messages,
    model: options.model,
    temperature: options.temperature,
    maxTokens: options.numPredict,
    think: options.think,
    baseUrl: options.baseUrl ?? OLLAMA_BASE,
  })
}
