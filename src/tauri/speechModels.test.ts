import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
const FakeChannel = vi.hoisted(() => class FakeChannel<T> {
  onmessage: (event: T) => void = () => {}
})

vi.mock('@tauri-apps/api/core', () => ({ invoke, Channel: FakeChannel }))
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn() } }))

import {
  cancelSpeechModelDownload,
  deleteSpeechModel,
  downloadSpeechModel,
  listSpeechModels,
  selectSpeechModel,
  speechModelErrorCode,
} from './speechModels'

describe('speech model Tauri wrappers', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(undefined)
  })

  it('invokes list, select, delete and cancel with the expected arguments', async () => {
    await listSpeechModels()
    await selectSpeechModel('small')
    await deleteSpeechModel('turbo')
    await cancelSpeechModelDownload()
    expect(invoke.mock.calls).toEqual([
      ['speech_models_list', undefined],
      ['speech_model_select', { id: 'small' }],
      ['speech_model_delete', { id: 'turbo' }],
      ['speech_model_cancel_download', undefined],
    ])
  })

  it('downloads through a channel that forwards progress', async () => {
    const seen: number[] = []
    await downloadSpeechModel('small', p => seen.push(p.received))
    const [command, args] = invoke.mock.calls[0]
    expect(command).toBe('speech_model_download')
    expect(args.id).toBe('small')
    expect(args.onProgress).toBeInstanceOf(FakeChannel)
    args.onProgress.onmessage({ received: 5, total: 10 })
    expect(seen).toEqual([5])
  })

  it('maps error codes and falls back to download_failed', () => {
    expect(speechModelErrorCode('download_cancelled')).toBe('download_cancelled')
    expect(speechModelErrorCode(new Error('transcription_busy'))).toBe('transcription_busy')
    expect(speechModelErrorCode('weird')).toBe('download_failed')
  })
})
