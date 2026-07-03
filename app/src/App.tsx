import { useState, useCallback, useEffect } from 'react'
import StatusBar from '@/components/StatusBar'
import LeftPanel from '@/sections/LeftPanel'
import CenterPanel from '@/sections/CenterPanel'
import RightPanel from '@/sections/RightPanel'
import FeatureShowcase from '@/sections/FeatureShowcase'
import VoiceSettingsSheet from '@/sections/VoiceSettingsSheet'
import JarvisSettingsSheet from '@/sections/JarvisSettingsSheet'
import AiSettingsSheet from '@/sections/AiSettingsSheet'
import { useSystemVitals } from '@/hooks/useSystemVitals'
import type { VitalsResponse } from '@/types/vitals'

export default function App() {
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceVolume, setVoiceVolume] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [jarvisSettingsOpen, setJarvisSettingsOpen] = useState(false)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [inboxBriefOpen, setInboxBriefOpen] = useState(false)
  const { vitals, liveCount, loading, error, refresh, updatedAt } = useSystemVitals()

  const vitalsSnapshot: VitalsResponse | null = updatedAt
    ? { updatedAt, vitals, liveCount }
    : null

  const handleVoiceToggle = useCallback((active: boolean, volume: number) => {
    setVoiceActive(active)
    setVoiceVolume(volume)
  }, [])

  const toggleInboxBrief = useCallback(() => {
    setInboxBriefOpen(prev => !prev)
  }, [])

  useEffect(() => {
    if (!inboxBriefOpen) return

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-inbox-brief-trigger]')) return
      if (target.closest('[data-inbox-brief-panel]')) return
      setInboxBriefOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [inboxBriefOpen])

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Hero Dashboard — Fixed height, sticky */}
      <div className="sticky top-0 h-screen z-10 flex flex-col bg-[#050505]">
        <div className="flex-1 min-h-0 grid grid-cols-[280px_1fr_280px]">
          <div className="hidden lg:block h-full overflow-hidden">
            <LeftPanel
              vitals={vitals}
              liveCount={liveCount}
              loading={loading}
              error={error}
            />
          </div>

          <div className="h-full overflow-hidden">
            <CenterPanel
              isSpeaking={voiceActive}
              volume={voiceVolume}
              inboxBriefOpen={inboxBriefOpen}
            />
          </div>

          <div className="hidden lg:block h-full overflow-hidden">
            <RightPanel
              onVoiceToggle={handleVoiceToggle}
              inboxBriefOpen={inboxBriefOpen}
              onInboxBriefToggle={toggleInboxBrief}
              onMetricsPull={() => void refresh()}
              metricsPulling={loading}
              vitalsSnapshot={vitalsSnapshot}
            />
          </div>
        </div>
        <StatusBar
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenJarvisSettings={() => setJarvisSettingsOpen(true)}
          onOpenAiSettings={() => setAiSettingsOpen(true)}
        />
      </div>

      <VoiceSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
      <JarvisSettingsSheet
        open={jarvisSettingsOpen}
        onOpenChange={setJarvisSettingsOpen}
        vitalsSnapshot={vitalsSnapshot}
      />
      <AiSettingsSheet open={aiSettingsOpen} onOpenChange={setAiSettingsOpen} />

      {/* Feature Showcase — Scrolls over the hero */}
      <FeatureShowcase />
    </div>
  )
}