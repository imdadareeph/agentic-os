import { useEffect, useState } from 'react'
import { subscribeToolEvents, type ToolEvent } from '@/services/tool-events'

export interface ToolEventsState {
  /** Tools currently running (TOOL_STARTED seen, no terminal event yet). */
  activeTools: string[]
  /** Last failure message, e.g. "docker.ps failed: <error>". Null once cleared. */
  lastError: string | null
  /**
   * The most recent event, as a fresh reference each time so consumers can key
   * a per-event effect off it (the Notification Agent does this to dispatch one
   * toast per event). Null until the first event arrives.
   */
  lastEvent: ToolEvent | null
}

/**
 * Subscribes to the runtime tool-execution stream and exposes lifecycle state.
 * Wired into RightPanel (progress in the Command Deck header) and, via
 * useNotifications, into the Notification Agent (toasts for failures and task
 * completion). Single SSE subscription shared by both. Never throws; a dead
 * runtime simply yields no events.
 */
export function useToolEvents(): ToolEventsState {
  const [activeTools, setActiveTools] = useState<string[]>([])
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastEvent, setLastEvent] = useState<ToolEvent | null>(null)

  useEffect(() => {
    const handle = (e: ToolEvent) => {
      setLastEvent(e)
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

  return { activeTools, lastError, lastEvent }
}
