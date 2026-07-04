/**
 * Tool-approval broker (T2). Bridges the mid-turn approval request raised deep
 * in `thinkWithTools` to the `ToolApprovalDialog` mounted once in the app tree,
 * without threading a promise through the voice hook.
 *
 * `requestApprovals()` (caller side) returns a promise that resolves when the
 * user answers the dialog. The dialog subscribes via `useApprovalRequest()`.
 */
import { useSyncExternalStore } from 'react'

export interface ApprovalItem {
  approvalId: string
  toolName: string
  args: Record<string, unknown>
  preview?: string | null
}

/** approvalId -> approved */
export type ApprovalDecisions = Record<string, boolean>

interface ActiveRequest {
  items: ApprovalItem[]
  resolve: (decisions: ApprovalDecisions) => void
}

let active: ActiveRequest | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/** Caller (thinkWithTools): raise an approval request, await the user's answer. */
export function requestApprovals(items: ApprovalItem[]): Promise<ApprovalDecisions> {
  // If one is already active (rare), auto-deny the new batch to avoid a stuck UI.
  if (active) {
    return Promise.resolve(Object.fromEntries(items.map(i => [i.approvalId, false])))
  }
  return new Promise<ApprovalDecisions>(resolve => {
    active = { items, resolve }
    emit()
  })
}

/** Dialog: resolve the active request with per-item decisions and clear it. */
export function respondApprovals(decisions: ApprovalDecisions): void {
  const req = active
  active = null
  emit()
  req?.resolve(decisions)
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function snapshot(): ActiveRequest | null {
  return active
}

/** Dialog hook — current pending items (or null). */
export function useApprovalRequest(): ApprovalItem[] | null {
  const req = useSyncExternalStore(subscribe, snapshot, () => null)
  return req?.items ?? null
}
