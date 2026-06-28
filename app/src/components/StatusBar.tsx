import { Settings, Brain } from 'lucide-react'
import { useServiceHealth } from '@/hooks/useServiceHealth'
import { useVoiceSettings } from '@/stores/voice-settings-store'

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
        on ? 'bg-emerald-400' : 'bg-red-400/80'
      }`}
    />
  )
}

function ServicePill({
  label,
  on,
  model,
}: {
  label: string
  on: boolean
  model?: string
}) {
  return (
    <span
      className="flex items-center gap-1 text-[9px] tracking-wider"
      title={on ? `${label} ready` : `${label} not ready`}
    >
      <Dot on={on} />
      <span className={on ? 'text-white/55' : 'text-white/30'}>{label}</span>
      {model && (
        <span className={on ? 'text-white/25' : 'text-white/15'}>{model}</span>
      )}
    </span>
  )
}

interface StatusBarProps {
  onOpenSettings?: () => void
  onOpenJarvisSettings?: () => void
}

export default function StatusBar({ onOpenSettings, onOpenJarvisSettings }: StatusBarProps) {
  const [settings] = useVoiceSettings()
  const { voice, ollama, gitnexus, loading } = useServiceHealth()
  const voicebox = voice.voicebox

  const brain =
    ollama ? 'Ollama' : voicebox?.online ? 'Voicebox LLM' : 'Offline'

  const voiceReady = voice.sttReady && voice.ttsReady

  return (
    <footer
      className="relative z-20 border-t border-white/10 bg-[#050505]/95 px-4 py-2 flex items-center justify-between gap-4 flex-wrap"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <ServicePill
          label="STT"
          on={voice.sttReady}
          model={
            voice.sttFallback
              ? `${voice.sttModel} · fallback`
              : (voice.sttModel ?? voice.sttProvider)
          }
        />
        <ServicePill
          label="TTS"
          on={voice.ttsReady}
          model={voice.ttsModel ?? voice.ttsProvider}
        />

        {settings.voiceboxEnabled && (
          <>
            <span className="text-white/10 hidden sm:inline">|</span>
            <span className="flex items-center gap-1.5 text-[9px] tracking-wider text-white/40">
              <Dot on={!!voicebox?.online} />
              <span className={voicebox?.online ? 'text-white/50' : 'text-white/25'}>
                Voicebox
              </span>
            </span>
          </>
        )}

        <span className="text-white/10 hidden sm:inline">|</span>
        <span className="flex items-center gap-1.5 text-[9px] tracking-wider text-white/40">
          <Dot on={ollama} />
          <span className={ollama ? 'text-white/50' : 'text-white/25'}>Ollama</span>
        </span>

        <span className="flex items-center gap-1.5 text-[9px] tracking-wider text-white/40">
          <Dot on={gitnexus} />
          <span className={gitnexus ? 'text-white/50' : 'text-white/25'}>GitNexus</span>
        </span>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1 text-[9px] tracking-wider text-white/30 hover:text-amber-400/80 transition-colors"
            aria-label="Voice settings"
          >
            <Settings size={12} />
            <span className="hidden sm:inline">Voice</span>
          </button>
        )}

        {onOpenJarvisSettings && (
          <button
            type="button"
            onClick={onOpenJarvisSettings}
            className="flex items-center gap-1 text-[9px] tracking-wider text-white/30 hover:text-amber-400/80 transition-colors"
            aria-label="JARVIS settings"
          >
            <Brain size={12} />
            <span className="hidden sm:inline">JARVIS</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 text-[9px] tracking-wider text-white/30">
        {!loading && !voice.sttReady && voice.sttError && (
          <span className="text-red-400/70 max-w-[320px] truncate" title={voice.sttError}>
            {voice.sttError}
          </span>
        )}
        {!loading && voice.sttReady && voice.sttFallback === 'voicebox' && (
          <span className="text-amber-400/60 hidden md:inline">
            Whisper :9000 down · Voicebox fallback
          </span>
        )}
        {!loading && voice.sttReady && !voice.ttsReady && voice.ttsError && (
          <span className="text-amber-400/70 hidden md:inline">{voice.ttsError}</span>
        )}
        <span>
          Brain:{' '}
          <span className={loading ? 'text-white/20' : 'text-amber-400/70'}>{brain}</span>
          {voiceReady && (
            <span className="text-white/20 hidden lg:inline"> · voice Jarvis</span>
          )}
        </span>
      </div>
    </footer>
  )
}
