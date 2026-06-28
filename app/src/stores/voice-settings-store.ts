import { useCallback, useEffect, useState } from 'react'
import {
  VOICE_ENV_DEFAULTS,
  type SttFinalProvider,
  type TtsProvider,
  type VoiceMode,
} from '@/config/voice'

export const VOICE_SETTINGS_SCHEMA_VERSION = 2
const STORAGE_KEY = 'agentic-os-voice-settings'

export interface VoiceSettings {
  schemaVersion: number
  voiceMode: VoiceMode
  turnSilenceMs: number
  whisperRefine: boolean
  minTurnChars: number
  sttFinalProvider: SttFinalProvider
  whisperModel: string
  whisperBaseUrl: string
  voiceboxSttFallback: boolean
  ttsProvider: TtsProvider
  browserVoiceName: string
  ttsRate: number
  ttsPitch: number
  voiceboxProfile: string
  voiceboxEnabled: boolean
  ambientMusicEnabled: boolean
  ambientMusicVolume: number
}

export function getDefaultVoiceSettings(): VoiceSettings {
  return {
    schemaVersion: VOICE_SETTINGS_SCHEMA_VERSION,
    voiceMode: VOICE_ENV_DEFAULTS.voiceMode,
    turnSilenceMs: VOICE_ENV_DEFAULTS.turnSilenceMs,
    whisperRefine: VOICE_ENV_DEFAULTS.whisperRefine,
    minTurnChars: VOICE_ENV_DEFAULTS.minTurnChars,
    sttFinalProvider: VOICE_ENV_DEFAULTS.sttFinalProvider,
    whisperModel: VOICE_ENV_DEFAULTS.whisperModel,
    whisperBaseUrl: VOICE_ENV_DEFAULTS.whisperBaseUrl,
    voiceboxSttFallback: VOICE_ENV_DEFAULTS.voiceboxSttFallback,
    ttsProvider: VOICE_ENV_DEFAULTS.ttsProvider,
    browserVoiceName: VOICE_ENV_DEFAULTS.browserVoiceName,
    ttsRate: VOICE_ENV_DEFAULTS.ttsRate,
    ttsPitch: VOICE_ENV_DEFAULTS.ttsPitch,
    voiceboxProfile: VOICE_ENV_DEFAULTS.voiceboxProfile,
    voiceboxEnabled: VOICE_ENV_DEFAULTS.voiceboxEnabled,
    ambientMusicEnabled: true,
    ambientMusicVolume: 0.12,
  }
}

function migrate(stored: Partial<VoiceSettings>): VoiceSettings {
  const defaults = getDefaultVoiceSettings()
  return { ...defaults, ...stored, schemaVersion: VOICE_SETTINGS_SCHEMA_VERSION }
}

export function loadVoiceSettings(): VoiceSettings {
  if (typeof window === 'undefined') return getDefaultVoiceSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultVoiceSettings()
    return migrate(JSON.parse(raw) as Partial<VoiceSettings>)
  } catch {
    return getDefaultVoiceSettings()
  }
}

export function saveVoiceSettings(partial: Partial<VoiceSettings>): VoiceSettings {
  const next = migrate({ ...loadVoiceSettings(), ...partial })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('voice-settings-changed', { detail: next }))
  return next
}

export function resetVoiceSettings(): VoiceSettings {
  localStorage.removeItem(STORAGE_KEY)
  const defaults = getDefaultVoiceSettings()
  window.dispatchEvent(new CustomEvent('voice-settings-changed', { detail: defaults }))
  return defaults
}

export function getVoiceSettings(): VoiceSettings {
  return loadVoiceSettings()
}

export function useVoiceSettings(): [VoiceSettings, (partial: Partial<VoiceSettings>) => void] {
  const [settings, setSettings] = useState(loadVoiceSettings)

  useEffect(() => {
    const onChange = (e: Event) => {
      setSettings((e as CustomEvent<VoiceSettings>).detail)
    }
    window.addEventListener('voice-settings-changed', onChange)
    return () => window.removeEventListener('voice-settings-changed', onChange)
  }, [])

  const update = useCallback((partial: Partial<VoiceSettings>) => {
    setSettings(saveVoiceSettings(partial))
  }, [])

  return [settings, update]
}
