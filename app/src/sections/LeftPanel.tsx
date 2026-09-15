import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { TrendingUp, Orbit, Bot, Wrench, FolderTree } from 'lucide-react'
import type { VitalMetric } from '@/types/vitals'
import { Switch } from '@/components/ui/switch'
import { useMemorySettings } from '@/stores/memory-settings-store'
import { useToolSettings } from '@/stores/tool-settings-store'
import {
  subscribeActivity,
  clearActivity,
  type ActivityEntry,
} from '@/services/activity-log'

interface MissionLink {
  label: string
  route: string
  icon: typeof Orbit
  status: 'live' | 'soon'
}

const MISSION_LINKS: MissionLink[] = [
  { label: 'Memory Galaxy', route: '/memory', icon: Orbit, status: 'live' },
  { label: 'Agents', route: '/agents', icon: Bot, status: 'soon' },
  { label: 'Tools', route: '/tools', icon: Wrench, status: 'soon' },
  { label: 'Vault Browser', route: '/vault', icon: FolderTree, status: 'soon' },
]

function MissionLinksSection() {
  return (
    <div className="p-5 border-b border-white/15 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <span className="text-label">Mission Links</span>
      </div>
      <div className="space-y-1">
        {MISSION_LINKS.map(({ label, route, icon: Icon, status }) =>
          status === 'live' ? (
            <Link
              key={route}
              to={route}
              className="flex items-center gap-2 w-full text-left border-wire-hover p-1.5 -m-1.5 rounded group"
            >
              <Icon size={12} className="text-white/30 group-hover:text-amber-400 transition-colors" />
              <span className="text-[11px] text-white/60 group-hover:text-white/90 transition-colors">
                {label}
              </span>
            </Link>
          ) : (
            <div
              key={route}
              className="flex items-center justify-between gap-2 w-full p-1.5 -m-1.5 opacity-40 cursor-default"
            >
              <span className="flex items-center gap-2">
                <Icon size={12} className="text-white/20" />
                <span className="text-[11px] text-white/40">{label}</span>
              </span>
              <span className="text-[8px] uppercase tracking-wide text-white/20 border border-white/10 rounded px-1 py-px">
                Soon
              </span>
            </div>
          )
        )}
      </div>
    </div>
  )
}

const documents = [
  { name: 'Week Review', size: '2.1 MB' },
  { name: 'Plan Today', size: '156 KB' },
  { name: 'Inbox Brief', size: '89 KB' },
  { name: 'AM Report', size: '412 KB' },
  { name: 'Trend Scan', size: '68 KB' },
]

function Sparkline({ series, up }: { series: number[]; up: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = 120
    const h = 30
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const values = series.length >= 2 ? series : series.length === 1 ? [series[0], series[0]] : [0, 0]
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1

    const points = values.map(v => h - 4 - ((v - min) / range) * (h - 8))

    ctx.strokeStyle = up ? 'rgba(229, 169, 61, 0.7)' : 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    const step = w / (points.length - 1)
    points.forEach((y, i) => {
      if (i === 0) ctx.moveTo(0, y)
      else ctx.lineTo(i * step, y)
    })
    ctx.stroke()

    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    ctx.fillStyle = up ? 'rgba(229, 169, 61, 0.08)' : 'rgba(255, 255, 255, 0.03)'
    ctx.fill()
  }, [series, up])

  return <canvas ref={canvasRef} className="w-[120px] h-[30px]" />
}

interface LeftPanelProps {
  vitals: VitalMetric[]
  liveCount: number
  loading?: boolean
  error?: string | null
  sessionActive?: boolean
}

export default function LeftPanel({
  vitals,
  liveCount,
  loading = false,
  error = null,
  sessionActive = false,
}: LeftPanelProps) {
  const statusLabel =
    loading && liveCount === 0 ? 'SYNC' : liveCount > 0 ? 'LIVE' : 'OFFLINE'

  return (
    <div className="h-full border-r border-white/15 flex flex-col overflow-hidden">
      <div className="shrink-0 p-5 border-b border-white/15 animate-fade-in">
        <h1 className="text-2xl font-light tracking-[0.3em] text-white">
          J.A.R.V.I.S.
        </h1>
        <p className="text-[9px] tracking-[0.2em] text-[#d8aa39] uppercase mt-1">
          Just A Rather Very Intelligent System
        </p>
      </div>

      <div className="shrink-0 p-5 border-b border-white/15 max-h-[min(280px,38vh)] overflow-y-auto scrollbar-jarvis animate-fade-in stagger-1">
        <div className="flex items-center justify-between mb-4">
          <span className="text-label">System Vitals</span>
          <span
            className={`text-[9px] font-mono ${
              statusLabel === 'LIVE'
                ? 'text-amber-400/80'
                : statusLabel === 'SYNC'
                  ? 'text-white/30'
                  : 'text-white/20'
            }`}
          >
            {statusLabel}
            {liveCount > 0 && statusLabel === 'LIVE' ? ` · ${liveCount}` : ''}
          </span>
        </div>

        {error && (
          <p className="text-[9px] text-red-400/70 mb-3 leading-relaxed">{error}</p>
        )}

        <div className="space-y-5">
          {vitals.map(vital => (
            <div key={vital.id} className="group cursor-default">
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-[9px] text-white/30 uppercase tracking-wider flex items-center gap-1 shrink-0">
                  <TrendingUp
                    size={8}
                    className={vital.live && vital.changeUp ? 'text-amber-400' : 'text-white/20'}
                  />
                  {vital.label}
                </span>
                <span
                  className="text-[9px] text-white/20 font-mono truncate text-right max-w-[140px]"
                  title={vital.change}
                >
                  {vital.change}
                </span>
              </div>
              <div className="flex items-end justify-between gap-3">
                <span
                  className={`text-2xl font-mono-data font-light tracking-tight ${
                    vital.live ? 'text-white' : 'text-white/30'
                  }`}
                >
                  {vital.value}
                </span>
                <Sparkline series={vital.sparkline} up={vital.changeUp && vital.live} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <MissionLinksSection />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {sessionActive ? <ActivitySection /> : <QuickSettingsSection />}
      </div>
      <DocumentsSection />
    </div>
  )
}

const KIND_DOT: Record<ActivityEntry['kind'], string> = {
  memory: 'bg-sky-400',
  obsidian: 'bg-violet-400',
  tool: 'bg-amber-400',
  status: 'bg-white/40',
  llm: 'bg-emerald-400',
  voice: 'bg-pink-400',
}

function ActivitySection() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])

  useEffect(() => subscribeActivity(setEntries), [])

  return (
    <div className="flex flex-col flex-1 min-h-0 p-5 border-b border-white/15 animate-fade-in stagger-2">
      <div className="shrink-0 flex items-center justify-between mb-3">
        <span className="text-label">Live Activity</span>
        <button
          onClick={clearActivity}
          className="text-[9px] text-white/30 hover:text-white/60 font-mono uppercase tracking-wider"
        >
          Clear
        </button>
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto scrollbar-jarvis space-y-2 pr-1"
        role="list"
        aria-label="Live activity"
      >
        {entries.length === 0 && (
          <p className="text-[10px] text-white/20 leading-relaxed">
            No tool, memory, or vault activity yet this conversation.
          </p>
        )}
        {entries.map(e => (
          <div key={e.id} className="flex items-start gap-2" role="listitem">
            <span
              aria-hidden="true"
              className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                e.status === 'error' ? 'bg-red-400' : e.status === 'start' ? 'bg-white/30' : KIND_DOT[e.kind]
              }`}
            />
            <div className="min-w-0">
              <p
                className={`text-[11px] leading-tight truncate ${
                  e.status === 'error' ? 'text-red-400/80' : 'text-white/70'
                }`}
              >
                <span aria-hidden="true">{'• '}</span>
                {e.label}
                {e.detail && (
                  <span className="text-white/25">{' — '}{e.detail}</span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuickSettingsSection() {
  const [memSettings, updateMemSettings] = useMemorySettings()
  const [toolSettings, updateToolSettings] = useToolSettings()

  return (
    <div className="shrink-0 p-5 border-b border-white/15 animate-fade-in stagger-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-label">Jarvis Settings</span>
        <span className="text-[9px] text-white/20 font-mono">APPLIES NEXT SESSION</span>
      </div>
      <div className="space-y-3">
        <QuickToggle
          label="Memory"
          checked={memSettings.memoryEnabled}
          onCheckedChange={v => updateMemSettings({ memoryEnabled: v })}
        />
        <QuickToggle
          label="Semantic recall"
          checked={memSettings.semanticMemoryEnabled}
          onCheckedChange={v => updateMemSettings({ semanticMemoryEnabled: v })}
        />
        <QuickToggle
          label="Episodic (vault)"
          checked={memSettings.episodicMemoryEnabled}
          onCheckedChange={v => updateMemSettings({ episodicMemoryEnabled: v })}
        />
        <QuickToggle
          label="Tools"
          checked={toolSettings.toolsEnabled}
          onCheckedChange={v => updateToolSettings({ toolsEnabled: v })}
        />
      </div>
    </div>
  )
}

function QuickToggle({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-white/60">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function DocumentsSection() {
  return (
    <div className="shrink-0 p-5 animate-fade-in stagger-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-label">Documents</span>
        <span className="text-[9px] text-white/20 font-mono">{documents.length} FILES</span>
      </div>
      <div className="space-y-1">
        {documents.map(doc => (
          <button
            key={doc.name}
            className="flex items-center justify-between w-full text-left border-wire-hover p-1.5 -m-1.5 group"
          >
            <span className="text-[11px] text-white/50 group-hover:text-white/80 transition-colors">
              {doc.name}
            </span>
            <span className="text-[9px] text-white/20 font-mono">{doc.size}</span>
          </button>
        ))}
      </div>
    </div>
  )
}