export const JARVIS_SAMPLE_PATH = '/voices/jarvis-voice.wav'
export const JARVIS_TEST_PHRASE = 'Good evening. JARVIS online.'

let sampleAudio: HTMLAudioElement | null = null

export function playJarvisSample(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!sampleAudio) {
      sampleAudio = new Audio(JARVIS_SAMPLE_PATH)
    }
    sampleAudio.pause()
    sampleAudio.currentTime = 0
    sampleAudio.onended = () => resolve()
    sampleAudio.onerror = () =>
      reject(
        new Error(
          `JARVIS sample not found — add jarvis-voice.wav to app/public${JARVIS_SAMPLE_PATH}`
        )
      )
    void sampleAudio.play().catch(reject)
  })
}
