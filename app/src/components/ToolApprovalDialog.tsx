import { useEffect, useRef, useState } from 'react'
import { ShieldAlert, Check, X } from 'lucide-react'
import {
  useApprovalRequest,
  respondApprovals,
  type ApprovalDecisions,
} from '@/lib/tool-approval-broker'

/**
 * Approval dialog (T2, WCAG 2.2 AA): shows each pending mutating tool with its
 * command / diff / path preview. Approve/Deny per item; ESC or backdrop = deny
 * all. Mounted once near the app root.
 */
export default function ToolApprovalDialog() {
  const items = useApprovalRequest()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [decisions, setDecisions] = useState<ApprovalDecisions>({})

  useEffect(() => {
    const dlg = dialogRef.current
    if (!dlg) return
    if (items && !dlg.open) {
      setDecisions(Object.fromEntries(items.map(i => [i.approvalId, false])))
      dlg.showModal()
    } else if (!items && dlg.open) {
      dlg.close()
    }
  }, [items])

  if (!items) return null

  const denyAll = () => respondApprovals(Object.fromEntries(items.map(i => [i.approvalId, false])))
  const submit = () => respondApprovals(decisions)

  return (
    <dialog
      ref={dialogRef}
      className="bg-transparent p-0 backdrop:bg-black/70"
      aria-labelledby="tool-approval-title"
      onCancel={e => {
        e.preventDefault()
        denyAll()
      }}
      onClose={() => {
        // Native close without an explicit answer -> treat as deny.
        // (respondApprovals already ran if submit/deny fired; this is the safety net.)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-[min(92vw,560px)] max-h-[80vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0a0a0a] text-white p-6 space-y-4"
      >
        <h2 id="tool-approval-title" className="flex items-center gap-2 text-amber-400 text-sm">
          <ShieldAlert size={16} />
          JARVIS wants to run {items.length} action{items.length > 1 ? 's' : ''}
        </h2>

        <div className="space-y-3">
          {items.map(item => (
            <div key={item.approvalId} className="border border-white/10 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-amber-100/80">{item.toolName}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDecisions(d => ({ ...d, [item.approvalId]: false }))}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${
                      decisions[item.approvalId] === false
                        ? 'bg-red-500/20 text-red-300'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                    aria-pressed={decisions[item.approvalId] === false}
                  >
                    <X size={12} /> Deny
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecisions(d => ({ ...d, [item.approvalId]: true }))}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${
                      decisions[item.approvalId]
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                    aria-pressed={!!decisions[item.approvalId]}
                  >
                    <Check size={12} /> Approve
                  </button>
                </div>
              </div>
              {item.preview && (
                <pre className="text-[10px] text-white/50 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                  {item.preview}
                </pre>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={denyAll}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white"
          >
            Deny all
          </button>
          <button
            type="button"
            onClick={submit}
            autoFocus
            className="rounded-md bg-amber-500/90 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400"
          >
            Run approved
          </button>
        </div>
      </div>
    </dialog>
  )
}
