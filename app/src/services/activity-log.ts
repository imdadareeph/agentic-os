/**
 * In-memory, in-process activity log for the LeftPanel's live activity feed.
 * Not persisted — purely a real-time view of this tab's own tool/memory/vault
 * calls. Never throws: it's a pub/sub for UI display, not a source of truth.
 */

import { subscribeToolEvents } from '@/services/tool-events'

export type ActivityKind = 'memory' | 'obsidian' | 'tool' | 'status' | 'llm' | 'voice'
export type ActivityStatus = 'start' | 'ok' | 'error'

export interface ActivityEntry {
  id: number
  kind: ActivityKind
  label: string
  detail?: string
  status: ActivityStatus
  timestamp: number
}

const MAX_ENTRIES = 40
let entries: ActivityEntry[] = []
let nextId = 1
const listeners = new Set<(entries: ActivityEntry[]) => void>()

function emit(): void {
  for (const listener of listeners) listener(entries)
}

export function logActivity(
  kind: ActivityKind,
  label: string,
  status: ActivityStatus = 'ok',
  detail?: string
): void {
  entries = [{ id: nextId++, kind, label, detail, status, timestamp: Date.now() }, ...entries].slice(
    0,
    MAX_ENTRIES
  )
  emit()
}

export function clearActivity(): void {
  entries = []
  emit()
}

export function subscribeActivity(listener: (entries: ActivityEntry[]) => void): () => void {
  listeners.add(listener)
  listener(entries)
  return () => listeners.delete(listener)
}

// Mirror the runtime tool-execution SSE stream into the same feed so tool
// calls, memory calls, and vault writes all show up in one timeline.
subscribeToolEvents(e => {
  if (e.type === 'TOOL_STARTED') {
    logActivity('tool', `Tool: ${e.tool}`, 'start')
  } else if (e.type === 'TOOL_EXECUTED') {
    logActivity('tool', `Tool: ${e.tool}`, 'ok')
  } else {
    logActivity('tool', `Tool: ${e.tool}`, 'error', e.error ?? undefined)
  }
})
