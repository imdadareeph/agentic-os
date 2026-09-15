import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Orbit } from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchMemoryGraph,
  fetchVaultNote,
  getMemoryHealth,
  type MemoryGraph,
  type VaultNote,
} from '@/services/memory'
import MemoryGalaxyScene, { type PositionedNode } from '@/components/MemoryGalaxyScene'
import VaultNotePanel from '@/components/VaultNotePanel'

type TabKey = 'recent' | 'notes' | 'graph' | 'galaxy'

const TABS: { key: TabKey; label: string; live: boolean }[] = [
  { key: 'recent', label: 'Recent 12', live: false },
  { key: 'notes', label: 'Notes', live: false },
  { key: 'graph', label: 'Graph', live: true },
  { key: 'galaxy', label: 'Galaxy', live: false },
]

export default function MemoryGalaxyPage() {
  const [graph, setGraph] = useState<MemoryGraph | null>(null)
  const [runtimeOnline, setRuntimeOnline] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('graph')
  const [paused, setPaused] = useState(false)
  const [selected, setSelected] = useState<PositionedNode | null>(null)
  const [note, setNote] = useState<VaultNote | null>(null)
  const [noteLoading, setNoteLoading] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)

  useEffect(() => {
    let cancelled = false
    void Promise.all([fetchMemoryGraph(), getMemoryHealth()]).then(([g, health]) => {
      if (cancelled) return
      setGraph(g)
      setRuntimeOnline(health !== null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const nodeByPath = useMemo(() => {
    const map = new Map<string, PositionedNode>()
    if (!graph) return map
    for (const n of graph.nodes) {
      if (n.kind === 'note') map.set(n.path, n as PositionedNode)
    }
    return map
  }, [graph])

  useEffect(() => {
    const path = selected?.path ?? null
    if (!path) {
      setNote(null)
      setNoteError(null)
      setNoteLoading(false)
      return
    }

    let cancelled = false
    setNoteLoading(true)
    setNoteError(null)
    setNote(null)
    setPanelOpen(true)

    void fetchVaultNote(path).then(result => {
      if (cancelled) return
      setNoteLoading(false)
      if (!result) {
        setNoteError('Could not load note — file missing or runtime unavailable.')
        return
      }
      setNote(result)
    })

    return () => {
      cancelled = true
    }
  }, [selected?.path])

  const handleNavigate = useCallback(
    (path: string) => {
      const node = nodeByPath.get(path)
      if (node) {
        setSelected(node)
        return
      }
      toast.message('Note not in current graph view', {
        description: path,
      })
    },
    [nodeByPath]
  )

  const handleSelect = useCallback((node: PositionedNode) => {
    setSelected(node)
    setPanelOpen(true)
  }, [])

  return (
    <div className="min-h-screen h-screen bg-[#05040a] text-white overflow-hidden flex flex-col">
      <header className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white/90 transition-colors"
          >
            <ArrowLeft size={13} />
            Mission Control
          </Link>
          <div className="flex items-center gap-1.5 text-white/80">
            <Orbit size={14} className="text-amber-400" />
            <span className="text-[13px] font-light tracking-wide">Memory — Obsidian Vault</span>
          </div>
        </div>
        <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">
          {graph ? `${graph.stats.chunks} chunks · ${graph.stats.notes} notes` : '—'}
        </span>
      </header>

      <div className="flex items-center gap-1 px-5 py-2 border-b border-white/10 shrink-0">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            disabled={!t.live}
            onClick={() => t.live && setTab(t.key)}
            className={`text-[10px] uppercase tracking-wide px-2.5 py-1 rounded transition-colors ${
              tab === t.key
                ? 'bg-amber-500/15 text-amber-300'
                : t.live
                  ? 'text-white/50 hover:text-white/80'
                  : 'text-white/20 cursor-default'
            }`}
          >
            {t.label}
            {!t.live && <span className="ml-1 text-white/15">soon</span>}
          </button>
        ))}
      </div>

      <div className="relative flex-1 min-h-0 flex flex-col lg:flex-row">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm z-20 bg-[#05040a]">
            Loading memory graph…
          </div>
        )}

        {!loading && runtimeOnline === false && (
          <EmptyState
            title="Memory runtime offline"
            detail="Run npm run runtime:dev (port 8000), then reopen this page."
          />
        )}

        {!loading && runtimeOnline && graph && graph.nodes.length === 0 && (
          <EmptyState
            title="Vault is empty"
            detail="No notes found under ~/jarvis/vault (agents/learnings/projects/wiki). Nothing to visualize yet."
          />
        )}

        {!loading && runtimeOnline && graph && graph.nodes.length > 0 && (
          <>
            <div className="relative flex-1 min-h-0 min-w-0">
              <div className="absolute top-4 left-5 z-10 pointer-events-none select-none">
                <p className="text-[10px] uppercase tracking-widest text-white/40 flex items-center gap-1.5">
                  <Orbit size={11} />
                  Memory Galaxy
                </p>
                <p className="text-[12px] text-white/70 mt-0.5">
                  {graph.stats.nodes} stars · {graph.stats.links} links
                  {graph.truncated && <span className="text-amber-400/70"> · truncated</span>}
                </p>
                <p className="text-[9px] text-white/25 mt-1 leading-relaxed">
                  drag to orbit · scroll to zoom · click a star · double-click to{' '}
                  {paused ? 'resume' : 'pause'} flight
                </p>
                <p className="text-[9px] text-white/20 mt-0.5">
                  ◆ brighter &amp; whiter = more recently touched
                </p>
              </div>

              <MemoryGalaxyScene
                nodes={graph.nodes}
                links={graph.links}
                paused={paused}
                onTogglePaused={() => setPaused(p => !p)}
                selectedId={selected?.id ?? null}
                onSelect={handleSelect}
                onHover={() => {}}
              />
            </div>

            {panelOpen && (
              <VaultNotePanel
                path={selected?.path ?? null}
                note={note}
                loading={noteLoading}
                error={noteError}
                onNavigate={handleNavigate}
                onClose={() => setPanelOpen(false)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
      <Orbit size={28} className="text-white/15" />
      <p className="text-white/60 text-sm">{title}</p>
      <p className="text-white/30 text-xs max-w-sm leading-relaxed">{detail}</p>
      <Link
        to="/"
        className="mt-2 text-[11px] text-amber-400/80 hover:text-amber-300 flex items-center gap-1"
      >
        <ArrowLeft size={12} />
        Back to Mission Control
      </Link>
    </div>
  )
}
