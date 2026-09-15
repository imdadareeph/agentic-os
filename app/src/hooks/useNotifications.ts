import { useEffect } from 'react'
import { useToolEvents } from './useToolEvents'
import { notify, toNotification } from '@/services/notification-agent'

export interface NotificationsState {
  /** Tools currently running — for the caller's inline progress indicator. */
  activeTools: string[]
}

/**
 * Notification Agent driver (CONVERSATION_AGENTS.md §"Notification Agent").
 * Rides the shared tool-event subscription (useToolEvents) and dispatches one
 * toast per event for failures and task completion. Returns the running-tool
 * set so the consumer can also render inline progress. Toasts are
 * fire-and-forget and never block the voice path.
 */
export function useNotifications(): NotificationsState {
  const { activeTools, lastEvent } = useToolEvents()

  useEffect(() => {
    if (!lastEvent) return
    const n = toNotification(lastEvent)
    if (n) notify(n)
  }, [lastEvent])

  return { activeTools }
}
