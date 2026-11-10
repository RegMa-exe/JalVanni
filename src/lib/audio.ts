/**
 * Browser audio helpers.
 * MediaRecorder produces WebM/Opus, which is not a documented Prisma format,
 * so recordings are decoded and re-encoded as 16 kHz mono 16-bit PCM WAV.
 */

export const MAX_AUDIO_SECONDS = 30
export const SUPPORTED_UPLOAD_EXTENSIONS = ['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a'] as const
const TARGET_RATE = 16_000

async function decode(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext()
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    void ctx.close()
  }
}

/** Duration of any browser-decodable audio blob, in seconds. */
export async function getAudioDuration(blob: Blob): Promise<number> {
  return (await decode(blob)).duration
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)))
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/** Converts a recorded blob to 16 kHz mono WAV, trimmed to the 30 s REST limit. */
export async function toWav16kMono(blob: Blob): Promise<{ wav: Blob; durationSec: number }> {
  const decoded = await decode(blob)
  const duration = Math.min(decoded.duration, MAX_AUDIO_SECONDS)
  const frames = Math.ceil(duration * TARGET_RATE)
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination) // multi-channel input is down-mixed to mono
  src.start()
  const rendered = await offline.startRendering()
  return { wav: encodeWav(rendered.getChannelData(0), TARGET_RATE), durationSec: duration }
}
