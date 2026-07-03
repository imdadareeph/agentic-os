import { fetchWithTimeout } from '@/lib/fetch'
import type { ChatOptions } from '@/services/llm/types'

export async function checkAnthropicHealth(
  baseUrl: string,
  apiKey: string
): Promise<boolean> {
  if (!apiKey.trim()) return false
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      },
      8000
    )
    return res.ok || res.status === 400
  } catch {
    return false
  }
}

export async function chatWithAnthropicProvider(options: ChatOptions): Promise<string> {
  const { baseUrl, apiKey, model } = options
  if (!apiKey?.trim()) {
    throw new Error('Anthropic API key required — add it in AI Settings')
  }
  if (!model?.trim()) {
    throw new Error('Anthropic model required — set model in AI Settings')
  }

  const systemParts = options.messages.filter(m => m.role === 'system')
  const chatMessages = options.messages.filter(m => m.role !== 'system')

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens ?? 1024,
    messages: chatMessages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  }

  if (systemParts.length > 0) {
    body.system = systemParts.map(m => m.content).join('\n\n')
  }

  if (options.temperature != null) {
    body.temperature = options.temperature
  }

  const res = await fetchWithTimeout(
    `${baseUrl}/v1/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    },
    120_000
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic chat failed: ${err}`)
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[]
  }
  const text = data.content?.find(c => c.type === 'text')?.text?.trim() ?? ''
  if (!text) {
    throw new Error('Anthropic returned an empty response')
  }
  return text
}
