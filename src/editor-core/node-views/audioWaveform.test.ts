import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadAudioPeaks } from './audioWaveform'

function audioBuffer(channels: Float32Array[], duration = 1): AudioBuffer {
  return {
    duration,
    length: channels[0]?.length ?? 0,
    numberOfChannels: channels.length,
    getChannelData: (index: number) => channels[index]!,
  } as AudioBuffer
}

function response(chunks: Uint8Array[], headers = new Headers()): Response {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  }), { status: 200, headers })
}

function installAudioContext(decoded: AudioBuffer | Error) {
  const close = vi.fn(async () => {})
  const decodeAudioData = vi.fn(async () => {
    if (decoded instanceof Error) throw decoded
    return decoded
  })
  const constructor = vi.fn(function (this: object, _options?: AudioContextOptions) {
    Object.assign(this, { close, decodeAudioData })
  })
  vi.stubGlobal('AudioContext', constructor)
  return { close, decodeAudioData, constructor }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('loadAudioPeaks', () => {
  it('returns 160 normalized peak buckets across all channels and closes the low-rate context', async () => {
    const left = new Float32Array(320)
    const right = new Float32Array(320)
    left[10] = 0.5
    left[200] = -0.25
    right[50] = 1
    const context = installAudioContext(audioBuffer([left, right], 0.04))
    vi.stubGlobal('fetch', vi.fn(async () => response([new Uint8Array([1, 2, 3])])))

    const peaks = await loadAudioPeaks('http://media.test/audio', new AbortController().signal, 0.04)

    expect(peaks).toHaveLength(160)
    expect(peaks?.[5]).toBe(0.5)
    expect(peaks?.[25]).toBe(1)
    expect(peaks?.[100]).toBe(0.25)
    expect(context.constructor).toHaveBeenCalledWith({ sampleRate: 8000 })
    expect(context.decodeAudioData).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('returns null without fetching when already aborted', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    controller.abort()

    await expect(loadAudioPeaks('http://media.test/audio', controller.signal, 1)).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not create a decoder when aborted while reading the response', async () => {
    const controller = new AbortController()
    const body = new ReadableStream<Uint8Array>({
      pull(stream) {
        controller.abort()
        stream.enqueue(new Uint8Array([1]))
        stream.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
    const context = installAudioContext(audioBuffer([new Float32Array(10)]))

    await expect(loadAudioPeaks('http://media.test/audio', controller.signal, 1)).resolves.toBeNull()
    expect(context.constructor).not.toHaveBeenCalled()
    expect(context.decodeAudioData).not.toHaveBeenCalled()
  })

  it('rejects declared oversized responses before reading or decoding', async () => {
    const cancel = vi.fn(async () => {})
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-length': String(16 * 1024 * 1024 + 1) }),
      body: { cancel },
    })))
    const context = installAudioContext(audioBuffer([new Float32Array(10)]))

    await expect(loadAudioPeaks('http://media.test/large', new AbortController().signal, 1)).resolves.toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
    expect(context.decodeAudioData).not.toHaveBeenCalled()
    expect(context.close).not.toHaveBeenCalled()
  })

  it('cancels a stream that exceeds the byte limit when Content-Length is absent', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(16 * 1024 * 1024))
        controller.enqueue(new Uint8Array(1))
      },
      cancel() { cancelled = true },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
    const context = installAudioContext(audioBuffer([new Float32Array(10)]))

    await expect(loadAudioPeaks('http://media.test/large', new AbortController().signal, 1)).resolves.toBeNull()
    expect(cancelled).toBe(true)
    expect(context.decodeAudioData).not.toHaveBeenCalled()
  })

  it('returns null for unsupported contexts, malformed audio and decode errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([new Uint8Array([1])])))
    await expect(loadAudioPeaks('http://media.test/audio', new AbortController().signal, 1)).resolves.toBeNull()

    const context = installAudioContext(new Error('decode failed'))
    await expect(loadAudioPeaks('http://media.test/audio', new AbortController().signal, 1)).resolves.toBeNull()
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('returns null for overlong decoded audio and aborts that resolves during native decoding', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([new Uint8Array([1])])))
    const longContext = installAudioContext(audioBuffer([new Float32Array(10)], 30 * 60 + 1))
    await expect(loadAudioPeaks('http://media.test/long', new AbortController().signal, 1)).resolves.toBeNull()
    expect(longContext.close).toHaveBeenCalledOnce()

    const controller = new AbortController()
    const abortContext = installAudioContext(audioBuffer([new Float32Array(10)]))
    abortContext.decodeAudioData.mockImplementationOnce(async () => {
      controller.abort()
      return audioBuffer([new Float32Array(10)])
    })
    await expect(loadAudioPeaks('http://media.test/audio', controller.signal, 1)).resolves.toBeNull()
    expect(abortContext.close).toHaveBeenCalledOnce()
  })

  it('rejects missing, invalid and overlong metadata before fetching or creating a decoder', async () => {
    const fetch = vi.fn(async () => response([new Uint8Array([1])] ))
    vi.stubGlobal('fetch', fetch)
    const context = installAudioContext(audioBuffer([new Float32Array(10)]))
    const durations = [undefined, 0, -1, NaN, Infinity, 30 * 60 + 1]

    for (const duration of durations) {
      await expect(loadAudioPeaks(
        'http://media.test/audio',
        new AbortController().signal,
        duration as number,
      )).resolves.toBeNull()
    }

    expect(fetch).not.toHaveBeenCalled()
    expect(context.constructor).not.toHaveBeenCalled()
    expect(context.decodeAudioData).not.toHaveBeenCalled()
  })
})
