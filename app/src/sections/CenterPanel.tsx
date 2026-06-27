import { useState, useEffect } from 'react'
import { Zap, Radio } from 'lucide-react'
import NeuralSphere from '@/components/NeuralSphere'

const statusItems = ['CORE', 'WORKING', 'LINK', 'ONLINE', 'RUNNER', 'ALIVE']

interface CenterPanelProps {
  isSpeaking?: boolean
  volume?: number
}

export default function CenterPanel({ isSpeaking = false, volume = 0 }: CenterPanelProps) {
  const [views, setViews] = useState(9499)

  // Simulate view count changes
  useEffect(() => {
    const interval = setInterval(() => {
      setViews(prev => prev + Math.floor(Math.random() * 5))
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  // Simulated velocity metrics
  const velocity = (views / 1000).toFixed(1)
  const spotlight = '25M'

  return (
    <div className="relative h-full flex flex-col">
      {/* 3D Neural Sphere Background */}
      <NeuralSphere isSpeaking={isSpeaking} volume={volume} />

      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1 border border-amber-400/30 bg-amber-400/5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[9px] tracking-[0.15em] text-amber-300 uppercase">Voice Active</span>
        </div>
      )}

      {/* Top Status Bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-white/15">
        <div className="flex items-center gap-4">
          {statusItems.map((item, i) => (
            <span
              key={item}
              className="flex items-center gap-1.5 text-[9px] tracking-[0.15em] text-white/40 animate-fade-in"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {item}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[9px] text-white/20">
          <Radio size={10} className="text-amber-400/60" />
          <span className="tracking-wider">LIVE FEED</span>
        </div>
      </div>

      {/* Center Content Overlay */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        {/* Floating tooltip card */}
        <div className="absolute top-16 right-16 border border-white/15 p-4 glass-panel max-w-[200px] animate-fade-in stagger-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={10} className="text-amber-400" />
            <span className="text-[10px] tracking-widest uppercase text-amber-300">Inbox Brief</span>
          </div>
          <div className="text-[9px] text-white/40 leading-relaxed">
            3 new messages processed. 2 tasks auto-scheduled. Workflow optimization complete.
          </div>
          <div className="mt-2 flex items-center gap-1">
            {[40, 65, 45, 80, 55, 70, 50].map((h, i) => (
              <div
                key={i}
                className="w-2 bg-amber-400/40 rounded-sm"
                style={{ height: `${h * 0.15}px` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Primary Display */}
      <div className="relative z-10 pb-8 pt-4 border-t border-white/5">
        <div className="text-center animate-fade-in stagger-5">
          <div className="text-[9px] tracking-[0.3em] text-white/20 uppercase mb-2">
            Primary Directive — Live Display
          </div>
          <div className="flex items-baseline justify-center gap-3">
            <span className="text-6xl font-light font-mono-data text-white tracking-tight glow-amber-subtle">
              {views.toLocaleString()}
            </span>
            <span className="text-sm tracking-[0.2em] text-white/30 uppercase">Views</span>
          </div>
          <div className="mt-4 flex items-center justify-center gap-6 text-[9px] text-white/20">
            <span>VELOCITY {velocity}K/DAY</span>
            <span className="text-white/10">|</span>
            <span>SPOTLIGHT {spotlight} LEFT</span>
          </div>
          <div className="mt-3 mx-auto w-48 h-[1px] bg-white/10 relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-amber-400/50 w-1/3" />
          </div>
        </div>
      </div>
    </div>
  )
}
