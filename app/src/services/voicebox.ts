import { VOICE_CONFIG, isVoiceboxEnabled } from '@/config/voice'
import { getVoiceSettings } from '@/stores/voice-settings-store'
import { fetchWithTimeout, fetchWithTimeoutAndSignal } from '@/lib/fetch'
import { recordingBlobToWav } from '@/lib/audio'
import {
  isGenerationComplete,
  isGenerationFailed,
  parseVoiceboxEventBody,
} from '@/lib/sse'

const VOICEBOX_BASE = VOICE_CONFIG.voicebox.baseUrl

export interface VoiceboxHealth {
  status: string
  model_loaded?: boolean
  model_size?: string
  gpu_available?: boolean
}

export interface VoiceboxReadiness {
  stt: { ready: boolean; model_name?: string; display_name?: string }
  llm: { ready: boolean; model_name?: string; display_name?: string }
}

export interface VoiceboxModelEntry {
  model_name: string
  display_name: string
  loaded: boolean
  downloaded?: boolean
}

export interface VoiceboxServiceStatus {
  online: boolean
  sttReady: boolean
  ttsReady: boolean
  sttModel?: string
  ttsModel?: string
  error?: string
}

export interface TranscriptionResult {
  text: string
  duration: number
}

function isWhisperModel(name: string): boolean {
  return /whisper/i.test(name)
}

function isTtsModel(name: string): boolean {
  if (isWhisperModel(name)) return false
  return /tts|chatterbox|kokoro|tada|luxtts|qwen-tts/i.test(name)
}

export async function getVoiceboxStatus(): Promise<VoiceboxServiceStatus> {
  const fail = (error: string): VoiceboxServiceStatus => ({
    online: false,
    sttReady: false,
    ttsReady: false,
    error,
  })

  const settings = getVoiceSettings()
  const shouldProbe =
    isVoiceboxEnabled() &&
    (settings.voiceboxEnabled ||
      settings.sttFinalProvider === 'voicebox' ||
      settings.ttsProvider === 'voicebox')

  if (!shouldProbe) {
    return fail('Voicebox disabled')
  }

  try {
    const [healthRes, readyRes, modelsRes] = await Promise.allSettled([
      fetchWithTimeout(`${VOICEBOX_BASE}/health`, {}, 5000),
      fetchWithTimeout(`${VOICEBOX_BASE}/capture/readiness`, {}, 5000),
      fetchWithTimeout(`${VOICEBOX_BASE}/models/status`, {}, 15000),
    ])

    if (healthRes.status !== 'fulfilled' || !healthRes.value.ok) {
      return fail('Voicebox unreachable — open Voicebox and use npm run dev')
    }

    const health = (await healthRes.value.json()) as VoiceboxHealth
    if (health.status !== 'healthy') {
      return fail(`Voicebox status: ${health.status}`)
    }

    let sttReady = false
    let ttsReady = false
    let sttModel: string | undefined
    let ttsModel: string | undefined
    let readiness: VoiceboxReadiness | null = null

    if (readyRes.status === 'fulfilled' && readyRes.value.ok) {
      readiness = (await readyRes.value.json()) as VoiceboxReadiness
      if (readiness.stt?.ready) {
        sttReady = true
        sttModel = readiness.stt.display_name ?? readiness.stt.model_name
      }
    }

    if (modelsRes.status === 'fulfilled' && modelsRes.value.ok) {
      const data = (await modelsRes.value.json()) as { models?: VoiceboxModelEntry[] }
      const loaded = (data.models ?? []).filter(m => m.loaded)

      const whisper = loaded.find(m => isWhisperModel(m.model_name))
      if (whisper) {
        sttReady = true
        sttModel = sttModel ?? whisper.display_name ?? whisper.model_name
      }

      const tts = loaded.find(m => isTtsModel(m.model_name))
      if (tts) {
        ttsReady = true
        ttsModel = tts.display_name ?? tts.model_name
      }
    }

    // Tertiary: /health reports active TTS model (e.g. Qwen TTS 1.7B)
    if (!ttsReady && health.model_loaded) {
      ttsReady = true
      ttsModel = ttsModel ?? (health.model_size ? `Qwen TTS ${health.model_size}` : 'TTS')
    }

    // Trust readiness STT even if a different whisper variant is loaded in memory
    if (!sttReady && readiness?.stt?.ready) {
      sttReady = true
      sttModel = readiness.stt.display_name ?? readiness.stt.model_name
    }

    return { online: true, sttReady, ttsReady, sttModel, ttsModel }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    return fail(
      message.includes('abort')
        ? 'Voicebox timeout — is it running at 127.0.0.1:17493?'
        : `Cannot reach Voicebox: ${message}`
    )
  }
}

export async function checkVoiceboxHealth(): Promise<boolean> {
  const status = await getVoiceboxStatus()
  return status.online
}

export async function transcribeAudio(blob: Blob): Promise<TranscriptionResult> {
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

  const res = await fetchWithTimeout(
    `${VOICEBOX_BASE}/transcribe`,
    { method: 'POST', body: form },
    120_000
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(
      res.status === 502 || res.status === 503
        ? 'Whisper offline — open Voicebox Models tab and load Whisper'
        : `Transcription failed: ${err}`
    )
  }

  return res.json() as Promise<TranscriptionResult>
}

interface GenerationStatus {
  id?: string
  status: string
  error?: string | null
}

let activeSpeakAbort: AbortController | null = null

/** Best-effort — server-side audio may finish one buffer after cancel. */
export function cancelVoiceboxSpeech(): void {
  activeSpeakAbort?.abort()
  activeSpeakAbort = null
}

async function waitForGeneration(
  id: string,
  timeoutMs = 120_000,
  signal?: AbortSignal
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new DOMException('Speech cancelled', 'AbortError')
    }

    const statusRes = await fetchWithTimeoutAndSignal(
      `${VOICEBOX_BASE}/generate/${id}/status`,
      { headers: { Accept: 'text/event-stream, application/json' } },
      30_000,
      signal
    )

    if (!statusRes.ok) break

    const body = await statusRes.text()
    const status = parseVoiceboxEventBody<GenerationStatus>(body)

    if (status) {
      if (isGenerationComplete(status.status)) return
      if (isGenerationFailed(status.status)) {
        throw new Error(status.error ?? 'Speech generation failed')
      }
    }

    await new Promise(r => setTimeout(r, 400))
  }
}

export async function speakText(text: string, profile?: string): Promise<void> {
  activeSpeakAbort?.abort()
  const controller = new AbortController()
  activeSpeakAbort = controller

  try {
    const res = await fetchWithTimeoutAndSignal(
      `${VOICEBOX_BASE}/speak`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.slice(0, 10000),
          profile: profile ?? undefined,
          language: 'en',
        }),
      },
      30_000,
      controller.signal
    )

    if (!res.ok) {
      const err = await res.text()
      throw new Error(
        res.status === 502 || res.status === 503
          ? 'TTS offline — open Voicebox Models tab and load a TTS model'
          : `Speech failed: ${err}`
      )
    }

    const initial = (await res.json()) as GenerationStatus & { id: string }
    if (isGenerationComplete(initial.status)) return
    if (!initial.id) return

    await waitForGeneration(initial.id, 120_000, controller.signal)
  } finally {
    if (activeSpeakAbort === controller) {
      activeSpeakAbort = null
    }
  }
}

export async function llmGenerate(prompt: string, system?: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${VOICEBOX_BASE}/llm/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        system: system ?? undefined,
        max_tokens: 512,
        temperature: 0.7,
      }),
    },
    60_000
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LLM failed: ${err}`)
  }

  const data = (await res.json()) as { text: string }
  return data.text.trim()
}
