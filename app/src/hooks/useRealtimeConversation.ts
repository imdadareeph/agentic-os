import { useCallback, useEffect, useRef, useState } from 'react'
import { getRecorderMimeType } from '@/lib/audio'
import { think } from '@/services/jarvis'
import { speakText, transcribeAudio } from '@/services/voice'
import { peekWhisperStatus } from '@/services/whisper'
import {
  startContinuousRecognition,
  isSpeechRecognitionSupported,
} from '@/services/speech-recognition'
import { getVoiceSettings, useVoiceSettings } from '@/stores/voice-settings-store'
import { getJarvisSettings } from '@/stores/jarvis-settings-store'
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
  sendNow: () => void
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
  const [phase, setPhase] = useState<ConversationPhase>('idle')
  const [volume, setVolume] = useState(0)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [turns, setTurns] = useState<ConversationTurn[]>([])
  const [error, setError] = useState<string | null>(null)

  const stopRecognitionRef = useRef<(() => void) | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const rafRef = useRef<number>(0)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const turnTextRef = useRef('')
  const interimRef = useRef('')
  const processingRef = useRef(false)
  const activeRef = useRef(false)
  const turnsRef = useRef<ConversationTurn[]>([])

  useEffect(() => {
    turnsRef.current = turns
  }, [turns])

  const isActive =
    conversationActive &&
    (phase === 'listening' || phase === 'refining' || phase === 'thinking' || phase === 'speaking')

  const canStart = isSpeechRecognitionSupported()

  useEffect(() => {
    onActivity?.(isActive, volume)
  }, [isActive, volume, onActivity])

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const stopVolumeLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
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

  const lastInterimRef = useRef('')
  const scheduleTurnEnd = useCallback(
    (delayMs?: number) => {
      clearSilenceTimer()
      const cfg = getVoiceSettings()
      const wait = delayMs ?? cfg.turnSilenceMs
      silenceTimerRef.current = setTimeout(() => {
        const combined = `${turnTextRef.current} ${interimRef.current}`.trim()
        if (combined) void processTurnRef.current?.(combined)
      }, wait)
    },
    [clearSilenceTimer]
  )

  const beginRecognition = useCallback(() => {
    if (!activeRef.current) return
    stopRecognition()
    lastInterimRef.current = ''

    stopRecognitionRef.current = startContinuousRecognition({
      onInterim: text => {
        if (processingRef.current) return
        if (text === lastInterimRef.current) return
        lastInterimRef.current = text
        interimRef.current = text
        setInterimTranscript(text)
        scheduleTurnEnd()
      },
      onFinal: text => {
        if (processingRef.current) return
        turnTextRef.current = `${turnTextRef.current} ${text}`.trim()
        interimRef.current = ''
        lastInterimRef.current = ''
        setInterimTranscript('')
        // Final segments mean the user paused — commit quickly
        scheduleTurnEnd(350)
      },
      onError: msg => {
        if (activeRef.current && !processingRef.current) setError(msg)
      },
      onEnd: () => {},
    })
  }, [scheduleTurnEnd, stopRecognition])

  const resumeListening = useCallback(() => {
    if (!activeRef.current) {
      setPhase('idle')
      return
    }
    setPhase('listening')
    startRecorder()
    beginRecognition()
  }, [beginRecognition, startRecorder])

  const processTurnRef = useRef<(text: string) => Promise<void>>(async () => {})

  processTurnRef.current = async (browserText: string) => {
    if (processingRef.current || !activeRef.current) return
    const cfg = getVoiceSettings()
    const trimmed = browserText.trim()
    if (trimmed.length < cfg.minTurnChars) return

    processingRef.current = true
    clearSilenceTimer()
    stopRecognition()
    setInterimTranscript('')
    interimRef.current = ''
    turnTextRef.current = ''
    lastInterimRef.current = ''

    const turnId = newTurnId()
    setTurns(prev => [
      ...prev,
      { id: turnId, role: 'user', text: trimmed, timestamp: Date.now() },
    ])

    const finalText = trimmed
    setPhase('thinking')

    const jarvisCfg = getJarvisSettings()
    const memoryCount = Math.max(0, jarvisCfg.conversationMemory)
    const history =
      memoryCount > 0
        ? turnsRef.current.slice(-memoryCount * 2)
        : []

    // Refine in background — never block JARVIS from replying
    void (async () => {
      const whisperOnline = peekWhisperStatus()?.online === true
      const shouldRefine =
        cfg.whisperRefine &&
        (cfg.sttFinalProvider === 'voicebox' || whisperOnline)

      if (!shouldRefine) return

      const blob = await stopRecorder()
      if (!blob || blob.size <= 1000) {
        startRecorder()
        return
      }

      try {
        const refined = await transcribeAudio(blob)
        const whisperText = refined.text.trim()
        if (whisperText && whisperText !== finalText) {
          setTurns(prev =>
            prev.map(t => (t.id === turnId ? { ...t, text: whisperText, refined: true } : t))
          )
        }
      } catch {
        // Browser transcript is authoritative when refine is unavailable
      } finally {
        if (activeRef.current && !processingRef.current) startRecorder()
      }
    })()

    try {
      const reply = await think(finalText, history, vitalsRef.current)
      setTurns(prev => [
        ...prev,
        { id: newTurnId(), role: 'assistant', text: reply, timestamp: Date.now() },
      ])
      setPhase('speaking')
      try {
        await speakText(reply, cfg.voiceboxProfile)
      } catch (speakErr) {
        setError(
          speakErr instanceof Error
            ? speakErr.message
            : 'Speech playback failed — check Voice Settings'
        )
      }
      resumeListening()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Conversation failed'
      setError(message)
      resumeListening()
    } finally {
      processingRef.current = false
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
    activeRef.current = true
    setConversationActive(true)
    setPhase('listening')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        setVolume(Math.min(1, (sum / data.length / 255) * 2.5))
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)

      startRecorder()
      beginRecognition()
    } catch (err) {
      activeRef.current = false
      setConversationActive(false)
      cleanupMedia()
      stopRecognition()
      setError(err instanceof Error ? err.message : 'Microphone access denied')
      setPhase('error')
    }
  }, [beginRecognition, canStart, cleanupMedia, startRecorder, stopRecognition])

  const stopConversation = useCallback(() => {
    activeRef.current = false
    setConversationActive(false)
    clearSilenceTimer()
    stopRecognition()
    cleanupMedia()
    setInterimTranscript('')
    turnTextRef.current = ''
    interimRef.current = ''
    processingRef.current = false
    setPhase('idle')
  }, [clearSilenceTimer, cleanupMedia, stopRecognition])

  const toggleConversation = useCallback(async () => {
    if (conversationActive) stopConversation()
    else await startConversation()
  }, [conversationActive, startConversation, stopConversation])

  const sendNow = useCallback(() => {
    const combined = `${turnTextRef.current} ${interimRef.current}`.trim()
    if (!combined || processingRef.current) return
    clearSilenceTimer()
    void processTurnRef.current?.(combined)
  }, [clearSilenceTimer])

  const clearSession = useCallback(() => {
    setTurns([])
    turnsRef.current = []
    setInterimTranscript('')
    turnTextRef.current = ''
    interimRef.current = ''
    lastInterimRef.current = ''
    setError(null)
  }, [])

  useEffect(() => {
    return () => {
      activeRef.current = false
      clearSilenceTimer()
      stopRecognition()
      cleanupMedia()
    }
  }, [clearSilenceTimer, cleanupMedia, stopRecognition])

  return {
    conversationActive,
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
    sendNow,
    clearSession,
  }
}
