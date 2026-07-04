/**
 * Tool-execution event stream (T3 §4/§5, Notification Agent). Subscribes to the
 * runtime SSE endpoint `/api/tools/events` via the Vite `/runtime` proxy and
 * relays each event to a callback. Mirrors the graceful-degradation contract of
 * the rest of the tools client: this NEVER throws into the caller — parse errors
 * are swallowed and EventSource's own auto-reconnect is left to do its thing.
 */

const RUNTIME_BASE = '/runtime'

export type ToolEventType = 'TOOL_STARTED' | 'TOOL_EXECUTED' | 'TOOL_FAILED'

export interface ToolEvent {
  type: ToolEventType
  tool: string
  sessionId: string | null
  timestamp: string
  error: string | null
}

/**
 * Open an SSE subscription to tool-execution events.
 * @returns an unsubscribe function that closes the underlying EventSource.
 */
export function subscribeToolEvents(onEvent: (e: ToolEvent) => void): () => void {
  let source: EventSource | null = null

  try {
    source = new EventSource(`${RUNTIME_BASE}/api/tools/events`)
  } catch {
    // EventSource construction failing (e.g. unsupported env) must be inert.
    return () => {}
  }

  source.onmessage = (evt: MessageEvent) => {
    try {
      const parsed = JSON.parse(evt.data) as ToolEvent
      if (parsed && typeof parsed.type === 'string') onEvent(parsed)
    } catch {
      // Malformed frame — ignore, keep the stream alive.
    }
  }

  // EventSource auto-reconnects on error by default; don't fight it, just no-op.
  source.onerror = () => {}

  return () => {
    try {
      source?.close()
    } catch {
      // ignore
    }
  }
}
