import { useState, useCallback } from 'react'
import StatusBar from '@/components/StatusBar'
import LeftPanel from '@/sections/LeftPanel'
import CenterPanel from '@/sections/CenterPanel'
import RightPanel from '@/sections/RightPanel'
import FeatureShowcase from '@/sections/FeatureShowcase'
import VoiceSettingsSheet from '@/sections/VoiceSettingsSheet'

export default function App() {
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceVolume, setVoiceVolume] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleVoiceToggle = useCallback((active: boolean, volume: number) => {
    setVoiceActive(active)
    setVoiceVolume(volume)
  }, [])

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Hero Dashboard — Fixed height, sticky */}
      <div className="sticky top-0 h-screen z-10 flex flex-col bg-[#050505]">
        <div className="flex-1 min-h-0 grid grid-cols-[280px_1fr_280px]">
          <div className="hidden lg:block h-full overflow-hidden">
            <LeftPanel />
          </div>

          <div className="h-full overflow-hidden">
            <CenterPanel isSpeaking={voiceActive} volume={voiceVolume} />
          </div>

          <div className="hidden lg:block h-full overflow-hidden">
            <RightPanel onVoiceToggle={handleVoiceToggle} />
          </div>
        </div>
        <StatusBar onOpenSettings={() => setSettingsOpen(true)} />
      </div>

      <VoiceSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Feature Showcase — Scrolls over the hero */}
      <FeatureShowcase />
    </div>
  )
}