import { fetchWithTimeout, fetchWithTimeoutAndSignal } from '@/lib/fetch'
import type { ChatOptions } from '@/services/llm/types'

const modelCache = new Map<string, string>()

/** Models that only support /api/embeddings — never use for /api/chat. */
export function isOllamaEmbedModel(name: string): boolean {
  const id = name.split(':')[0].toLowerCase()
  return (
    id.includes('embed') ||
    id.startsWith('bge-') ||
    id.startsWith('all-minilm') ||
    id.startsWith('snowflake-arctic-embed')
  )
}

function pickChatModel(models: string[], preferred?: string): string | undefined {
  const chat = models.filter(m => !isOllamaEmbedModel(m))
  if (preferred && !isOllamaEmbedModel(preferred)) {
    if (chat.includes(preferred)) return preferred
    const prefix = chat.find(m => m === preferred || m.startsWith(`${preferred}:`))
    if (prefix) return prefix
  }
  return chat[0]
}

export async function checkOllamaHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/tags`, {}, 3000)
    return res.ok
  } catch {
    return false
  }
}

export async function getOllamaModels(baseUrl = '/ollama'): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/tags`, {}, 5000)
    if (!res.ok) {
      const cached = modelCache.get(baseUrl)
      return cached && !isOllamaEmbedModel(cached) ? [cached] : []
    }
    const data = (await res.json()) as { models?: { name: string }[] }
    const chatModels =
      data.models?.map(m => m.name).filter(m => !isOllamaEmbedModel(m)) ?? []
    const first = chatModels[0]
    if (first) modelCache.set(baseUrl, first)
    return chatModels
  } catch {
    const cached = modelCache.get(baseUrl)
    return cached && !isOllamaEmbedModel(cached) ? [cached] : []
  }
}

export async function chatWithOllamaProvider(options: ChatOptions): Promise<string> {
  const { baseUrl } = options
  const listed = await getOllamaModels(baseUrl)
  const cached = modelCache.get(baseUrl)
  const selectedModel = pickChatModel(
    listed,
    options.model && !isOllamaEmbedModel(options.model)
      ? options.model
      : cached && !isOllamaEmbedModel(cached)
        ? cached
        : undefined
  )

  if (!selectedModel) {
    throw new Error(
      'No chat-capable Ollama model available — run `ollama pull llama3.2` (embed models like nomic-embed-text cannot chat)'
    )
  }
  modelCache.set(baseUrl, selectedModel)

  const body: Record<string, unknown> = {
    model: selectedModel,
    stream: false,
    messages: options.messages,
    // Without this Ollama's default 5-minute keep_alive evicts the model
    // between conversational turns, and the next turn pays a ~20s+ cold
    // reload for a multi-GB model — same fix as memory/embedder.py's
    // KEEP_ALIVE for the (much smaller) embedding model.
    keep_alive: '30m',
  }

  if (options.think) {
    body.think = true
  }

  const ollamaOptions: Record<string, number> = {}
  if (options.temperature != null) {
    ollamaOptions.temperature = options.temperature
  }
  if (options.maxTokens != null) {
    ollamaOptions.num_predict = options.maxTokens
  }
  if (Object.keys(ollamaOptions).length > 0) {
    body.options = ollamaOptions
  }

  const res = await fetchWithTimeoutAndSignal(
    `${baseUrl}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    120_000,
    options.signal
  )

  if (!res.ok) {
    const err = await res.text()
    if (options.think && /think|reasoning|unsupported/i.test(err)) {
      throw new Error(
        'Deep thinking requires a reasoning model (e.g. deepseek-r1, qwen3) — change model in AI Settings'
      )
    }
    throw new Error(`Ollama chat failed: ${err}`)
  }

  const data = (await res.json()) as {
    message?: { content?: string }
  }
  const content = data.message?.content?.trim() ?? ''
  if (!content) {
    throw new Error('Ollama returned an empty response — try again or pick another model')
  }
  return content
}
