import { fetchWithTimeout } from '@/lib/fetch'
import type { ChatOptions } from '@/services/llm/types'

const modelCache = new Map<string, string>()

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
      return cached ? [cached] : []
    }
    const data = (await res.json()) as { models?: { name: string }[] }
    const models = data.models?.map(m => m.name) ?? []
    if (models[0]) modelCache.set(baseUrl, models[0])
    return models
  } catch {
    const cached = modelCache.get(baseUrl)
    return cached ? [cached] : []
  }
}

export async function chatWithOllamaProvider(options: ChatOptions): Promise<string> {
  const { baseUrl } = options
  const selectedModel =
    options.model || modelCache.get(baseUrl) || (await getOllamaModels(baseUrl))[0]

  if (!selectedModel) {
    throw new Error('No Ollama models available — run `ollama serve` and pull a model')
  }
  modelCache.set(baseUrl, selectedModel)

  const body: Record<string, unknown> = {
    model: selectedModel,
    stream: false,
    messages: options.messages,
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

  const res = await fetchWithTimeout(
    `${baseUrl}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    120_000
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
