import { OLLAMA_BASE, JARVIS_SYSTEM_PROMPT } from '@/config/services'
import { fetchWithTimeout } from '@/lib/fetch'

let cachedModel: string | null = null

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

export async function chatWithOllama(
  userMessage: string,
  system = JARVIS_SYSTEM_PROMPT,
  model?: string
): Promise<string> {
  const selectedModel = model ?? cachedModel ?? (await getOllamaModels())[0]
  if (!selectedModel) {
    throw new Error('No Ollama models available — run `ollama serve` and pull a model')
  }
  cachedModel = selectedModel

  const res = await fetchWithTimeout(
    `${OLLAMA_BASE}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selectedModel,
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage },
        ],
      }),
    },
    120_000
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Ollama chat failed: ${err}`)
  }

  const data = (await res.json()) as { message?: { content: string } }
  const content = data.message?.content?.trim() ?? ''
  if (!content) {
    throw new Error('Ollama returned an empty response — try again or pick another model')
  }
  return content
}
