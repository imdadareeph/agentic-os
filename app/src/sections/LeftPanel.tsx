import { useEffect, useRef, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import type { VitalMetric } from '@/types/vitals'

const directives = [
  'Cut + ship the Jarvis HUD reveal video (confirm it hasn\'t already shipped first)',
  'Build the per-level outline for the Every level of Claude Agentic OS video',
  'Package the loop-engineering demo assets into a publishable cut',
]

const documents = [
  { name: 'Week Review', size: '2.1 MB' },
  { name: 'Plan Today', size: '156 KB' },
  { name: 'Plan Today', size: '156 KB' },
  { name: 'Inbox Brief', size: '89 KB' },
  { name: 'Inbox Brief', size: '89 KB' },
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
}

export default function LeftPanel({
  vitals,
  liveCount,
  loading = false,
  error = null,
}: LeftPanelProps) {
  const statusLabel =
    loading && liveCount === 0 ? 'SYNC' : liveCount > 0 ? 'LIVE' : 'OFFLINE'

  return (
    <div className="h-full border-r border-white/15 flex flex-col overflow-hidden">
      <div className="p-5 border-b border-white/15 animate-fade-in">
        <h1 className="text-2xl font-light tracking-[0.3em] text-white">
          J.A.R.V.I.S.
        </h1>
        <p className="text-[9px] tracking-[0.2em] text-white/30 uppercase mt-1">
          Just A Rather Very Intelligent System
        </p>
      </div>

      <div className="p-5 border-b border-white/15 flex-1 overflow-auto animate-fade-in stagger-1">
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

      <DirectivesSection />
      <DocumentsSection />
    </div>
  )
}

function DirectivesSection() {
  const [checkedItems, setCheckedItems] = useState<boolean[]>(directives.map(() => false))

  const toggleCheck = (idx: number) => {
    setCheckedItems(prev => {
      const next = [...prev]
      next[idx] = !next[idx]
      return next
    })
  }

  return (
    <div className="p-5 border-b border-white/15 animate-fade-in stagger-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-label">Directives</span>
        <span className="text-[9px] text-white/20 font-mono">TOP 3</span>
      </div>
      <div className="space-y-2">
        {directives.map((d, i) => (
          <button
            key={i}
            onClick={() => toggleCheck(i)}
            className="flex items-start gap-2 w-full text-left group border-wire-hover p-1.5 -m-1.5"
          >
            <span
              className={`mt-0.5 text-xs flex-shrink-0 transition-colors ${
                checkedItems[i] ? 'text-amber-400' : 'text-white/30 group-hover:text-white/50'
              }`}
            >
              {checkedItems[i] ? '☑' : '☐'}
            </span>
            <span
              className={`text-[11px] leading-relaxed transition-all ${
                checkedItems[i]
                  ? 'text-white/30 line-through'
                  : 'text-white/60 group-hover:text-white/80'
              }`}
            >
              {d}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function DocumentsSection() {
  return (
    <div className="p-5 animate-fade-in stagger-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-label">Documents</span>
        <span className="text-[9px] text-white/20 font-mono">{documents.length} FILES</span>
      </div>
      <div className="space-y-1">
        {documents.map((doc, i) => (
          <button
            key={i}
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