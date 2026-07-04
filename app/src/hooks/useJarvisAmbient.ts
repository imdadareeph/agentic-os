import { useEffect } from 'react'
import {
  setJarvisAmbientVolume,
  startJarvisAmbient,
  stopJarvisAmbient,
} from '@/lib/jarvis-ambient'
import type { ConversationPhase } from '@/hooks/useRealtimeConversation'
import type { VoicePhase } from '@/hooks/useVoiceAssistant'

type JarvisPhase = ConversationPhase | VoicePhase

function effectiveVolume(
  baseVolume: number,
  phase: JarvisPhase,
  conversationPaused: boolean
): number {
  if (conversationPaused) return baseVolume
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
  conversationPaused?: boolean
  enabled: boolean
  baseVolume: number
}

export function useJarvisAmbient({
  sessionActive,
  phase,
  conversationPaused = false,
  enabled,
  baseVolume,
}: UseJarvisAmbientOptions): void {
  useEffect(() => {
    if (!enabled || !sessionActive) {
      stopJarvisAmbient()
      return
    }

    void startJarvisAmbient(effectiveVolume(baseVolume, phase, conversationPaused))

    return () => {
      stopJarvisAmbient()
    }
  }, [enabled, sessionActive])

  useEffect(() => {
    if (!enabled || !sessionActive) return
    setJarvisAmbientVolume(effectiveVolume(baseVolume, phase, conversationPaused))
  }, [enabled, sessionActive, phase, conversationPaused, baseVolume])
}
