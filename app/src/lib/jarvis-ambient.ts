export const JARVIS_AMBIENT_PATH = '/audio/jarvis-ambient.mp3'

const FADE_MS = 300

let ambientAudio: HTMLAudioElement | null = null
let fadeRaf: number | null = null

function getAudio(): HTMLAudioElement {
  if (!ambientAudio) {
    ambientAudio = new Audio(JARVIS_AMBIENT_PATH)
    ambientAudio.loop = true
    ambientAudio.preload = 'auto'
  }
  return ambientAudio
}

function cancelFade(): void {
  if (fadeRaf != null) {
    cancelAnimationFrame(fadeRaf)
    fadeRaf = null
  }
}

function fadeTo(target: number): void {
  cancelFade()
  const audio = getAudio()
  const start = audio.volume
  const delta = target - start
  if (Math.abs(delta) < 0.005) {
    audio.volume = target
    return
  }

  const startTime = performance.now()
  const tick = (now: number) => {
    const t = Math.min(1, (now - startTime) / FADE_MS)
    audio.volume = start + delta * t
    if (t < 1) {
      fadeRaf = requestAnimationFrame(tick)
    } else {
      fadeRaf = null
    }
  }
  fadeRaf = requestAnimationFrame(tick)
}

export async function startJarvisAmbient(volume: number): Promise<void> {
  const audio = getAudio()
  cancelFade()
  audio.volume = Math.max(0, Math.min(1, volume))
  if (audio.paused) {
    try {
      await audio.play()
    } catch {
      // Autoplay blocked until user gesture — retried on next active session
    }
  }
}

export function setJarvisAmbientVolume(volume: number): void {
  fadeTo(Math.max(0, Math.min(1, volume)))
}

export function stopJarvisAmbient(): void {
  cancelFade()
  const audio = getAudio()
  audio.pause()
  audio.currentTime = 0
}

export async function previewJarvisAmbient(volume: number): Promise<void> {
  const audio = getAudio()
  cancelFade()
  audio.volume = Math.max(0, Math.min(1, volume))
  audio.currentTime = 0
  await audio.play()
}

export function stopJarvisAmbientPreview(): void {
  stopJarvisAmbient()
}
