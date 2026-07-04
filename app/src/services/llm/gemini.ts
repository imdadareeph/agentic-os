import { fetchWithTimeout, fetchWithTimeoutAndSignal } from '@/lib/fetch'
import type { ChatOptions } from '@/services/llm/types'

export async function checkGeminiHealth(baseUrl: string, apiKey: string): Promise<boolean> {
  if (!apiKey.trim()) return false
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      {},
      8000
    )
    return res.ok
  } catch {
    return false
  }
}

function toGeminiContents(messages: ChatOptions['messages']) {
  const contents: { role: string; parts: { text: string }[] }[] = []
  for (const msg of messages) {
    if (msg.role === 'system') continue
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    })
  }
  return contents
}

export async function chatWithGeminiProvider(options: ChatOptions): Promise<string> {
  const { baseUrl, apiKey, model } = options
  if (!apiKey?.trim()) {
    throw new Error('Gemini API key required — add it in AI Settings')
  }
  if (!model?.trim()) {
    throw new Error('Gemini model required — set model in AI Settings')
  }

  const systemParts = options.messages.filter(m => m.role === 'system')
  const contents = toGeminiContents(options.messages)

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: options.maxTokens ?? 1024,
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
    },
  }

  if (systemParts.length > 0) {
    body.systemInstruction = {
      parts: [{ text: systemParts.map(m => m.content).join('\n\n') }],
    }
  }

  const modelPath = model.startsWith('models/') ? model : `models/${model}`
  const url = `${baseUrl}/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`

  const res = await fetchWithTimeoutAndSignal(
    url,
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
    throw new Error(`Gemini chat failed: ${err}`)
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  if (!text) {
    throw new Error('Gemini returned an empty response')
  }
  return text
}
