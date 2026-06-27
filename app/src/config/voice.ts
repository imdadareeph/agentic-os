/** Voice pipeline defaults — runtime overrides via voice-settings-store. */

export type SttProvider = 'whisper' | 'voicebox'
export type TtsProvider = 'browser' | 'voicebox'
export type VoiceMode = 'conversation' | 'push'
export type SttFinalProvider = 'whisper' | 'voicebox'

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = import.meta.env[name]
  if (raw === undefined || raw === '') return defaultValue
  return raw === 'true' || raw === '1'
}

function envString(name: string, fallback: string): string {
  const raw = import.meta.env[name]
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback
}

function envNumber(name: string, fallback: number): number {
  const raw = import.meta.env[name]
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export const VOICE_ENV_DEFAULTS = {
  voiceMode: envString('VITE_VOICE_MODE', 'conversation') as VoiceMode,
  turnSilenceMs: envNumber('VITE_TURN_SILENCE_MS', 1200),
  whisperRefine: envFlag('VITE_WHISPER_REFINE', false),
  minTurnChars: envNumber('VITE_MIN_TURN_CHARS', 3),
  sttFinalProvider: envString('VITE_STT_FINAL_PROVIDER', 'whisper') as SttFinalProvider,
  whisperBaseUrl: envString('VITE_WHISPER_BASE', '/whisper'),
  whisperModel: envString('VITE_WHISPER_MODEL', 'whisper-1'),
  voiceboxSttFallback: true,
  ttsProvider: envString('VITE_TTS_PROVIDER', 'browser') as TtsProvider,
  browserVoiceName: envString('VITE_TTS_VOICE', ''),
  ttsRate: envNumber('VITE_TTS_RATE', 1),
  ttsPitch: envNumber('VITE_TTS_PITCH', 1),
  voiceboxProfile: envString('VITE_VOICEBOX_PROFILE', 'Jarvis'),
  voiceboxEnabled: envFlag('VITE_VOICEBOX_ENABLED', false),
  voiceboxBaseUrl: envString('VITE_VOICEBOX_BASE', '/voicebox'),
} as const

/** @deprecated Use getVoiceSettings() from voice-settings-store */
export const VOICE_CONFIG = {
  stt: {
    provider: VOICE_ENV_DEFAULTS.sttFinalProvider,
    baseUrl: VOICE_ENV_DEFAULTS.whisperBaseUrl,
    model: VOICE_ENV_DEFAULTS.whisperModel,
  },
  tts: {
    provider: VOICE_ENV_DEFAULTS.ttsProvider,
    voiceName: VOICE_ENV_DEFAULTS.browserVoiceName,
    rate: VOICE_ENV_DEFAULTS.ttsRate,
    pitch: VOICE_ENV_DEFAULTS.ttsPitch,
  },
  voicebox: {
    enabled: VOICE_ENV_DEFAULTS.voiceboxEnabled,
    baseUrl: VOICE_ENV_DEFAULTS.voiceboxBaseUrl,
    profile: VOICE_ENV_DEFAULTS.voiceboxProfile,
  },
} as const

export function isVoiceboxEnabled(): boolean {
  return VOICE_ENV_DEFAULTS.voiceboxEnabled
}
