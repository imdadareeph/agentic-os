import { useCallback, useEffect, useRef, useState } from 'react'
import { getRecorderMimeType, startMicLevelMeter } from '@/lib/audio'
import { isAbortError } from '@/lib/fetch'
import { think } from '@/services/jarvis'
import { cancelSpeech, speakText, transcribeAudio } from '@/services/voice'
import { peekWhisperStatus } from '@/services/whisper'
import {
  startContinuousRecognition,
  isSpeechRecognitionSupported,
} from '@/services/speech-recognition'
import { getVoiceSettings, useVoiceSettings } from '@/stores/voice-settings-store'
import { createSession, endSession, storeTurn } from '@/services/memory'
import {
  getMemorySettings,
  isMemoryPersistenceEnabled,
  resetSessionMemoryFlags,
} from '@/stores/memory-settings-store'
import type { VitalsResponse } from '@/types/vitals'

export type ConversationPhase =
  | 'idle'
  | 'listening'
  | 'refining'
  | 'thinking'
  | 'speaking'
  | 'error'

export interface ConversationTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: number
  refined?: boolean
}

export interface RealtimeConversationState {
  conversationActive: boolean
  conversationPaused: boolean
  phase: ConversationPhase
  volume: number
  interimTranscript: string
  turns: ConversationTurn[]
  error: string | null
  isActive: boolean
  canStart: boolean
  startConversation: () => Promise<void>
  stopConversation: () => void
  toggleConversation: () => Promise<void>
  pauseConversation: () => void
  resumeConversation: () => void
  clearSession: () => void
}

function newTurnId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function useRealtimeConversation(
  onActivity?: (active: boolean, volume: number) => void,
  vitalsSnapshot?: VitalsResponse | null
): RealtimeConversationState {
  useVoiceSettings()
  const vitalsRef = useRef(vitalsSnapshot)
  vitalsRef.current = vitalsSnapshot ?? null
  const [conversationActive, setConversationActive] = useState(false)
  const [conversationPaused, setConversationPaused] = useState(false)
  const [phase, setPhase] = useState<ConversationPhase>('idle')
  const [volume, setVolume] = useState(0)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [turns, setTurns] = useState<ConversationTurn[]>([])
  const [error, setError] = useState<string | null>(null)

  const stopRecognitionRef = useRef<(() => void) | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const stopMeterRef = useRef<(() => void) | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const turnTextRef = useRef('')
  const interimRef = useRef('')
  const processingRef = useRef(false)
  const activeRef = useRef(false)
  const pausedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const turnsRef = useRef<ConversationTurn[]>([])
  /** Backend memory session (null = runtime unavailable; memory silently off). */
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    turnsRef.current = turns
  }, [turns])

  /** Fire-and-forget turn persistence — a failed store must never block speech. */
  const persistTurn = useCallback(
    (id: string, role: 'user' | 'assistant', content: string, refined = false) => {
      const sessionId = sessionIdRef.current
      if (!sessionId || !isMemoryPersistenceEnabled()) return
      void storeTurn(sessionId, { id, role, content, refined }).catch(() => {})
    },
    []
  )

  const isActive =
    conversationActive &&
    !conversationPaused &&
    (phase === 'listening' || phase === 'refining' || phase === 'thinking' || phase === 'speaking')

  const canStart = isSpeechRecognitionSupported()

  const onActivityRef = useRef(onActivity)
  onActivityRef.current = onActivity
  const lastActivityPushRef = useRef({ active: false, volume: 0 })

  useEffect(() => {
    const prev = lastActivityPushRef.current
    const volumeDelta = Math.abs(volume - prev.volume)
    if (prev.active === isActive && volumeDelta < 0.03) return
    lastActivityPushRef.current = { active: isActive, volume }
    onActivityRef.current?.(isActive, volume)
  }, [isActive, volume])

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const stopVolumeLoop = useCallback(() => {
    stopMeterRef.current?.()
    stopMeterRef.current = null
    setVolume(0)
  }, [])

  const stopRecorder = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      const blob = chunksRef.current.length
        ? new Blob(chunksRef.current, { type: recorder?.mimeType || 'audio/webm' })
        : null
      chunksRef.current = []
      return blob
    }

    const mimeType = recorder.mimeType || 'audio/webm'
    const blob = await Promise.race<Blob | null>([
      new Promise<Blob | null>(resolve => {
        recorder.onstop = () => {
          const out = chunksRef.current.length
            ? new Blob(chunksRef.current, { type: mimeType })
            : null
          chunksRef.current = []
          resolve(out)
        }
        if (recorder.state === 'recording') {
          recorder.requestData()
          recorder.stop()
        } else {
          resolve(
            chunksRef.current.length ? new Blob(chunksRef.current, { type: mimeType }) : null
          )
          chunksRef.current = []
        }
      }),
      new Promise<Blob | null>(resolve => {
        setTimeout(() => {
          chunksRef.current = []
          recorderRef.current = null
          resolve(null)
        }, 2500)
      }),
    ])
    recorderRef.current = null
    return blob
  }, [])

  const startRecorder = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return

    const mimeType = getRecorderMimeType()
    if (!mimeType) return

    if (recorderRef.current?.state === 'recording') return

    const recorder = new MediaRecorder(stream, { mimeType })
    chunksRef.current = []
    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.start(250)
    recorderRef.current = recorder
  }, [])

  /** Arm MediaRecorder only when Whisper refine needs audio — avoids mic contention with live STT. */
  const ensureRecording = useCallback(() => {
    const cfg = getVoiceSettings()
    if (!cfg.whisperRefine || cfg.sttFinalProvider === 'voicebox') return
    startRecorder()
  }, [startRecorder])

  const cleanupMedia = useCallback(() => {
    stopVolumeLoop()
    void stopRecorder()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
  }, [stopRecorder, stopVolumeLoop])

  const stopRecognition = useCallback(() => {
    stopRecognitionRef.current?.()
    stopRecognitionRef.current = null
  }, [])

  const interruptActiveWork = useCallback(() => {
    clearSilenceTimer()
    stopRecognition()
    abortRef.current?.abort()
    abortRef.current = null
    cancelSpeech()
    processingRef.current = false
    setInterimTranscript('')
    turnTextRef.current = ''
    interimRef.current = ''
    lastInterimRef.current = ''
  }, [clearSilenceTimer, stopRecognition])

  const lastInterimRef = useRef('')
  const scheduleTurnEnd = useCallback(
    (delayMs?: number) => {
      if (pausedRef.current) return
      clearSilenceTimer()
      const cfg = getVoiceSettings()
      const wait = delayMs ?? cfg.turnSilenceMs
      silenceTimerRef.current = setTimeout(() => {
        if (pausedRef.current) return
        const combined = `${turnTextRef.current} ${interimRef.current}`.trim()
        if (combined) void processTurnRef.current?.(combined)
      }, wait)
    },
    [clearSilenceTimer]
  )

  const beginRecognition = useCallback(() => {
    if (!activeRef.current || pausedRef.current) return
    stopRecognition()
    lastInterimRef.current = ''

    stopRecognitionRef.current = startContinuousRecognition({
      onInterim: text => {
        if (processingRef.current || pausedRef.current) return
        if (text === lastInterimRef.current) return
        lastInterimRef.current = text
        interimRef.current = text
        setInterimTranscript(text)
        ensureRecording()
        scheduleTurnEnd()
      },
      onFinal: text => {
        if (processingRef.current || pausedRef.current) return
        turnTextRef.current = `${turnTextRef.current} ${text}`.trim()
        interimRef.current = ''
        lastInterimRef.current = ''
        setInterimTranscript('')
        ensureRecording()
        scheduleTurnEnd(350)
      },
      onError: msg => {
        if (activeRef.current && !processingRef.current && !pausedRef.current) setError(msg)
      },
      onEnd: () => {},
    })
  }, [ensureRecording, scheduleTurnEnd, stopRecognition])

  const resumeListening = useCallback(() => {
    if (!activeRef.current || pausedRef.current) {
      if (!activeRef.current) setPhase('idle')
      return
    }
    setPhase('listening')
    beginRecognition()
  }, [beginRecognition])

  const processTurnRef = useRef<(text: string) => Promise<void>>(async () => {})

  processTurnRef.current = async (browserText: string) => {
    if (processingRef.current || !activeRef.current || pausedRef.current) return
    const cfg = getVoiceSettings()
    const trimmed = browserText.trim()
    if (trimmed.length < cfg.minTurnChars) {
      setError(`Speak at least ${cfg.minTurnChars} characters — heard: "${trimmed || '…'}"`)
      return
    }

    setError(null)
    processingRef.current = true
    clearSilenceTimer()
    stopRecognition()
    setInterimTranscript('')
    interimRef.current = ''
    turnTextRef.current = ''
    lastInterimRef.current = ''

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const turnId = newTurnId()
    setTurns(prev => [
      ...prev,
      { id: turnId, role: 'user', text: trimmed, timestamp: Date.now() },
    ])
    persistTurn(turnId, 'user', trimmed)

    const finalText = trimmed
    setPhase('thinking')

    // Turn limit migrated from JarvisSettings.conversationMemory (M1).
    const memoryCount = Math.max(0, getMemorySettings().conversationTurnLimit)
    const history =
      memoryCount > 0
        ? turnsRef.current.slice(-memoryCount * 2)
        : []

    void (async () => {
      const whisperOnline = peekWhisperStatus()?.online === true
      const shouldRefine =
        cfg.whisperRefine &&
        (cfg.sttFinalProvider === 'voicebox' || whisperOnline)

      if (!shouldRefine || pausedRef.current) return

      const blob = await stopRecorder()
      if (!blob || blob.size <= 1000 || pausedRef.current) return

      try {
        const refined = await transcribeAudio(blob)
        if (pausedRef.current) return
        const whisperText = refined.text.trim()
        if (whisperText && whisperText !== finalText) {
          setTurns(prev =>
            prev.map(t => (t.id === turnId ? { ...t, text: whisperText, refined: true } : t))
          )
          // Same id → INSERT OR REPLACE upgrades the stored turn to the refined text.
          persistTurn(turnId, 'user', whisperText, true)
        }
      } catch {
        // Browser transcript is authoritative when refine is unavailable
      }
    })()

    try {
      const reply = await think(finalText, history, vitalsRef.current, controller.signal)
      if (pausedRef.current || controller.signal.aborted) return

      const assistantId = newTurnId()
      setTurns(prev => [
        ...prev,
        { id: assistantId, role: 'assistant', text: reply, timestamp: Date.now() },
      ])
      persistTurn(assistantId, 'assistant', reply)
      setPhase('speaking')
      try {
        await speakText(reply, cfg.voiceboxProfile)
      } catch (speakErr) {
        if (isAbortError(speakErr) || pausedRef.current) return
        setError(
          speakErr instanceof Error
            ? speakErr.message
            : 'Speech playback failed — check Voice Settings'
        )
      }
      if (!pausedRef.current) resumeListening()
    } catch (err) {
      if (isAbortError(err) || pausedRef.current) return
      const message = err instanceof Error ? err.message : 'Conversation failed'
      setError(message)
      resumeListening()
    } finally {
      processingRef.current = false
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }

  const startConversation = useCallback(async () => {
    if (!canStart) {
      setError('Live speech recognition requires Chrome or Edge')
      setPhase('error')
      return
    }

    setError(null)
    setInterimTranscript('')
    turnTextRef.current = ''
    interimRef.current = ''
    processingRef.current = false
    pausedRef.current = false
    setConversationPaused(false)
    activeRef.current = true
    setConversationActive(true)
    setPhase('listening')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Backend memory session — fire-and-forget; null when runtime is down.
      // Skipped entirely when memory is off or incognito (memory.md §4.1 rule).
      if (!sessionIdRef.current && isMemoryPersistenceEnabled()) {
        void createSession()
          .then(id => {
            sessionIdRef.current = id
          })
          .catch(() => {})
      }

      beginRecognition()

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      await audioCtx.resume()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      source.connect(analyser)

      stopMeterRef.current?.()
      stopMeterRef.current = startMicLevelMeter(analyser, setVolume)
    } catch (err) {
      activeRef.current = false
      setConversationActive(false)
      cleanupMedia()
      stopRecognition()
      setError(err instanceof Error ? err.message : 'Microphone access denied')
      setPhase('error')
    }
  }, [beginRecognition, canStart, cleanupMedia, stopRecognition])

  const pauseConversation = useCallback(() => {
    if (!activeRef.current) return
    pausedRef.current = true
    setConversationPaused(true)
    interruptActiveWork()
    setPhase('idle')
  }, [interruptActiveWork])

  const resumeConversation = useCallback(() => {
    if (!activeRef.current || !pausedRef.current) return
    pausedRef.current = false
    setConversationPaused(false)
    turnTextRef.current = ''
    interimRef.current = ''
    lastInterimRef.current = ''
    setInterimTranscript('')
    setError(null)
    setPhase('listening')
    beginRecognition()
  }, [beginRecognition])

  const stopConversation = useCallback(() => {
    interruptActiveWork()
    activeRef.current = false
    pausedRef.current = false
    setConversationPaused(false)
    setConversationActive(false)
    cleanupMedia()
    setPhase('idle')
  }, [cleanupMedia, interruptActiveWork])

  const toggleConversation = useCallback(async () => {
    if (conversationActive || conversationPaused) stopConversation()
    else await startConversation()
  }, [conversationActive, conversationPaused, startConversation, stopConversation])

  const clearSession = useCallback(() => {
    setTurns([])
    turnsRef.current = []
    setInterimTranscript('')
    turnTextRef.current = ''
    interimRef.current = ''
    lastInterimRef.current = ''
    setError(null)
    // Incognito: no reads, no writes — skip the endSession/createSession round trip
    // entirely (memory.md §4.1). Otherwise end the backend session and mint a new one.
    const wasIncognito = getMemorySettings().incognitoMode
    const memoryWasOn = isMemoryPersistenceEnabled()
    // NEW SESSION resets session-scoped toggles.
    resetSessionMemoryFlags()
    if (wasIncognito || !memoryWasOn) {
      sessionIdRef.current = null
      return
    }
    const prior = sessionIdRef.current
    sessionIdRef.current = null
    void (async () => {
      if (prior) await endSession(prior)
      sessionIdRef.current = await createSession()
    })().catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      activeRef.current = false
      pausedRef.current = false
      interruptActiveWork()
      cleanupMedia()
    }
  }, [cleanupMedia, interruptActiveWork])

  return {
    conversationActive,
    conversationPaused,
    phase,
    volume,
    interimTranscript,
    turns,
    error,
    isActive,
    canStart,
    startConversation,
    stopConversation,
    toggleConversation,
    pauseConversation,
    resumeConversation,
    clearSession,
  }
}
