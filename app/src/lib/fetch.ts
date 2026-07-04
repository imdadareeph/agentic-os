/** fetch with timeout — avoids AbortSignal.timeout (unsupported in some browsers). */
export async function fetchWithTimeoutAndSignal(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 5000,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer)
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true })
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 5000
): Promise<Response> {
  return fetchWithTimeoutAndSignal(input, init, timeoutMs)
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error && err.name === 'AbortError') return true
  if (err instanceof Error && /abort/i.test(err.message)) return true
  return false
}
