import { useState, useEffect, useCallback } from 'react'
import { Mic, MicOff, Activity, Loader2, MessageCircle } from 'lucide-react'
import { useVoiceAssistant, type VoicePhase } from '@/hooks/useVoiceAssistant'
import {
  useRealtimeConversation,
  type ConversationPhase,
} from '@/hooks/useRealtimeConversation'
import { useVoiceSettings } from '@/stores/voice-settings-store'
import { useServiceHealth } from '@/hooks/useServiceHealth'

const commands = [
  { id: 'inbox-brief', label: 'INBOX-BRIEF', active: false },
  { id: 'metrics-pull', label: 'METRICS-PULL', active: false },
  { id: 'inbox-brief-2', label: 'INBOX-BRIEF', active: false },
  { id: 'am-report', label: 'AM-REPORT', active: false },
  { id: 'trend-scan', label: 'TREND-SCAN', active: false },
  { id: 'gh-trending', label: 'GH-TRENDING', active: false },
  { id: 'plan-today', label: 'PLAN-TODAY', active: true },
  { id: 'yt-week', label: 'YT-WEEK', active: false },
  { id: 'wk-review', label: 'WK-REVIEW', active: true },
  { id: 'new-session', label: 'NEW SESSION', active: false },
]

interface AudioBar {
  height: number
  targetHeight: number
}

interface RightPanelProps {
  onVoiceToggle?: (active: boolean, volume: number) => void
  inboxBriefOpen?: boolean
  onInboxBriefToggle?: () => void
  onMetricsPull?: () => void
  metricsPulling?: boolean
}

function pushPhaseLabel(phase: VoicePhase): string {
  switch (phase) {
    case 'listening':
      return 'LISTENING'
    case 'processing':
      return 'TRANSCRIBING'
    case 'speaking':
      return 'JARVIS'
    case 'error':
      return 'ERROR'
    default:
      return 'STANDBY'
  }
}

function convoPhaseLabel(phase: ConversationPhase): string {
  switch (phase) {
    case 'listening':
      return 'LISTENING'
    case 'refining':
      return 'REFINING'
    case 'thinking':
      return 'THINKING'
    case 'speaking':
      return 'JARVIS'
    case 'error':
      return 'ERROR'
    default:
      return 'STANDBY'
  }
}

export default function RightPanel({
  onVoiceToggle,
  inboxBriefOpen = false,
  onInboxBriefToggle,
  onMetricsPull,
  metricsPulling = false,
}: RightPanelProps) {
  const [settings] = useVoiceSettings()
  const { voice, ollama, loading: healthLoading } = useServiceHealth()
  const isConversation = settings.voiceMode === 'conversation'

  const push = useVoiceAssistant(isConversation ? undefined : onVoiceToggle)
  const convo = useRealtimeConversation(isConversation ? onVoiceToggle : undefined)

  const [time, setTime] = useState(new Date())
  const [activeCommands, setActiveCommands] = useState<Set<string>>(
    new Set(commands.filter(c => c.active).map(c => c.id))
  )
  const [audioBars, setAudioBars] = useState<AudioBar[]>(
    Array.from({ length: 24 }, () => ({ height: 3, targetHeight: 3 }))
  )

  const phase = isConversation ? convo.phase : push.phase
  const volume = isConversation ? convo.volume : push.volume
  const isActive = isConversation ? convo.isActive : push.isActive
  const phaseText = isConversation ? convoPhaseLabel(convo.phase) : pushPhaseLabel(push.phase)
  const displayError = isConversation ? convo.error : push.error

  const isBusy =
    phase === 'processing' ||
    phase === 'refining' ||
    phase === 'thinking' ||
    phase === 'speaking'

  const showWaveform =
    phase === 'listening' || phase === 'speaking' || (isConversation && convo.conversationActive)

  const canUseVoice = !healthLoading && voice.sttReady && voice.ttsReady && ollama

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (d: Date) => {
    const h = d.getHours().toString().padStart(2, '0')
    const m = d.getMinutes().toString().padStart(2, '0')
    const s = d.getSeconds().toString().padStart(2, '0')
    return { h, m, s }
  }
  const { h, m, s } = formatTime(time)

  const toggleCommand = useCallback((id: string) => {
    setActiveCommands(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    if (!showWaveform) {
      setAudioBars(prev => prev.map(b => ({ ...b, targetHeight: 3 })))
      return
    }

    const interval = setInterval(() => {
      const base =
        phase === 'listening' ? volume : 0.4 + Math.random() * 0.3
      setAudioBars(prev =>
        prev.map((_, i) => {
          const wave = Math.sin(Date.now() / 120 + i * 0.4) * 0.5 + 0.5
          return { height: 0, targetHeight: 3 + base * wave * 28 }
        })
      )
    }, 80)

    return () => clearInterval(interval)
  }, [showWaveform, volume, phase])

  useEffect(() => {
    let frame: number
    const update = () => {
      setAudioBars(prev =>
        prev.map(b => ({
          ...b,
          height: b.height + (b.targetHeight - b.height) * 0.3,
        }))
      )
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (isConversation) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
      e.preventDefault()
      if (push.phase === 'idle' || push.phase === 'error') {
        void push.startListening()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      if (push.phase === 'listening') {
        void push.stopListening()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [isConversation, push])

  return (
    <div className="h-full border-l border-white/15 flex flex-col overflow-hidden">
      <div className="p-5 border-b border-white/15 text-right animate-fade-in">
        <div className="text-3xl font-light tracking-[0.15em] text-white font-mono-data tabular-nums">
          {h}:{m}<span className="text-white/40 text-lg">:{s}</span>
        </div>
        <div className="text-[9px] text-white/20 uppercase tracking-widest mt-1">
          {time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>

      <div className="p-5 border-b border-white/15 animate-fade-in stagger-2">
        <div className="flex items-center justify-between mb-4">
          <span className="text-label">Command Deck</span>
          <span className="text-[9px] text-white/20 font-mono">
            {activeCommands.size + (inboxBriefOpen ? 1 : 0)} ACTIVE
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {commands.map(cmd => {
            const isCmdActive =
              cmd.id === 'inbox-brief'
                ? inboxBriefOpen
                : cmd.id === 'metrics-pull'
                  ? metricsPulling
                  : activeCommands.has(cmd.id)

            return (
            <button
              key={cmd.id}
              data-inbox-brief-trigger={cmd.id === 'inbox-brief' ? true : undefined}
              onClick={() => {
                if (cmd.id === 'inbox-brief') {
                  onInboxBriefToggle?.()
                } else if (cmd.id === 'metrics-pull') {
                  onMetricsPull?.()
                } else {
                  toggleCommand(cmd.id)
                }
              }}
              className={`
                px-3 py-2 text-[9px] tracking-widest uppercase text-left
                border transition-all duration-300
                ${isCmdActive
                  ? 'border-amber-400/60 text-amber-300 bg-amber-400/5'
                  : 'border-white/10 text-white/40 hover:border-white/30 hover:text-white/60 hover:bg-white/5'
                }
              `}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-1 h-1 rounded-full ${isCmdActive ? 'bg-amber-400 animate-pulse' : 'bg-white/20'}`}
                />
                {cmd.label}
              </span>
            </button>
            )
          })}
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col min-h-0 animate-fade-in stagger-3">
        <div className="flex items-center justify-between mb-4">
          <span className="text-label">JARVIS Voice</span>
          <span
            className={`text-[9px] font-mono flex items-center gap-1 ${
              isActive ? 'text-amber-400' : 'text-white/20'
            }`}
          >
            {isBusy ? (
              <Loader2 size={8} className="animate-spin" />
            ) : (
              <Activity size={8} className={isActive ? 'animate-pulse' : ''} />
            )}
            {phaseText}
          </span>
        </div>

        <div className="flex items-center justify-center gap-[2px] h-10 mb-4">
          {audioBars.map((bar, i) => (
            <div
              key={i}
              className={`w-[3px] rounded-full transition-colors duration-300 ${
                showWaveform ? 'bg-amber-400/70' : 'bg-white/10'
              }`}
              style={{
                height: `${bar.height}px`,
                opacity: showWaveform ? 0.3 + (bar.height / 32) * 0.7 : 0.3,
              }}
            />
          ))}
        </div>

        {isConversation ? (
          <div className="flex gap-1.5">
            <button
              onClick={() => void convo.toggleConversation()}
              disabled={!canUseVoice && !convo.conversationActive}
              className={`
                flex-1 py-3 border flex items-center justify-center gap-2
                transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed
                ${convo.conversationActive
                  ? 'border-amber-400/60 bg-amber-400/10 text-amber-300'
                  : 'border-white/10 text-white/30 hover:border-white/30 hover:text-white/60 hover:bg-white/5'
                }
              `}
            >
              <MessageCircle size={14} className={convo.conversationActive ? 'animate-pulse' : ''} />
              <span className="text-[10px] tracking-widest uppercase">
                {convo.conversationActive ? 'End' : 'Start'}
              </span>
            </button>
            {convo.conversationActive && (
              <button
                onClick={convo.sendNow}
                disabled={isBusy}
                className="px-4 py-3 border border-white/10 text-white/30 hover:border-amber-400/40 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] tracking-widest uppercase"
              >
                Send
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => void push.toggleListening()}
            disabled={isBusy || (!canUseVoice && push.phase === 'idle')}
            className={`
              w-full py-3 border flex items-center justify-center gap-2
              transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed
              ${push.phase === 'listening'
                ? 'border-amber-400/60 bg-amber-400/10 text-amber-300'
                : 'border-white/10 text-white/30 hover:border-white/30 hover:text-white/60 hover:bg-white/5'
              }
            `}
          >
            {push.phase === 'listening' ? (
              <Mic size={14} className="animate-pulse" />
            ) : push.phase === 'processing' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <MicOff size={14} />
            )}
            <span className="text-[10px] tracking-widest uppercase">
              {push.phase === 'listening'
                ? 'Release to Send'
                : push.phase === 'processing'
                  ? 'Transcribing…'
                  : push.phase === 'speaking'
                    ? 'Speaking…'
                    : 'Hold Space to Talk'}
            </span>
          </button>
        )}

        {!canUseVoice && !healthLoading && (
          <p className="mt-2 text-[9px] text-amber-400/60 text-center">
            {!ollama
              ? 'Ollama offline — run ollama serve'
              : 'Voice unavailable — open Voice Settings or run npm run voice:whisper'}
          </p>
        )}

        <div className="mt-4 flex-1 overflow-y-auto space-y-3 text-[10px] leading-relaxed min-h-0">
          {isConversation && convo.phase === 'thinking' && (
            <p className="text-white/25 italic animate-pulse">JARVIS is thinking…</p>
          )}

          {isConversation && convo.interimTranscript && (
            <p className="text-white/30 italic">{convo.interimTranscript}</p>
          )}

          {isConversation &&
            convo.turns.map(turn => (
              <div key={turn.id}>
                <div
                  className={`text-[8px] uppercase tracking-widest mb-1 ${
                    turn.role === 'user' ? 'text-white/25' : 'text-amber-400/50'
                  }`}
                >
                  {turn.role === 'user' ? 'You' : 'JARVIS'}
                  {turn.refined && (
                    <span className="text-white/15 ml-1">· refined</span>
                  )}
                </div>
                <p
                  className={
                    turn.role === 'user' ? 'text-white/60' : 'text-amber-100/70'
                  }
                >
                  {turn.text}
                </p>
              </div>
            ))}

          {!isConversation && push.transcript && (
            <div>
              <div className="text-[8px] text-white/25 uppercase tracking-widest mb-1">You</div>
              <p className="text-white/60">{push.transcript}</p>
            </div>
          )}
          {!isConversation && push.reply && (
            <div>
              <div className="text-[8px] text-amber-400/50 uppercase tracking-widest mb-1">
                JARVIS
              </div>
              <p className="text-amber-100/70">{push.reply}</p>
            </div>
          )}

          {displayError && (
            <p className="text-red-400/80 text-[9px]">{displayError}</p>
          )}
        </div>

        {(phase === 'listening' || (isConversation && convo.conversationActive)) && (
          <div className="mt-3">
            <div className="text-[9px] text-white/20 uppercase tracking-wider text-center">
              Input Level
            </div>
            <div className="mt-1 h-1 bg-white/5 overflow-hidden">
              <div
                className="h-full bg-amber-400/60 transition-all duration-100"
                style={{ width: `${volume * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
