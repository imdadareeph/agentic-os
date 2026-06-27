import { useEffect, useState } from 'react'
import { getVoiceStatus, type VoiceServiceStatus } from '@/services/voice'
import { checkOllamaHealth } from '@/services/ollama'
import { checkGitNexusHealth } from '@/services/gitnexus'

export interface ServiceStatus {
  voice: VoiceServiceStatus
  ollama: boolean
  gitnexus: boolean
  loading: boolean
}

const offlineVoice: VoiceServiceStatus = {
  liveSttReady: false,
  sttReady: false,
  sttProvider: 'whisper',
  ttsReady: false,
  ttsProvider: 'browser',
}

export function useServiceHealth(intervalMs = 10_000): ServiceStatus {
  const [status, setStatus] = useState<ServiceStatus>({
    voice: offlineVoice,
    ollama: false,
    gitnexus: false,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false

    async function poll() {
      const [voice, ollama, gitnexus] = await Promise.all([
        getVoiceStatus(),
        checkOllamaHealth(),
        checkGitNexusHealth(),
      ])
      if (!cancelled) {
        setStatus({ voice, ollama, gitnexus, loading: false })
      }
    }

    poll()
    const id = setInterval(poll, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [intervalMs])

  return status
}
