import { DEFAULT_JARVIS_SYSTEM_PROMPT } from '@/config/services'

export type AiProviderId = 'ollama' | 'anthropic' | 'gemini'

export interface AiProviderDefinition {
  id: AiProviderId
  label: string
  requiresApiKey: boolean
  defaultUrl: string
  defaultModel: string
  defaultSystemInstructions: string
}

export const AI_PROVIDER_REGISTRY: AiProviderDefinition[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    requiresApiKey: false,
    defaultUrl: '/ollama',
    defaultModel: '',
    defaultSystemInstructions: DEFAULT_JARVIS_SYSTEM_PROMPT,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    requiresApiKey: true,
    defaultUrl: '/anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultSystemInstructions: DEFAULT_JARVIS_SYSTEM_PROMPT,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    requiresApiKey: true,
    defaultUrl: '/gemini',
    defaultModel: 'gemini-2.0-flash',
    defaultSystemInstructions: DEFAULT_JARVIS_SYSTEM_PROMPT,
  },
]

export const AI_PROVIDER_IDS = AI_PROVIDER_REGISTRY.map(p => p.id)

export function getProviderDefinition(id: AiProviderId): AiProviderDefinition {
  const def = AI_PROVIDER_REGISTRY.find(p => p.id === id)
  if (!def) throw new Error(`Unknown AI provider: ${id}`)
  return def
}
