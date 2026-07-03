import type { AiProviderId } from '@/config/ai-providers'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  think?: boolean
  baseUrl: string
  apiKey?: string
}

export interface ProviderHealth {
  provider: AiProviderId
  online: boolean
  model?: string
  error?: string
}
