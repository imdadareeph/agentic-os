/**
 * Notification Agent (CONVERSATION_AGENTS.md §"Notification Agent"). Turns raw
 * tool-execution events into user-facing notifications and dispatches them.
 * The spec charges this agent with surfacing Errors, Warnings, Task completion,
 * and Progress. Progress is rendered inline in the Command Deck (see
 * useToolEvents.activeTools), so this module owns the transient toast surface:
 * failures and task completion.
 *
 * Dispatch is fire-and-forget by construction — sonner toasts never block, so
 * this can never add latency to the voice path. Pure mapping (`toNotification`)
 * is separated from the side-effecting `notify` so the classification stays
 * trivially reviewable.
 */

import { toast } from 'sonner'
import type { ToolEvent } from './tool-events'

export type NotificationSeverity = 'error' | 'warning' | 'success' | 'info'

export interface Notification {
  severity: NotificationSeverity
  /** Short headline, e.g. "docker.ps failed" or "docker.ps done". */
  title: string
  /** Optional supporting detail, e.g. an error string. */
  detail?: string
}

/**
 * Classify a tool event into a notification, or null when the event needs no
 * toast (TOOL_STARTED is progress, shown inline, not toasted).
 */
export function toNotification(event: ToolEvent): Notification | null {
  switch (event.type) {
    case 'TOOL_FAILED':
      return {
        severity: 'error',
        title: `${event.tool} failed`,
        detail: event.error ?? undefined,
      }
    case 'TOOL_EXECUTED':
      return { severity: 'success', title: `${event.tool} done` }
    case 'TOOL_STARTED':
    default:
      return null
  }
}

/** Render a notification on the transient toast surface. */
export function notify(n: Notification): void {
  const message = n.detail ? `${n.title}: ${n.detail}` : n.title
  switch (n.severity) {
    case 'error':
      // Errors persist longer — the user needs time to read what broke.
      toast.error(message, { duration: 6000 })
      break
    case 'warning':
      toast.warning(message, { duration: 4000 })
      break
    case 'success':
      // Task completion is confirmatory, not important — keep it brief and quiet
      // so a busy tool loop never buries the conversation under toasts.
      toast.success(n.title, { duration: 1500 })
      break
    default:
      toast.info(message)
  }
}
