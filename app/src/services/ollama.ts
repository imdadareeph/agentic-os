import { OLLAMA_BASE } from '@/config/services'
import { fetchWithTimeout } from '@/lib/fetch'
import type { OllamaChatMessage } from '@/lib/jarvis-prompt'

let cachedModel: string | null = null

export interface OllamaChatOptions {
  messages: OllamaChatMessage[]
  model?: string
  temperature?: number
  numPredict?: number
  think?: boolean
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${OLLAMA_BASE}/api/tags`, {}, 3000)
    return res.ok
  } catch {
    return false
  }
}

export async function getOllamaModels(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${OLLAMA_BASE}/api/tags`, {}, 5000)
    if (!res.ok) return cachedModel ? [cachedModel] : []
    const data = (await res.json()) as { models?: { name: string }[] }
    const models = data.models?.map(m => m.name) ?? []
    if (models[0]) cachedModel = models[0]
    return models
  } catch {
    return cachedModel ? [cachedModel] : []
  }
}

export async function chatWithOllama(options: OllamaChatOptions): Promise<string> {
  const selectedModel =
    options.model || cachedModel || (await getOllamaModels())[0]
  if (!selectedModel) {
    throw new Error('No Ollama models available — run `ollama serve` and pull a model')
  }
  cachedModel = selectedModel

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
  if (options.numPredict != null) {
    ollamaOptions.num_predict = options.numPredict
  }
  if (Object.keys(ollamaOptions).length > 0) {
    body.options = ollamaOptions
  }

  const res = await fetchWithTimeout(
    `${OLLAMA_BASE}/api/chat`,
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
        'Deep thinking requires a reasoning model (e.g. deepseek-r1, qwen3) — change model in JARVIS Settings'
      )
    }
    throw new Error(`Ollama chat failed: ${err}`)
  }

  const data = (await res.json()) as {
    message?: { content?: string; thinking?: string }
  }
  const content = data.message?.content?.trim() ?? ''
  if (!content) {
    throw new Error('Ollama returned an empty response — try again or pick another model')
  }
  return content
}
