export interface SpeechRecognitionCallbacks {
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
  onEnd: () => void
}

interface SpeechRecognitionResultItem {
  transcript: string
}

interface SpeechRecognitionResultListLike {
  length: number
  [index: number]: { isFinal: boolean; [index: number]: SpeechRecognitionResultItem }
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: SpeechRecognitionResultListLike
}

interface SpeechRecognitionErrorEventLike {
  error: string
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type RecognitionCtor = new () => SpeechRecognitionLike
function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    webkitSpeechRecognition?: RecognitionCtor
    SpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null
}

export function startContinuousRecognition(
  callbacks: SpeechRecognitionCallbacks,
  lang = 'en-US'
): () => void {
  const Ctor = getRecognitionCtor()
  if (!Ctor) {
    callbacks.onError('Speech recognition not supported — use Chrome or Edge')
    return () => {}
  }

  let active = true
  let recognition: SpeechRecognitionLike | null = null

  const start = () => {
    if (!active) return
    recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = lang

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = ''
      for (let i = 0; i < event.results.length; i++) {
        const part = event.results[i][0]?.transcript ?? ''
        if (event.results[i].isFinal) {
          if (i >= event.resultIndex && part.trim()) {
            callbacks.onFinal(part.trim())
          }
        } else {
          interim += part
        }
      }
      if (interim.trim()) callbacks.onInterim(interim.trim())
    }

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      callbacks.onError(`Speech recognition: ${event.error}`)
    }

    recognition.onend = () => {
      callbacks.onEnd()
      if (active) start()
    }

    try {
      recognition.start()
    } catch {
      callbacks.onError('Could not start speech recognition')
    }
  }

  start()

  return () => {
    active = false
    recognition?.stop()
    recognition = null
  }
}
