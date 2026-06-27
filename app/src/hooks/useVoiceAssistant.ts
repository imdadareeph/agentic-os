import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio } from '@/services/voice'
import { respondWithVoice } from '@/services/jarvis'
import { getRecorderMimeType } from '@/lib/audio'

export type VoicePhase = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

export interface VoiceAssistantState {
  phase: VoicePhase
  volume: number
  transcript: string
  reply: string
  error: string | null
  isActive: boolean
  startListening: () => Promise<void>
  stopListening: () => Promise<void>
  toggleListening: () => Promise<void>
}

export function useVoiceAssistant(
  onActivity?: (active: boolean, volume: number) => void
): VoiceAssistantState {
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [volume, setVolume] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)

  const isActive = phase === 'listening' || phase === 'processing' || phase === 'speaking'

  useEffect(() => {
    onActivity?.(isActive, volume)
  }, [isActive, volume, onActivity])

  const stopVolumeLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setVolume(0)
  }, [])

  const startVolumeLoop = useCallback((analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i]
      const avg = sum / data.length / 255
      setVolume(Math.min(1, avg * 2.5))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const cleanupStream = useCallback(() => {
    stopVolumeLoop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    analyserRef.current = null
  }, [stopVolumeLoop])

  const startListening = useCallback(async () => {
    if (phase === 'listening' || phase === 'processing') return

    setError(null)
    setTranscript('')
    setReply('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      startVolumeLoop(analyser)

      const mimeType = getRecorderMimeType()
      if (!mimeType) {
        throw new Error('This browser does not support audio recording')
      }

      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorderRef.current = recorder
      recorder.start(250)
      setPhase('listening')
    } catch (err) {
      cleanupStream()
      setError(err instanceof Error ? err.message : 'Microphone access denied')
      setPhase('error')
    }
  }, [phase, cleanupStream, startVolumeLoop])

  const stopListening = useCallback(async () => {
    if (phase !== 'listening' || !recorderRef.current) return

    const recorder = recorderRef.current
    recorderRef.current = null

    await new Promise<void>(resolve => {
      recorder.onstop = () => resolve()
      if (recorder.state === 'recording') {
        recorder.requestData()
        recorder.stop()
      } else {
        resolve()
      }
    })

    cleanupStream()

    const mimeType = recorder.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    chunksRef.current = []

    if (blob.size < 1000) {
      setError('Recording too short — hold the mic longer')
      setPhase('idle')
      return
    }

    setPhase('processing')

    try {
      const { text } = await transcribeAudio(blob)
      const trimmed = text.trim()
      if (!trimmed) {
        setError('No speech detected')
        setPhase('idle')
        return
      }
      setTranscript(trimmed)

      setPhase('speaking')
      const response = await respondWithVoice(trimmed)
      setReply(response)
      setPhase('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice pipeline failed')
      setPhase('error')
    }
  }, [phase, cleanupStream])

  const toggleListening = useCallback(async () => {
    if (phase === 'listening') {
      await stopListening()
    } else if (phase === 'idle' || phase === 'error') {
      await startListening()
    }
  }, [phase, startListening, stopListening])

  useEffect(() => {
    return () => {
      cleanupStream()
      recorderRef.current?.stop()
    }
  }, [cleanupStream])

  return {
    phase,
    volume,
    transcript,
    reply,
    error,
    isActive,
    startListening,
    stopListening,
    toggleListening,
  }
}
