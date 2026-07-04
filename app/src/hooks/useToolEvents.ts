import { useEffect, useState } from 'react'
import { subscribeToolEvents, type ToolEvent } from '@/services/tool-events'

export interface ToolEventsState {
  /** Tools currently running (TOOL_STARTED seen, no terminal event yet). */
  activeTools: string[]
  /** Last failure message, e.g. "docker.ps failed: <error>". Null once cleared. */
  lastError: string | null
}

/**
 * Subscribes to runtime tool-execution events and exposes minimal Notification
 * state for a consumer to render (T3 §6, stub scope). Self-contained and unwired
 * — mount it wherever the Notification area lives. Never throws; a dead runtime
 * simply yields no events.
 */
export function useToolEvents(): ToolEventsState {
  const [activeTools, setActiveTools] = useState<string[]>([])
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    const handle = (e: ToolEvent) => {
      if (e.type === 'TOOL_STARTED') {
        setActiveTools((prev) => (prev.includes(e.tool) ? prev : [...prev, e.tool]))
        return
      }
      // TOOL_EXECUTED | TOOL_FAILED — the tool is no longer running.
      setActiveTools((prev) => prev.filter((t) => t !== e.tool))
      if (e.type === 'TOOL_FAILED') {
        setLastError(`${e.tool} failed${e.error ? `: ${e.error}` : ''}`)
      }
    }
    return subscribeToolEvents(handle)
  }, [])

  return { activeTools, lastError }
}
