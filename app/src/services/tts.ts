import { getVoiceSettings } from '@/stores/voice-settings-store'

export interface TtsStatus {
  ready: boolean
  provider: string
  model?: string
  error?: string
}

function pickVoice(preferredName: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices()
  if (!voices.length) return null

  if (preferredName) {
    const match = voices.find(
      v => v.name === preferredName || v.voiceURI === preferredName
    )
    if (match) return match
  }

  return (
    voices.find(v => v.lang.startsWith('en') && /google|samantha|daniel|alex|fred/i.test(v.name)) ??
    voices.find(v => v.lang.startsWith('en') && v.localService) ??
    voices.find(v => v.lang.startsWith('en')) ??
    voices[0]
  )
}

export function listBrowserVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return []
  return speechSynthesis.getVoices()
}

export function getBrowserTtsStatus(): TtsStatus {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { ready: false, provider: 'browser', error: 'Speech Synthesis not supported' }
  }

  const { browserVoiceName } = getVoiceSettings()
  const voice = pickVoice(browserVoiceName)
  return {
    ready: true,
    provider: 'browser',
    model: voice?.name ?? 'System voice',
  }
}

export function cancelBrowserSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    speechSynthesis.cancel()
  }
  if (activeSpeakReject) {
    activeSpeakReject(new DOMException('Speech cancelled', 'AbortError'))
    activeSpeakReject = null
  }
}

let activeSpeakReject: ((err: Error) => void) | null = null

export function speakBrowser(text: string): Promise<void> {
  const { browserVoiceName, ttsRate, ttsPitch } = getVoiceSettings()

  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('Speech Synthesis not supported in this browser'))
      return
    }

    speechSynthesis.cancel()
    activeSpeakReject = reject

    const utterance = new SpeechSynthesisUtterance(text.slice(0, 10_000))
    utterance.rate = Number.isFinite(ttsRate) ? ttsRate : 1
    utterance.pitch = Number.isFinite(ttsPitch) ? ttsPitch : 1
    utterance.lang = 'en-US'

    const assignVoice = () => {
      const voice = pickVoice(browserVoiceName)
      if (voice) utterance.voice = voice
    }

    assignVoice()
    if (!speechSynthesis.getVoices().length) {
      speechSynthesis.addEventListener('voiceschanged', assignVoice, { once: true })
    }

    utterance.onend = () => {
      activeSpeakReject = null
      resolve()
    }
    utterance.onerror = () => {
      activeSpeakReject = null
      reject(new Error('Speech playback failed'))
    }

    speechSynthesis.speak(utterance)
  })
}
