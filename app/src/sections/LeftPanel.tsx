import { useEffect, useRef, useState } from 'react'
import { TrendingUp } from 'lucide-react'

interface VitalMetric {
  label: string
  value: string
  change: string
  changeUp: boolean
}

const vitals: VitalMetric[] = [
  { label: 'SUBSCRIBERS', value: '137K', change: '▲ 3.8K /mo', changeUp: true },
  { label: 'INSTAGRAM', value: '209K', change: '▲ 7.8K /mo', changeUp: true },
  { label: 'LATEST VIDEO', value: '9.5K', change: '~10K /day', changeUp: true },
  { label: 'CLAUDE ON WINDOW', value: '6%', change: '19% of 2.36M peak', changeUp: false },
]

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

// Simple sparkline component
function Sparkline({ up }: { up: boolean }) {
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

    const points: number[] = []
    let current = h * 0.5
    for (let i = 0; i < 20; i++) {
      current += (Math.random() - 0.5) * 12
      current = Math.max(4, Math.min(h - 4, current))
      points.push(current)
    }

    ctx.strokeStyle = up ? 'rgba(229, 169, 61, 0.7)' : 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    const step = w / (points.length - 1)
    points.forEach((y, i) => {
      if (i === 0) ctx.moveTo(0, y)
      else ctx.lineTo(i * step, y)
    })
    ctx.stroke()

    // Fill under
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    ctx.fillStyle = up ? 'rgba(229, 169, 61, 0.08)' : 'rgba(255, 255, 255, 0.03)'
    ctx.fill()
  }, [up])

  return <canvas ref={canvasRef} className="w-[120px] h-[30px]" />
}

export default function LeftPanel() {
  const [checkedItems, setCheckedItems] = useState<boolean[]>(directives.map(() => false))

  const toggleCheck = (idx: number) => {
    setCheckedItems(prev => {
      const next = [...prev]
      next[idx] = !next[idx]
      return next
    })
  }

  return (
    <div className="h-full border-r border-white/15 flex flex-col overflow-hidden">
      {/* Brand */}
      <div className="p-5 border-b border-white/15 animate-fade-in">
        <h1 className="text-2xl font-light tracking-[0.3em] text-white">
          V.A.U.L.T.
        </h1>
        <p className="text-[9px] tracking-[0.2em] text-white/30 uppercase mt-1">
          Visual Autonomous Utility Live Terminal
        </p>
      </div>

      {/* System Vitals */}
      <div className="p-5 border-b border-white/15 flex-1 overflow-auto animate-fade-in stagger-1">
        <div className="flex items-center justify-between mb-4">
          <span className="text-label">System Vitals</span>
          <span className="text-[9px] text-white/20 font-mono">LIVE</span>
        </div>

        <div className="space-y-5">
          {vitals.map((vital, i) => (
            <div key={i} className="group cursor-default">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-white/30 uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp size={8} className={vital.changeUp ? 'text-amber-400' : 'text-white/20'} />
                  {vital.label}
                </span>
                <span className="text-[9px] text-white/20 font-mono">{vital.change}</span>
              </div>
              <div className="flex items-end justify-between gap-3">
                <span className="text-2xl font-mono-data font-light text-white tracking-tight">
                  {vital.value}
                </span>
                <Sparkline up={vital.changeUp} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Directives */}
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
              <span className={`mt-0.5 text-xs flex-shrink-0 transition-colors ${checkedItems[i] ? 'text-amber-400' : 'text-white/30 group-hover:text-white/50'}`}>
                {checkedItems[i] ? '☑' : '☐'}
              </span>
              <span className={`text-[11px] leading-relaxed transition-all ${checkedItems[i] ? 'text-white/30 line-through' : 'text-white/60 group-hover:text-white/80'}`}>
                {d}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Documents */}
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
              <span className="text-[9px] text-white/20 font-mono">
                {doc.size}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}