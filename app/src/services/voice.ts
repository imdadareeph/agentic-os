import * as whisper from '@/services/whisper'
import * as browserTts from '@/services/tts'
import * as voicebox from '@/services/voicebox'
import { isSpeechRecognitionSupported } from '@/services/speech-recognition'
import { getVoiceSettings } from '@/stores/voice-settings-store'

export type { TranscriptionResult } from '@/services/whisper'

export interface VoiceServiceStatus {
  liveSttReady: boolean
  sttReady: boolean
  sttProvider: string
  sttModel?: string
  sttFallback?: string
  ttsReady: boolean
  ttsProvider: string
  ttsModel?: string
  ttsFallback?: string
  voicebox?: voicebox.VoiceboxServiceStatus
  sttError?: string
  ttsError?: string
}

async function voiceboxSttReady(): Promise<voicebox.VoiceboxServiceStatus | null> {
  const status = await voicebox.getVoiceboxStatus()
  return status.online && status.sttReady ? status : null
}

async function voiceboxTtsReady(): Promise<voicebox.VoiceboxServiceStatus | null> {
  const status = await voicebox.getVoiceboxStatus()
  return status.online && status.ttsReady ? status : null
}

export async function getVoiceStatus(): Promise<VoiceServiceStatus> {
  const settings = getVoiceSettings()
  const liveSttReady = isSpeechRecognitionSupported()

  let sttReady = liveSttReady
  let sttModel: string | undefined = liveSttReady ? 'Browser live' : undefined
  let sttFallback: string | undefined
  let sttError: string | undefined

  if (settings.sttFinalProvider === 'voicebox') {
    const vb = await voicebox.getVoiceboxStatus()
    if (vb.online && vb.sttReady) {
      sttModel = vb.sttModel
    } else {
      sttReady = false
      sttError = vb.error ?? 'Voicebox STT not ready'
    }
  } else {
    const cached = whisper.peekWhisperStatus()
    const whisperStatus = cached ?? (await whisper.getWhisperStatus())
    if (whisperStatus.online) {
      sttModel = liveSttReady
        ? `Browser + Whisper ${whisperStatus.model}`
        : whisperStatus.model
    } else if (settings.voiceboxSttFallback) {
      const vb = await voiceboxSttReady()
      if (vb) {
        sttModel = liveSttReady ? `Browser + Voicebox ${vb.sttModel}` : vb.sttModel
        sttFallback = 'voicebox'
        sttError = whisperStatus.error
      } else if (!liveSttReady) {
        sttReady = false
        sttError =
          whisperStatus.error ??
          'No STT — run npm run voice:whisper or open Voicebox'
      }
    } else if (!liveSttReady) {
      sttReady = false
      sttError = whisperStatus.error
    }
  }

  let ttsReady = false
  let ttsModel: string | undefined
  let ttsFallback: string | undefined
  let ttsError: string | undefined

  if (settings.ttsProvider === 'voicebox') {
    const vb = await voicebox.getVoiceboxStatus()
    ttsReady = vb.online && vb.ttsReady
    ttsModel = vb.ttsModel
    ttsError = vb.error
  } else {
    const browserStatus = browserTts.getBrowserTtsStatus()
    if (browserStatus.ready) {
      ttsReady = true
      ttsModel = browserStatus.model
    } else {
      const vb = await voiceboxTtsReady()
      if (vb) {
        ttsReady = true
        ttsModel = vb.ttsModel
        ttsFallback = 'voicebox'
        ttsError = browserStatus.error
      } else {
        ttsError = browserStatus.error
      }
    }
  }

  const result: VoiceServiceStatus = {
    liveSttReady,
    sttReady,
    sttProvider: settings.sttFinalProvider,
    sttModel,
    sttFallback,
    ttsReady,
    ttsProvider: settings.ttsProvider,
    ttsModel,
    ttsFallback,
    sttError,
    ttsError,
  }

  if (settings.voiceboxEnabled || sttFallback === 'voicebox' || ttsFallback === 'voicebox') {
    result.voicebox = await voicebox.getVoiceboxStatus()
  }

  return result
}

export async function transcribeAudio(blob: Blob): Promise<whisper.TranscriptionResult> {
  const settings = getVoiceSettings()

  if (settings.sttFinalProvider === 'voicebox') {
    return voicebox.transcribeAudio(blob)
  }

  const cached = whisper.peekWhisperStatus()
  if (cached && !cached.online) {
    if (settings.voiceboxSttFallback) {
      const vb = await voiceboxSttReady()
      if (vb) return voicebox.transcribeAudio(blob)
    }
    throw new Error(
      `${cached.error ?? 'Whisper offline'} — run npm run voice:whisper or enable Voicebox STT fallback`
    )
  }

  try {
    return await whisper.transcribeAudio(blob)
  } catch (primaryErr) {
    if (settings.voiceboxSttFallback) {
      const vb = await voiceboxSttReady()
      if (vb) return voicebox.transcribeAudio(blob)
    }
    const message =
      primaryErr instanceof Error ? primaryErr.message : 'Transcription failed'
    throw new Error(
      message.includes('port 9000')
        ? `${message} — start Voicebox or run npm run voice:whisper`
        : message
    )
  }
}

export async function speakText(text: string, profile?: string): Promise<void> {
  const settings = getVoiceSettings()

  if (settings.ttsProvider === 'voicebox') {
    return voicebox.speakText(text, profile ?? settings.voiceboxProfile)
  }

  try {
    await browserTts.speakBrowser(text)
  } catch (primaryErr) {
    const vb = await voiceboxTtsReady()
    if (vb) {
      return voicebox.speakText(text, profile ?? settings.voiceboxProfile)
    }
    throw primaryErr
  }
}
