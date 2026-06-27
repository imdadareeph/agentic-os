import { fetchWithTimeout } from '@/lib/fetch'
import { recordingBlobToWav } from '@/lib/audio'
import { getVoiceSettings } from '@/stores/voice-settings-store'

export interface WhisperStatus {
  online: boolean
  model?: string
  error?: string
}

export interface TranscriptionResult {
  text: string
  duration?: number
}

const OFFLINE_CACHE_MS = 45_000
const ONLINE_CACHE_MS = 20_000

let cachedStatus: WhisperStatus | null = null
let cachedAt = 0

function cacheStatus(status: WhisperStatus): WhisperStatus {
  cachedStatus = status
  cachedAt = Date.now()
  return status
}

/** Last known Whisper availability — avoids hammering :9000 when Docker is down. */
export function peekWhisperStatus(): WhisperStatus | null {
  if (!cachedStatus) return null
  const ttl = cachedStatus.online ? ONLINE_CACHE_MS : OFFLINE_CACHE_MS
  if (Date.now() - cachedAt > ttl) return null
  return cachedStatus
}

export function invalidateWhisperStatusCache(): void {
  cachedStatus = null
  cachedAt = 0
}

export async function getWhisperStatus(force = false): Promise<WhisperStatus> {
  if (!force) {
    const cached = peekWhisperStatus()
    if (cached) return cached
  }

  const { whisperBaseUrl, whisperModel } = getVoiceSettings()
  try {
    const res = await fetchWithTimeout(`${whisperBaseUrl}/v1/models`, {}, 3000)
    if (!res.ok) {
      return cacheStatus({
        online: false,
        error: `Whisper unreachable (${res.status}) — run npm run voice:whisper`,
      })
    }

    const data = (await res.json()) as { data?: { id: string }[] }
    const model = data.data?.[0]?.id ?? whisperModel
    return cacheStatus({ online: true, model })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    return cacheStatus({
      online: false,
      error: message.includes('abort')
        ? 'Whisper timeout — start Docker Whisper on port 9000'
        : `Cannot reach Whisper: ${message}`,
    })
  }
}

export async function transcribeAudio(blob: Blob): Promise<TranscriptionResult> {
  const cached = peekWhisperStatus()
  if (cached && !cached.online) {
    throw new Error('Whisper server not running on port 9000')
  }

  const { whisperBaseUrl, whisperModel } = getVoiceSettings()

  let wav: Blob
  try {
    wav = await recordingBlobToWav(blob)
  } catch {
    throw new Error(
      'Could not decode microphone audio — try Chrome or hold the mic longer before releasing'
    )
  }

  const form = new FormData()
  form.append('file', wav, 'recording.wav')
  form.append('model', whisperModel)
  form.append('response_format', 'json')

  const res = await fetchWithTimeout(
    `${whisperBaseUrl}/v1/audio/transcriptions`,
    { method: 'POST', body: form },
    120_000
  )

  if (!res.ok) {
    const err = (await res.text()).trim()
    throw new Error(
      res.status === 502 || res.status === 503 || !err
        ? 'Whisper server not running on port 9000'
        : `Transcription failed: ${err}`
    )
  }

  const data = (await res.json()) as { text: string; duration?: number }
  return { text: data.text, duration: data.duration }
}
