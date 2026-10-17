import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
const FakeChannel = vi.hoisted(() => class FakeChannel<T> {
  onmessage: (event: T) => void = () => {}
})

vi.mock('@tauri-apps/api/core', () => ({ invoke, Channel: FakeChannel }))
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn() } }))

import { cancelDictation, dictationErrorCode, isDictationSupported, startDictation, stopDictation } from './dictation'
import type { DictationEvent } from './dictation'

describe('dictation Tauri wrappers', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(undefined)
    delete document.documentElement.dataset.platform
  })

  it('starts with a null language for auto and forwards channel events', async () => {
    const events: DictationEvent[] = []
    await startDictation('auto', e => events.push(e))

    const [command, args] = invoke.mock.calls[0]
    expect(command).toBe('dictation_start')
    expect(args.language).toBeNull()
    expect(args.onEvent).toBeInstanceOf(FakeChannel)

    const event: DictationEvent = { kind: 'partial', text: 'hello' }
    args.onEvent.onmessage(event)
    expect(events).toEqual([event])
  })

  it('passes an explicit language through', async () => {
    await startDictation('ru', () => {})
    expect(invoke.mock.calls[0][1].language).toBe('ru')
  })

  it('invokes stop and cancel without arguments', async () => {
    await stopDictation()
    await cancelDictation()
    expect(invoke).toHaveBeenNthCalledWith(1, 'dictation_stop', undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'dictation_cancel', undefined)
  })

  it('rethrows command failures', async () => {
    invoke.mockRejectedValueOnce('no_device')
    await expect(startDictation('en', () => {})).rejects.toBe('no_device')
  })

  it('maps rejected values to error codes', () => {
    expect(dictationErrorCode('transcription_busy')).toBe('transcription_busy')
    expect(dictationErrorCode(new Error('permission_denied'))).toBe('permission_denied')
    expect(dictationErrorCode('recording_failed: boom')).toBe('recording_failed')
    expect(dictationErrorCode(null)).toBe('recording_failed')
  })

  it('is supported only on desktop platforms', () => {
    expect(isDictationSupported()).toBe(false)
    document.documentElement.dataset.platform = 'linux'
    expect(isDictationSupported()).toBe(true)
    document.documentElement.dataset.platform = 'android'
    expect(isDictationSupported()).toBe(false)
  })
})
