/** Parse Voicebox SSE body (`data: {...}` lines) or plain JSON. */
export function parseVoiceboxEventBody<T extends { status?: string }>(body: string): T | null {
  const trimmed = body.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as T
    } catch {
      return null
    }
  }

  let last: T | null = null
  for (const line of trimmed.split('\n')) {
    const row = line.trim()
    if (!row.startsWith('data:')) continue
    try {
      last = JSON.parse(row.slice(5).trim()) as T
    } catch {
      // skip malformed SSE line
    }
  }
  return last
}

export function isGenerationComplete(status: string | undefined): boolean {
  return status === 'completed' || status === 'complete'
}

export function isGenerationFailed(status: string | undefined): boolean {
  return status === 'failed' || status === 'error'
}
