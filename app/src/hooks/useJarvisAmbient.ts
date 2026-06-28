import { useEffect } from 'react'
import type { ConversationPhase } from '@/hooks/useRealtimeConversation'
import type { VoicePhase } from '@/hooks/useVoiceAssistant'
import {
  setJarvisAmbientVolume,
  startJarvisAmbient,
  stopJarvisAmbient,
} from '@/lib/jarvis-ambient'

type JarvisPhase = ConversationPhase | VoicePhase

function effectiveVolume(baseVolume: number, phase: JarvisPhase): number {
  switch (phase) {
    case 'listening':
    case 'processing':
      return 0
    case 'speaking':
      return baseVolume * 0.25
    case 'thinking':
    case 'refining':
      return baseVolume * 0.5
    default:
      return baseVolume
  }
}

interface UseJarvisAmbientOptions {
  sessionActive: boolean
  phase: JarvisPhase
  enabled: boolean
  baseVolume: number
}

export function useJarvisAmbient({
  sessionActive,
  phase,
  enabled,
  baseVolume,
}: UseJarvisAmbientOptions): void {
  useEffect(() => {
    if (!enabled || !sessionActive) {
      stopJarvisAmbient()
      return
    }

    void startJarvisAmbient(effectiveVolume(baseVolume, phase))

    return () => {
      stopJarvisAmbient()
    }
  }, [enabled, sessionActive])

  useEffect(() => {
    if (!enabled || !sessionActive) return
    setJarvisAmbientVolume(effectiveVolume(baseVolume, phase))
  }, [enabled, sessionActive, phase, baseVolume])
}
