/** Encode AudioBuffer as 16-bit PCM WAV (Whisper-compatible). */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1
  const sampleRate = buffer.sampleRate
  const channel = buffer.numberOfChannels > 1
    ? mixToMono(buffer)
    : buffer.getChannelData(0)

  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = channel.length * bytesPerSample
  const headerSize = 44
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(arrayBuffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < channel.length; i++) {
    const sample = Math.max(-1, Math.min(1, channel[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length
  const mono = new Float32Array(length)
  const channels = buffer.numberOfChannels
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) mono[i] += data[i] / channels
  }
  return mono
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

/** Decode any browser-recorded blob (webm, mp4, etc.) to WAV for Whisper. */
export async function recordingBlobToWav(blob: Blob): Promise<Blob> {
  if (blob.type.includes('wav')) return blob

  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()

  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0))
    return audioBufferToWav(decoded)
  } finally {
    await audioCtx.close().catch(() => {})
  }
}

/** Pick the best MediaRecorder MIME type for this browser. */
export function getRecorderMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return ''
}
