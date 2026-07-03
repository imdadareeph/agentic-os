import { getProviderDefinition, type AiProviderId } from '@/config/ai-providers'
import {
  getAiSettings,
  type AiProviderConfig,
} from '@/stores/ai-settings-store'
import { chatWithAnthropicProvider, checkAnthropicHealth } from '@/services/llm/anthropic'
import { chatWithGeminiProvider, checkGeminiHealth } from '@/services/llm/gemini'
import { chatWithOllamaProvider, checkOllamaHealth, getOllamaModels } from '@/services/llm/ollama'
import type { ChatOptions, ProviderHealth } from '@/services/llm/types'

export function getActiveProviderId(): AiProviderId {
  return getAiSettings().activeProvider
}

export function getActiveProviderLabel(): string {
  return getProviderDefinition(getActiveProviderId()).label
}

export async function chatWithActiveProvider(options: Omit<ChatOptions, 'baseUrl' | 'apiKey'>): Promise<string> {
  const settings = getAiSettings()
  const providerId = settings.activeProvider
  const config = settings.providers[providerId]

  if (!config.enabled) {
    throw new Error(`${getProviderDefinition(providerId).label} is disabled — enable it in AI Settings`)
  }

  const fullOptions: ChatOptions = {
    ...options,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: options.model || config.model || undefined,
  }

  switch (providerId) {
    case 'ollama':
      return chatWithOllamaProvider(fullOptions)
    case 'anthropic':
      return chatWithAnthropicProvider(fullOptions)
    case 'gemini':
      return chatWithGeminiProvider(fullOptions)
    default:
      throw new Error(`Unsupported provider: ${providerId satisfies never}`)
  }
}

export async function checkProviderHealth(
  providerId?: AiProviderId,
  config?: AiProviderConfig
): Promise<ProviderHealth> {
  const settings = getAiSettings()
  const id = providerId ?? settings.activeProvider
  const cfg = config ?? settings.providers[id]
  const def = getProviderDefinition(id)

  if (!cfg.enabled) {
    return { provider: id, online: false, error: `${def.label} disabled` }
  }

  if (def.requiresApiKey && !cfg.apiKey.trim()) {
    return { provider: id, online: false, error: 'API key required' }
  }

  try {
    let online = false
    switch (id) {
      case 'ollama':
        online = await checkOllamaHealth(cfg.baseUrl)
        break
      case 'anthropic':
        online = await checkAnthropicHealth(cfg.baseUrl, cfg.apiKey)
        break
      case 'gemini':
        online = await checkGeminiHealth(cfg.baseUrl, cfg.apiKey)
        break
    }

    let model = cfg.model || undefined
    if (id === 'ollama' && online && !model) {
      const models = await getOllamaModels(cfg.baseUrl)
      model = models[0]
    }

    return {
      provider: id,
      online,
      model,
      error: online ? undefined : `${def.label} unreachable`,
    }
  } catch (err) {
    return {
      provider: id,
      online: false,
      error: err instanceof Error ? err.message : 'Health check failed',
    }
  }
}

export async function checkActiveProviderHealth(): Promise<ProviderHealth> {
  return checkProviderHealth()
}

/** @deprecated Use getOllamaModels from llm/ollama with baseUrl */
export { getOllamaModels } from '@/services/llm/ollama'
