const MAX_AUDIO_BYTES = 16 * 1024 * 1024
const MAX_AUDIO_SECONDS = 30 * 60
const WAVEFORM_BUCKETS = 160
const DECODE_SAMPLE_RATE = 8000

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext

function audioContextConstructor(): AudioContextConstructor | null {
  const audioGlobal = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor }
  return audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext ?? null
}

async function readBoundedAudio(response: Response): Promise<ArrayBuffer | null> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES) {
    await response.body?.cancel().catch(() => {})
    return null
  }

  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteLength += value.byteLength
      if (byteLength > MAX_AUDIO_BYTES) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes.buffer
}

function peakBuckets(buffer: AudioBuffer): number[] | null {
  if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > MAX_AUDIO_SECONDS
    || !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1
    || !Number.isInteger(buffer.length) || buffer.length < 1) return null

  const peaks = new Array<number>(WAVEFORM_BUCKETS).fill(0)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel)
    for (let bucket = 0; bucket < WAVEFORM_BUCKETS; bucket++) {
      const start = Math.floor(bucket * buffer.length / WAVEFORM_BUCKETS)
      const end = Math.floor((bucket + 1) * buffer.length / WAVEFORM_BUCKETS)
      for (let index = start; index < end; index++) {
        const sample = samples[index]!
        if (Number.isFinite(sample)) peaks[bucket] = Math.max(peaks[bucket]!, Math.abs(sample))
      }
    }
  }

  const maximum = Math.max(...peaks)
  return maximum > 0 ? peaks.map(peak => peak / maximum) : peaks
}

/** Decodes a metadata-bounded audio resource into normalized channel-merged peaks. */
export async function loadAudioPeaks(
  src: string,
  signal: AbortSignal,
  durationSeconds: number,
): Promise<number[] | null> {
  if (signal.aborted || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0 || durationSeconds > MAX_AUDIO_SECONDS) return null
  const Context = audioContextConstructor()
  if (!Context) return null

  let context: AudioContext | null = null
  try {
    const response = await fetch(src, { signal })
    if (!response.ok || signal.aborted) return null
    const data = await readBoundedAudio(response)
    if (!data || signal.aborted) return null

    context = new Context({ sampleRate: DECODE_SAMPLE_RATE })
    const decoded = await context.decodeAudioData(data)
    if (signal.aborted) return null
    return peakBuckets(decoded)
  } catch {
    return null
  } finally {
    if (context) await context.close().catch(() => {})
  }
}
