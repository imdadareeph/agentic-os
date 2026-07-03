import { useEffect, useSyncExternalStore } from 'react'
import { GITNEXUS_ENABLED } from '@/config/services'
import { getProviderDefinition } from '@/config/ai-providers'
import { getVoiceStatus, type VoiceServiceStatus } from '@/services/voice'
import { checkGitNexusHealth } from '@/services/gitnexus'
import { checkActiveProviderHealth } from '@/services/llm/router'
import type { AiProviderId } from '@/config/ai-providers'

export interface BrainStatus {
  provider: AiProviderId
  label: string
  online: boolean
  model?: string
}

export interface ServiceStatus {
  voice: VoiceServiceStatus
  brain: BrainStatus
  /** @deprecated Use brain.online */
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

const offlineBrain: BrainStatus = {
  provider: 'ollama',
  label: 'Ollama',
  online: false,
}

const initialStatus: ServiceStatus = {
  voice: offlineVoice,
  brain: offlineBrain,
  ollama: false,
  gitnexus: false,
  loading: true,
}

let cachedStatus: ServiceStatus = initialStatus
let pollIntervalMs = 10_000
let intervalId: ReturnType<typeof setInterval> | undefined
let inflightPoll: Promise<ServiceStatus> | undefined
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

async function runPoll(): Promise<ServiceStatus> {
  if (inflightPoll) return inflightPoll

  inflightPoll = (async () => {
    const [voice, brainHealth, gitnexus] = await Promise.all([
      getVoiceStatus(),
      checkActiveProviderHealth(),
      GITNEXUS_ENABLED ? checkGitNexusHealth() : Promise.resolve(false),
    ])

    const brain: BrainStatus = {
      provider: brainHealth.provider,
      label: getProviderDefinition(brainHealth.provider).label,
      online: brainHealth.online,
      model: brainHealth.model,
    }

    return {
      voice,
      brain,
      ollama: brain.provider === 'ollama' && brain.online,
      gitnexus,
      loading: false,
    }
  })()

  try {
    cachedStatus = await inflightPoll
    emit()
    return cachedStatus
  } finally {
    inflightPoll = undefined
  }
}

function ensurePolling(intervalMs: number) {
  pollIntervalMs = intervalMs
  if (intervalId !== undefined) return

  void runPoll()
  intervalId = setInterval(() => {
    void runPoll()
  }, pollIntervalMs)
}

function maybeStopPolling() {
  if (listeners.size > 0) return
  if (intervalId === undefined) return
  clearInterval(intervalId)
  intervalId = undefined
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  ensurePolling(pollIntervalMs)
  return () => {
    listeners.delete(listener)
    maybeStopPolling()
  }
}

function getSnapshot(): ServiceStatus {
  return cachedStatus
}

export function useServiceHealth(intervalMs = 10_000): ServiceStatus {
  useEffect(() => {
    if (intervalMs !== pollIntervalMs) {
      pollIntervalMs = intervalMs
      if (intervalId !== undefined) {
        clearInterval(intervalId)
        intervalId = undefined
        ensurePolling(intervalMs)
      }
    }
  }, [intervalMs])

  useEffect(() => {
    const onAiChange = () => {
      void runPoll()
    }
    window.addEventListener('ai-settings-changed', onAiChange)
    return () => window.removeEventListener('ai-settings-changed', onAiChange)
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
